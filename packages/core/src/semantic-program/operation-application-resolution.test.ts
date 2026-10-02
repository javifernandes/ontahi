import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  field,
  graphSchema,
  type GraphReadPolicy,
} from '../data-graph/index.js';
import { entity, ontahi } from '../runtime/server/index.js';

import { resolveOperationApplicationHole } from './operation-application-resolution.js';
import {
  lowerOperationApplication,
  normalizeOperationApplication,
  type OperationApplicationContract,
} from './operation-application.js';

const TodoList = entity({
  name: 'SemanticProgramResolutionTodoList',
  fields: { id: field.id(), name: field.string(), privateNote: field.string() },
  operations: ({ operation, self }) => ({
    completeAll: operation({
      input: graphSchema.object({ list: graphSchema.ref(self) }),
      output: field.number(),
      run: () => Effect.succeed(0),
    }),
  }),
});

const createFixture = (rows: readonly Record<string, unknown>[], scope: 'all' | 'none' = 'all') => {
  const application = ontahi({
    entities: [TodoList],
    storage: createInMemoryDataGraphStorage({
      dataset: { SemanticProgramResolutionTodoList: [...rows] },
    }),
  });
  const policy = {
    entity: TodoList,
    modes: ['run'],
    cardinalities: ['many'],
    maxLimit: 10,
    fields: { id: { select: true } },
    scope: scope === 'all' ? 'all' : () => ({ kind: 'not', operand: { kind: 'all' } }),
  } as const satisfies GraphReadPolicy<typeof TodoList, { subject: string }>;
  const read = application.createGraphReadDispatcher([policy]);
  const operation = application.graph.getOperation(
    'SemanticProgramResolutionTodoList.completeAll',
  )!;
  if (operation.input?.kind !== 'schema.object') throw new Error('Expected object input schema.');
  const contract = operation as unknown as OperationApplicationContract;

  return {
    application,
    contract,
    open: normalizeOperationApplication(contract),
    resolve: (holeId = 'list') =>
      resolveOperationApplicationHole({
        graph: application.graph,
        read,
        authority: { subject: 'reader' },
        application: normalizeOperationApplication(contract),
        holeId,
      }),
  };
};

describe('Operation application Hole resolution', () => {
  it('auto-binds one authorized Entity Ref candidate and lowers through the real Operation', async () => {
    const fixture = createFixture([
      { id: 'list-inbox', name: 'Inbox', privateNote: 'not projected' },
    ]);

    const result = await fixture.resolve();

    expect(result).toEqual({
      status: 'bound',
      application: {
        kind: 'operation-application',
        operationId: fixture.contract.id,
        arguments: {
          list: {
            kind: 'value',
            value: {
              kind: 'entity-ref',
              entityName: 'SemanticProgramResolutionTodoList',
              locator: { id: 'list-inbox' },
            },
          },
        },
      },
      candidate: {
        value: {
          kind: 'entity-ref',
          entityName: 'SemanticProgramResolutionTodoList',
          locator: { id: 'list-inbox' },
        },
        provenance: {
          kind: 'authorized-graph-read',
          entityName: 'SemanticProgramResolutionTodoList',
        },
      },
    });
    if (result.status !== 'bound') return;
    expect(lowerOperationApplication(fixture.contract, result.application)).toEqual({
      success: true,
      request: {
        kind: 'invoke',
        operationId: fixture.contract.id,
        input: { list: result.candidate.value },
      },
    });
  });

  it('returns neutral authorized candidates when a person or surface must choose', async () => {
    const fixture = createFixture([
      { id: 'list-inbox', name: 'Inbox', privateNote: 'private' },
      { id: 'list-later', name: 'Later', privateNote: 'private' },
    ]);

    await expect(fixture.resolve()).resolves.toMatchObject({
      status: 'choice',
      holeId: 'list',
      candidates: [
        { value: { locator: { id: 'list-inbox' } } },
        { value: { locator: { id: 'list-later' } } },
      ],
    });
  });

  it('keeps the application open when no authorized candidate exists', async () => {
    const fixture = createFixture(
      [{ id: 'list-inbox', name: 'Inbox', privateNote: 'private' }],
      'none',
    );

    await expect(fixture.resolve()).resolves.toEqual({
      status: 'unresolved',
      holeId: 'list',
      reason: 'no-candidates',
    });
  });

  it('does not bypass a missing read policy', async () => {
    const fixture = createFixture([{ id: 'list-inbox', name: 'Inbox', privateNote: 'private' }]);
    const denied = fixture.application.createGraphReadDispatcher([]);

    await expect(
      resolveOperationApplicationHole({
        graph: fixture.application.graph,
        read: denied,
        authority: { subject: 'reader' },
        application: fixture.open,
        holeId: 'list',
      }),
    ).resolves.toEqual({
      status: 'unresolved',
      holeId: 'list',
      reason: 'access-denied',
    });
  });

  it('reports unknown Operations, holes, unsupported values, and unavailable reads', async () => {
    const fixture = createFixture([]);
    const unknownOperation = { ...fixture.open, operationId: 'TodoList.missing' };
    await expect(
      resolveOperationApplicationHole({
        graph: fixture.application.graph,
        read: fixture.application.createGraphReadDispatcher([]),
        authority: { subject: 'reader' },
        application: unknownOperation,
        holeId: 'list',
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'unknown-operation' });
    await expect(fixture.resolve('missing')).resolves.toMatchObject({
      status: 'unresolved',
      reason: 'unknown-hole',
    });

    const scalarContract = {
      id: 'Document.rename',
      input: graphSchema.object({ name: field.string() }),
    };
    await expect(
      resolveOperationApplicationHole({
        graph: { getOperation: () => scalarContract },
        read: vi.fn(),
        authority: { subject: 'reader' },
        application: normalizeOperationApplication(scalarContract),
        holeId: 'name',
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'unsupported-hole' });

    await expect(
      resolveOperationApplicationHole({
        graph: fixture.application.graph,
        read: vi.fn(async () => ({
          kind: 'protocol-error',
          error: { code: 'execution_unavailable', message: 'Unavailable.' },
        })) as never,
        authority: { subject: 'reader' },
        application: fixture.open,
        holeId: 'list',
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'resolution-unavailable' });

    await expect(
      resolveOperationApplicationHole({
        graph: fixture.application.graph,
        read: vi.fn(async () => ({
          kind: 'graph-read-capabilities-result',
          entityName: TodoList.name,
          capabilities: { orderBy: [] },
        })) as never,
        authority: { subject: 'reader' },
        application: fixture.open,
        holeId: 'list',
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'resolution-unavailable' });

    await expect(
      resolveOperationApplicationHole({
        graph: fixture.application.graph,
        read: vi.fn(async () => ({ kind: 'graph-read-result', value: [{}] })) as never,
        authority: { subject: 'reader' },
        application: fixture.open,
        holeId: 'list',
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'resolution-unavailable' });
  });
});
