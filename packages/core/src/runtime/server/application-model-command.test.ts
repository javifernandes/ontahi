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
  const generate = vi.fn(async ({ context }: { context: string }) => {
    expect(JSON.parse(context).context).toEqual({
      documents: [{ id: 'document-1', title: 'Visible' }],
    });
    return { status: 'help' };
  });
  const runtime = createApplicationModelCommandRuntime({
    application,
    provider: { generate },
    authorize,
    graph: {
      authority,
      readPolicies: [
        {
          entity: Document,
          modes: ['run'],
          cardinalities: ['many'],
          maxLimit: 10,
          fields: { id: { select: true }, title: { select: true } },
          scope: ({ authority: current }) => {
            expect(current).toEqual({ subject: 'reader' });
            return Selection.all(Document);
          },
        },
      ],
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
    runtime.submit({ text: 'What can I do?' }, new AbortController().signal),
  ).resolves.toEqual({ status: 'answered', message: 'You can:\n' });
  expect(authority).toHaveBeenCalledOnce();
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
    scope: async (_request, _signal, graph) => {
      expect(graph).toEqual({});
      return { context: {}, bindings: {} };
    },
  });

  await expect(
    runtime.submit({ text: 'help' }, new AbortController().signal),
  ).resolves.toMatchObject({ status: 'answered' });
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
  const runtime = createApplicationModelCommandRuntime({
    application,
    provider: { generate: async () => ({ status: 'resolved', request: command }) },
    authorize: () => undefined,
    graph: {
      authority: () => ({ subject: 'editor' }),
      commandPolicies: [
        {
          entity: Document,
          scope: 'all',
          actions: {
            update: { fields: ['title'], if: ['title'], result: ['id', 'title'] },
          },
        },
      ],
    },
    scope: async (_request, _signal, graph) => {
      expect(graph).toEqual({});
      return {
        context: {},
        bindings: {},
        commands: [
          {
            description: 'Rename a document.',
            request: commandSchema,
            validate: () => undefined,
          },
        ],
      };
    },
  });

  await expect(
    runtime.submit({ text: 'rename the document' }, new AbortController().signal),
  ).resolves.toEqual({ status: 'executed', message: 'Updated.', request: command });
  expect(storage.dataset.Document).toEqual([{ id: 'document-1', title: 'After' }]);
});
