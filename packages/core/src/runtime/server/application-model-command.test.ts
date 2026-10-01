import { expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphStorage,
  createRecursiveEntityView,
  field,
  graphSchema,
  query,
  Selection,
  toGraphCommandRequest,
  toGraphReadRequest,
} from '../../data-graph/index.js';

import { createApplicationModelCommandRuntime } from './application-model-command.js';
import { entity } from './entity.js';
import type { ModelRequest } from './model-interpretation.js';
import { ontahi } from './ontahi.js';

it('binds model scope reads to application policies and the current authority', async () => {
  const Document = entity({ name: 'Document', fields: { id: field.id(), title: field.string() } });
  const application = ontahi({
    entities: [Document],
    storage: createInMemoryDataGraphStorage({
      dataset: { Document: [{ id: 'document-1', title: 'Visible' }] },
    }),
  });
  const authority = vi.fn(() => ({ subject: 'reader' }));
  const authorize = vi.fn();
  const modelRead = toGraphReadRequest(query(Document).limit(10), 'run');
  const generate = vi.fn(async ({ context }: { context: string }) => {
    expect(JSON.parse(context).context).toEqual({
      documents: [{ id: 'document-1', title: 'Visible' }],
    });
    return { status: 'resolved', request: modelRead };
  });
  const readPolicy = {
    entity: Document,
    modes: ['get', 'run', 'count'],
    cardinalities: ['one', 'many'],
    maxLimit: 10,
    fields: { id: { select: true }, title: { select: true, filter: ['eq'], order: true } },
    scope: ({ authority: current }: { authority: { subject: string } }) => {
      expect(current).toEqual({ subject: 'reader' });
      return Selection.all(Document);
    },
  } as const;
  const runtime = createApplicationModelCommandRuntime({
    application,
    provider: { generate },
    authorize,
    graph: {
      authority,
      reads: [readPolicy],
    },
    scope: async (_request, signal, graph) => {
      const response = await graph.read!(
        toGraphReadRequest(
          query(Document).as(
            createRecursiveEntityView(Document, 'ModelDocument', { id: true, title: true }),
          ),
          'run',
        ),
        signal,
      );
      if (response.kind !== 'graph-read-result') throw new Error('Expected graph read result.');
      return { context: { documents: response.value }, bindings: {} };
    },
  });

  await expect(
    runtime.submit({ text: 'Read documents' }, new AbortController().signal),
  ).resolves.toEqual({
    status: 'executed',
    message: '1 document record.',
    request: modelRead,
    response: {
      kind: 'graph-read-result',
      value: [{ id: 'document-1', title: 'Visible' }],
    },
  });
  expect(authority).toHaveBeenCalledTimes(3);
  expect(authorize).toHaveBeenCalledTimes(2);
});

it('does not expose graph services that were not configured', async () => {
  const Document = entity({ name: 'Document', fields: { id: field.id() } });
  const application = ontahi({
    entities: [Document],
    storage: createInMemoryDataGraphStorage({ dataset: { Document: [] } }),
  });
  const runtime = createApplicationModelCommandRuntime({
    application,
    provider: { generate: async () => ({ status: 'help' }) },
    authorize: () => undefined,
    graph: { authority: () => undefined },
  });

  await expect(
    runtime.submit({ text: 'help' }, new AbortController().signal),
  ).resolves.toMatchObject({ status: 'answered' });
});

it('customizes an inferred read affordance without rebuilding its request schema', async () => {
  const Document = entity({ name: 'Document', fields: { id: field.id(), title: field.string() } });
  const application = ontahi({
    entities: [Document],
    storage: createInMemoryDataGraphStorage({ dataset: { Document: [] } }),
  });
  const generate = vi.fn(async ({ outputSchema }: ModelRequest) => {
    expect(outputSchema).toHaveProperty('anyOf.0.properties.request.properties.limit.const', 5);
    expect(JSON.stringify(outputSchema)).not.toContain('"const":"count"');
    return { status: 'help' as const };
  });
  const runtime = createApplicationModelCommandRuntime({
    application,
    provider: { generate },
    authorize: () => undefined,
    graph: {
      authority: () => undefined,
      reads: [
        {
          policy: {
            entity: Document,
            modes: ['run', 'count'],
            cardinalities: ['many'],
            maxLimit: 10,
            fields: {
              id: { select: true, filter: ['eq'] },
              title: { select: true, filter: ['eq'], order: true },
            },
            scope: 'all',
          },
          narrow: { modes: ['run'], equals: ['title'], orderBy: [], limit: 5 },
          presentation: ({ mode, request, data }) => {
            expect(mode).toBe('run');
            expect(request.text).toBe('help');
            expect(data).toBeUndefined();
            return { description: 'Browse the document library.' };
          },
        },
      ],
    },
  });

  await expect(runtime.submit({ text: 'help' }, new AbortController().signal)).resolves.toEqual({
    status: 'answered',
    message: 'You can:\n• Browse the document library.',
  });
});

it('rejects graph configuration unsupported by the application surface', () => {
  const Document = entity({ name: 'Document', fields: { id: field.id() } });
  const application = ontahi({
    entities: [Document],
    storage: createInMemoryDataGraphStorage({ dataset: { Document: [] } }),
  });
  const common = {
    provider: { generate: async () => ({ status: 'help' }) },
    authorize: () => undefined,
    scope: async () => ({ context: {}, bindings: {} }),
  };

  expect(() =>
    createApplicationModelCommandRuntime({
      ...common,
      application: { ...application, createGraphReadDispatcher: undefined } as never,
      graph: { authority: () => undefined, readPolicies: [] },
    }),
  ).toThrow('Model graph reads require a graph-readable Ontahi application.');
  expect(() =>
    createApplicationModelCommandRuntime({
      ...common,
      application: { ...application, createGraphCommandDispatcher: undefined } as never,
      graph: { authority: () => undefined, commandPolicies: [] },
    }),
  ).toThrow('Model graph commands require a graph-commandable Ontahi application.');
});

it('executes model graph commands through the application policy dispatcher', async () => {
  const Document = entity({ name: 'Document', fields: { id: field.id(), title: field.string() } });
  const storage = createInMemoryDataGraphStorage({
    dataset: { Document: [{ id: 'document-1', title: 'Before' }] },
  });
  const application = ontahi({ entities: [Document], storage });
  const target = createEntityRef(Document, { id: 'document-1' });
  const command = toGraphCommandRequest({
    kind: 'entity-mutation-command',
    action: 'update',
    entityName: 'Document',
    target,
    values: { title: 'After' },
    if: { title: 'Before' },
  });
  const commandSchema = graphSchema.object(
    {
      version: graphSchema.literal(2),
      kind: graphSchema.literal('graph-command'),
      command: graphSchema.object(
        {
          kind: graphSchema.literal('entity-mutation-command'),
          action: graphSchema.literal('update'),
          entityName: graphSchema.literal('Document'),
          target: graphSchema.ref(Document),
          values: graphSchema.object({ title: Document.fields.title }, { unknownKeys: 'strict' }),
          if: graphSchema.object({ title: Document.fields.title }, { unknownKeys: 'strict' }),
        },
        { unknownKeys: 'strict' },
      ),
    },
    { unknownKeys: 'strict' },
  );
  const commandPolicy = {
    entity: Document,
    scope: 'all',
    actions: {
      update: { fields: ['title'], if: ['title'], result: ['id', 'title'] },
    },
  } as const;
  const runtime = createApplicationModelCommandRuntime<
    { subject: string },
    { visibleDocumentIds: string[] }
  >({
    application,
    provider: {
      generate: async ({ context }) => {
        expect(context).not.toContain('visibleDocumentIds');
        return { status: 'resolved', request: command };
      },
    },
    authorize: () => undefined,
    graph: {
      authority: () => ({ subject: 'editor' }),
      commands: [
        {
          policies: commandPolicy,
          expose: ({ request, data }) => {
            expect(request.text).toBe('rename the document');
            expect(data).toEqual({ visibleDocumentIds: ['document-1'] });
            return {
              description: 'Rename a document.',
              request: commandSchema,
              validate: () => undefined,
            };
          },
        },
      ],
    },
    scope: async (_request, _signal, graph) => {
      expect(graph).toEqual({});
      return {
        data: { visibleDocumentIds: ['document-1'] },
        context: {},
        bindings: {},
      };
    },
  });

  await expect(
    runtime.submit({ text: 'rename the document' }, new AbortController().signal),
  ).resolves.toEqual({ status: 'executed', message: 'Updated.', request: command });
  expect(storage.dataset.Document).toEqual([{ id: 'document-1', title: 'After' }]);
});

it('infers model mutation exposures directly from an entity command policy', async () => {
  const Document = entity({ name: 'Document', fields: { id: field.id(), title: field.string() } });
  const storage = createInMemoryDataGraphStorage({ dataset: { Document: [] } });
  const application = ontahi({ entities: [Document], storage });
  const command = toGraphCommandRequest({
    kind: 'entity-mutation-command',
    action: 'create',
    entityName: 'Document',
    values: { id: 'document-1', title: 'First' },
  });
  const runtime = createApplicationModelCommandRuntime({
    application,
    provider: { generate: async () => ({ status: 'resolved', request: command }) },
    authorize: () => undefined,
    graph: {
      authority: () => undefined,
      commands: [
        {
          entity: Document,
          scope: 'all',
          actions: {
            create: { fields: ['id', 'title'], result: ['id', 'title'] },
            update: {
              fields: ['title'],
              if: ['title'],
              result: ['id', 'title'],
            },
            delete: { if: ['title'], result: ['id', 'title'] },
          },
        },
      ],
    },
  });

  await expect(
    runtime.submit({ text: 'create a document' }, new AbortController().signal),
  ).resolves.toEqual({ status: 'executed', message: 'Document created.', request: command });
  expect(storage.dataset.Document).toEqual([{ id: 'document-1', title: 'First' }]);
});
