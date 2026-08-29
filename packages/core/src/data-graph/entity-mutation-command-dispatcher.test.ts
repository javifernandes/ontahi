import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createGraphCommandDispatcher,
  entity,
  field,
  mutateEntity,
  toGraphCommandRequest,
  type EntityMutationCommandPolicy,
} from './index.js';

const defineBookGraph = () => {
  const Book = entity('Book', {
    id: field.id(),
    title: field.nonEmptyString({ trim: true }),
    published: field.boolean(),
    internalNote: field.optional(field.string()),
    label: field.derived(field.string(), () => ''),
  });
  return { Book };
};

const policyFor = (
  graph: ReturnType<typeof defineBookGraph>,
): EntityMutationCommandPolicy<typeof graph.Book> => ({
  entity: graph.Book,
  scope: 'all',
  actions: {
    create: {
      fields: ['id', 'title', 'published'],
      result: ['id', 'title', 'published'],
    },
    update: { fields: ['title', 'published'], result: ['id', 'title', 'published'] },
    delete: { result: ['id', 'title', 'published'] },
  },
});

describe('Entity Mutation Command dispatcher', () => {
  it('validates explicit scope and stored Field allowlists at registration', () => {
    const graph = defineBookGraph();
    const executeEntityMutation = vi.fn();

    expect(() =>
      createGraphCommandDispatcher({
        policies: [{ ...policyFor(graph), scope: undefined } as never],
        executeEntityMutation,
      }),
    ).toThrow('requires explicit "all" scope');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          {
            ...policyFor(graph),
            actions: { update: { fields: ['label'], result: [] } },
          } as never,
        ],
        executeEntityMutation,
      }),
    ).toThrow('must allow stored mutation and result Fields');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [{ ...policyFor(graph), actions: {} }],
        executeEntityMutation,
      }),
    ).toThrow('requires valid actions');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          {
            ...policyFor(graph),
            actions: { update: { fields: ['title'] } },
          } as never,
        ],
        executeEntityMutation,
      }),
    ).toThrow('requires a result Field allowlist');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          {
            ...policyFor(graph),
            actions: { update: { result: ['id'] } },
          } as never,
        ],
        executeEntityMutation,
      }),
    ).toThrow('requires a mutation Field allowlist');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [policyFor(graph), policyFor(graph)],
        executeEntityMutation,
      }),
    ).toThrow('Duplicate Entity Mutation Command policy for Entity Book');
  });

  it('denies missing policy, denied actions, and denied payload Fields before execution', async () => {
    const client = defineBookGraph();
    const server = defineBookGraph();
    const executeEntityMutation = vi.fn();
    const target = createEntityRef(client.Book, { id: 'book-1' });
    const mutation = mutateEntity(client.Book);
    const noPolicy = createGraphCommandDispatcher({ policies: [], executeEntityMutation });
    const updateOnly = createGraphCommandDispatcher({
      policies: [
        {
          entity: server.Book,
          scope: 'all',
          actions: { update: { fields: ['title'], result: ['id', 'title'] } },
        },
      ],
      executeEntityMutation,
    });

    await expect(
      noPolicy(toGraphCommandRequest(mutation.delete(target)), { authority: undefined }),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    await expect(
      updateOnly(toGraphCommandRequest(mutation.delete(target)), { authority: undefined }),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    await expect(
      updateOnly(toGraphCommandRequest(mutation.update(target, { published: true })), {
        authority: undefined,
      }),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    expect(executeEntityMutation).not.toHaveBeenCalled();
  });

  it('rebuilds against the server Entity and returns an exact JSON-safe delta', async () => {
    const client = defineBookGraph();
    const server = defineBookGraph();
    const target = createEntityRef(client.Book, { id: 'book-1' });
    const serverTarget = createEntityRef(server.Book, { id: 'book-1' });
    const executorDelta = {
      created: [],
      updated: [
        {
          entityName: 'Book',
          ref: serverTarget,
          values: {
            id: 'book-1',
            title: 'Revised',
            published: false,
            internalNote: 'server-only',
          },
        },
      ],
      deleted: [],
    };
    const executeEntityMutation = vi.fn(async () => executorDelta);
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(server)],
      executeEntityMutation,
    });
    const context = { authority: { userId: 'user-1' } };

    await expect(
      dispatch(
        toGraphCommandRequest(mutateEntity(client.Book).update(target, { title: '  Revised  ' })),
        context,
      ),
    ).resolves.toEqual({
      kind: 'graph-command-result',
      value: {
        created: [],
        updated: [
          {
            entityName: 'Book',
            ref: serverTarget,
            values: { id: 'book-1', title: 'Revised', published: false },
          },
        ],
        deleted: [],
      },
    });
    expect(executeEntityMutation).toHaveBeenCalledWith(
      mutateEntity(server.Book).update(serverTarget, { title: 'Revised' }),
      context,
    );
  });

  it('preserves exact-cardinality failures as a portable rejection', async () => {
    const graph = defineBookGraph();
    const reportError = vi.fn();
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(graph)],
      executeEntityMutation: vi.fn(async () =>
        Promise.reject(
          Object.assign(new Error('provider detail'), { reason: 'cardinality_mismatch' }),
        ),
      ),
      reportError,
    });
    const command = mutateEntity(graph.Book).delete(createEntityRef(graph.Book, { id: 'missing' }));

    await expect(
      dispatch(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toEqual({
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
    });
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('does not describe a create provider failure as a missing target', async () => {
    const graph = defineBookGraph();
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(graph)],
      executeEntityMutation: vi.fn(async () =>
        Promise.reject(
          Object.assign(new Error('provider detail'), { reason: 'cardinality_mismatch' }),
        ),
      ),
    });
    const command = mutateEntity(graph.Book).create({
      id: 'book-1',
      title: 'Ontahi',
      published: false,
    });

    await expect(
      dispatch(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'execution_unavailable' },
    });
  });

  it('fails closed when execution is unavailable or returns an inexact delta', async () => {
    const graph = defineBookGraph();
    const command = mutateEntity(graph.Book).update(createEntityRef(graph.Book, { id: 'book-1' }), {
      title: 'Revised',
    });
    const unavailable = createGraphCommandDispatcher({ policies: [policyFor(graph)] });
    const malformed = createGraphCommandDispatcher({
      policies: [policyFor(graph)],
      executeEntityMutation: vi.fn(async () => ({
        created: [],
        updated: [{ entityName: 'Author', values: { id: 'book-1', title: 'Revised' } }],
        deleted: [],
      })),
    });

    await expect(
      unavailable(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'execution_unavailable' },
    });
    await expect(
      malformed(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'execution_unavailable' },
    });
  });
});
