import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createGraphCommandDispatcher,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  defineClientEntity,
  entity,
  field,
  mutateEntity,
  type InMemoryDataset,
} from './index.js';

const defineBookGraph = () => {
  const Book = entity('Book', {
    id: field.id(),
    title: field.string(),
    published: field.boolean(),
  });
  return { Book };
};

const policyFor = (graph: ReturnType<typeof defineBookGraph>) => ({
  entity: graph.Book,
  scope: 'all' as const,
  actions: {
    create: {
      fields: ['id', 'title', 'published'] as const,
      result: ['id', 'title', 'published'] as const,
    },
    update: {
      fields: ['title', 'published'] as const,
      result: ['id', 'title', 'published'] as const,
    },
    delete: { result: ['id', 'title', 'published'] as const },
  },
});

describe('Entity Mutation Command runtime routing', () => {
  it('produces identical deltas and state through direct and remote execution', async () => {
    const client = defineBookGraph();
    const directGraph = defineBookGraph();
    const server = defineBookGraph();
    const directDataset: InMemoryDataset = {
      Book: [{ id: 'book-1', title: 'Draft', published: false }],
    };
    const serverDataset: InMemoryDataset = {
      Book: [{ id: 'book-1', title: 'Draft', published: false }],
    };
    const directRuntime = createInMemoryDataGraphRuntime({
      dataset: directDataset,
      entities: [directGraph.Book],
    });
    const serverRuntime = createInMemoryDataGraphRuntime({
      dataset: serverDataset,
      entities: [server.Book],
    });
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(server)],
      executeEntityMutation: command =>
        Effect.runPromise(serverRuntime.runEntityMutationCommand(command)),
    });
    const commandTransport = vi.fn((request: unknown) =>
      dispatch(JSON.parse(JSON.stringify(request)), { authority: undefined }).then(response =>
        JSON.parse(JSON.stringify(response)),
      ),
    );
    const remote = createRemoteDataGraphRuntime({ transport: vi.fn(), commandTransport });
    const DirectBook = createRuntimeBoundDataGraphApi(() => directRuntime).bindClientEntity(
      defineClientEntity(directGraph.Book),
    );
    const RemoteBook = createRuntimeBoundDataGraphApi(() => remote).bindClientEntity(
      defineClientEntity(client.Book),
    );

    const directDelta = await Effect.runPromise(
      DirectBook.refById('book-1').update({ title: 'Revised' }).run(),
    );
    const remoteDelta = await Effect.runPromise(
      RemoteBook.refById('book-1').update({ title: 'Revised' }).run(),
    );

    expect(remoteDelta).toEqual(directDelta);
    expect(serverDataset).toEqual(directDataset);
    expect(commandTransport).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, kind: 'graph-command' }),
      undefined,
    );
  });

  it('preserves exact-cardinality rejections through the remote boundary', async () => {
    const graph = defineBookGraph();
    const command = mutateEntity(graph.Book).delete(createEntityRef(graph.Book, { id: 'missing' }));
    const remote = createRemoteDataGraphRuntime({
      transport: vi.fn(),
      commandTransport: async () => ({
        kind: 'graph-command-rejection',
        diagnostic: {
          reason: 'entity_mutation_cardinality_mismatch',
          rejection: {
            version: 1,
            code: 'entity_mutation_cardinality_mismatch',
            message: 'Entity mutation target did not resolve exactly once.',
            parameters: { entityName: 'Book', action: 'delete' },
          },
        },
      }),
    });

    await expect(
      Effect.runPromise(remote.runEntityMutationCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        code: 'entity_mutation_cardinality_mismatch',
        diagnostic: { reason: 'entity_mutation_cardinality_mismatch' },
      },
    });
  });

  it('rejects malformed remote Entity mutation deltas', async () => {
    const graph = defineBookGraph();
    const command = mutateEntity(graph.Book).create({
      id: 'book-1',
      title: 'Ontahi',
      published: false,
    });
    const remote = createRemoteDataGraphRuntime({
      transport: vi.fn(),
      commandTransport: async () => ({
        kind: 'graph-command-result',
        value: { created: [], updated: [], deleted: [] },
      }),
    });

    await expect(
      Effect.runPromise(remote.runEntityMutationCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({ _tag: 'Left', left: { code: 'invalid_response' } });
  });

  it('rejects a remote update delta for another Ref of the same Entity', async () => {
    const graph = defineBookGraph();
    const command = mutateEntity(graph.Book).update(createEntityRef(graph.Book, { id: 'book-1' }), {
      title: 'Revised',
    });
    const remote = createRemoteDataGraphRuntime({
      transport: vi.fn(),
      commandTransport: async () => ({
        kind: 'graph-command-result',
        value: {
          created: [],
          updated: [
            {
              entityName: 'Book',
              ref: createEntityRef(graph.Book, { id: 'book-2' }),
              values: { id: 'book-2', title: 'Revised', published: false },
            },
          ],
          deleted: [],
        },
      }),
    });

    await expect(
      Effect.runPromise(remote.runEntityMutationCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({ _tag: 'Left', left: { code: 'invalid_response' } });
  });

  it('distinguishes unsupported, invalid, failed, and mismatched remote execution', async () => {
    const graph = defineBookGraph();
    const command = mutateEntity(graph.Book).create({
      id: 'book-1',
      title: 'Ontahi',
      published: false,
    });
    const run = (commandTransport: (request: unknown) => Promise<unknown>) =>
      Effect.runPromise(
        createRemoteDataGraphRuntime({ transport: vi.fn(), commandTransport })
          .runEntityMutationCommand(command)
          .pipe(Effect.either),
      );

    await expect(
      Effect.runPromise(
        createRemoteDataGraphRuntime({ transport: vi.fn() })
          .runEntityMutationCommand(command)
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { code: 'unsupported_capability' },
    });
    await expect(
      Effect.runPromise(
        createRemoteDataGraphRuntime({ transport: vi.fn(), commandTransport: vi.fn() })
          .runEntityMutationCommand({
            kind: 'entity-mutation-command',
            action: 'create',
            entityName: 'Book',
            values: {
              id: 'book-1',
              title: 'Ontahi',
              published: false,
              unsafe: undefined,
            },
          })
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({ _tag: 'Left', left: { code: 'invalid_request' } });
    await expect(
      run(async () => Promise.reject(new Error('network offline'))),
    ).resolves.toMatchObject({ _tag: 'Left', left: { code: 'transport_failure' } });
    await expect(
      run(async () => ({
        kind: 'graph-command-rejection',
        diagnostic: {
          reason: 'relation_constraint_rejected',
          rejection: {
            version: 1,
            code: 'relation_constraint_rejected',
            message: 'Wrong rejection kind.',
            parameters: {},
          },
        },
      })),
    ).resolves.toMatchObject({ _tag: 'Left', left: { code: 'invalid_response' } });
    await expect(
      run(async () => ({
        kind: 'protocol-error',
        error: { code: 'access_denied', message: 'Data graph Command access denied.' },
      })),
    ).resolves.toMatchObject({ _tag: 'Left', left: { code: 'access_denied' } });
  });
});
