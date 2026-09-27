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
    update: {
      fields: ['title', 'published'],
      if: ['title', 'published'],
      result: ['id', 'title', 'published'],
    },
    delete: { if: ['title', 'published'], result: ['id', 'title', 'published'] },
  },
});

describe('Entity Mutation Command dispatcher', () => {
  it('projects registered Entity mutation actions as advisory capabilities', async () => {
    const graph = defineBookGraph();
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: graph.Book,
          scope: 'all',
          actions: {
            update: { fields: ['title'], result: ['id', 'title'] },
            delete: { result: ['id'] },
          },
        },
      ],
      executeEntityMutation: vi.fn(),
    });

    await expect(
      dispatch(
        { version: 1, kind: 'graph-command-capabilities', entityName: 'Book' },
        { authority: undefined },
      ),
    ).resolves.toEqual({
      kind: 'graph-command-capabilities-result',
      entityName: 'Book',
      capabilities: { entityMutations: ['update', 'delete'] },
    });
    await expect(
      dispatch(
        { version: 1, kind: 'graph-command-capabilities', entityName: 'Missing' },
        { authority: undefined },
      ),
    ).resolves.toEqual({
      kind: 'graph-command-capabilities-result',
      entityName: 'Missing',
      capabilities: { entityMutations: [] },
    });
  });

  it('advertises Selection mutation capabilities separately from exact mutations', async () => {
    const graph = defineBookGraph();
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: graph.Book,
          scope: 'all',
          actions: {
            update: {
              fields: ['title'],
              result: ['id', 'title'],
              selection: { fields: { title: ['eq'] } },
            },
            delete: { result: ['id'], selection: { fields: { published: ['eq'] } } },
          },
        },
      ],
      executeEntityMutation: vi.fn(),
    });

    await expect(
      dispatch(
        { version: 1, kind: 'graph-command-capabilities', entityName: 'Book' },
        { authority: undefined },
      ),
    ).resolves.toEqual({
      kind: 'graph-command-capabilities-result',
      entityName: 'Book',
      capabilities: {
        entityMutations: ['update', 'delete'],
        selectionMutations: ['update', 'delete'],
      },
    });
  });

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
        policies: [
          {
            ...policyFor(graph),
            actions: {
              update: { fields: ['title'], if: ['label'], result: ['id'] },
            },
          },
        ],
        executeEntityMutation,
      }),
    ).toThrow('must allow stored mutation and result Fields');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          {
            ...policyFor(graph),
            actions: {
              update: { fields: ['title'], if: ['published', 'published'], result: ['id'] },
            },
          },
        ],
        executeEntityMutation,
      }),
    ).toThrow('must allow stored mutation and result Fields');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          {
            ...policyFor(graph),
            actions: {
              create: { fields: ['id'], if: ['published'], result: ['id'] },
            },
          } as never,
        ],
        executeEntityMutation,
      }),
    ).toThrow('requires a condition Field allowlist only for update/delete');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          {
            ...policyFor(graph),
            actions: {
              delete: { if: 'published', result: ['id'] },
            },
          } as never,
        ],
        executeEntityMutation,
      }),
    ).toThrow('requires a condition Field allowlist only for update/delete');
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

  it('validates Selection mutation policy declarations at registration', () => {
    const graph = defineBookGraph();
    const executeEntityMutation = vi.fn();
    const create = (actions: unknown) =>
      createGraphCommandDispatcher({
        policies: [{ entity: graph.Book, scope: 'all', actions } as never],
        executeEntityMutation,
      });

    expect(() =>
      create({
        create: { fields: ['id'], result: ['id'], selection: { fields: { id: ['eq'] } } },
      }),
    ).toThrow('requires Selection permissions only for update/delete');
    for (const selection of [
      { fields: { missing: ['eq'] } },
      { fields: { label: ['eq'] } },
      { fields: { title: [] } },
      { fields: { title: ['matches'] } },
    ]) {
      expect(() => create({ update: { fields: ['title'], result: ['id'], selection } })).toThrow(
        'has invalid Selection permissions',
      );
    }
    expect(() =>
      create({ update: { fields: ['title'], result: ['id'], selection: { fields: {} } } }),
    ).toThrow('requires a Selection Field or allowAll');
    expect(() =>
      create({
        update: {
          fields: ['title'],
          result: ['title'],
          selection: { fields: { title: ['eq'] } },
        },
      }),
    ).toThrow('Selection results must include identity Fields');
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

  it('authorizes Selection mutations by Field and operator and returns every changed fact', async () => {
    const client = defineBookGraph();
    const server = defineBookGraph();
    const target = {
      kind: 'selection' as const,
      entityName: 'Book' as const,
      expression: {
        kind: 'predicate' as const,
        fieldName: 'published',
        operator: 'eq' as const,
        value: false,
      },
    };
    const command = mutateEntity(client.Book).updateSelection(target, { title: 'Revised' });
    const delta = {
      created: [],
      updated: [
        {
          entityName: 'Book',
          ref: createEntityRef(server.Book, { id: 'book-1' }),
          values: { id: 'book-1', title: 'Revised', published: false },
        },
        {
          entityName: 'Book',
          ref: createEntityRef(server.Book, { id: 'book-2' }),
          values: { id: 'book-2', title: 'Revised', published: false },
        },
      ],
      deleted: [],
    };
    const executeEntityMutation = vi.fn(async () => delta);
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: server.Book,
          scope: 'all',
          actions: {
            update: {
              fields: ['title'],
              result: ['id', 'title', 'published'],
              selection: { fields: { published: ['eq'] } },
            },
          },
        },
      ],
      executeEntityMutation,
    });

    await expect(
      dispatch(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toEqual({ kind: 'graph-command-result', value: delta });
    expect(executeEntityMutation).toHaveBeenCalledWith(
      mutateEntity(server.Book).updateSelection(target, { title: 'Revised' }),
      { authority: undefined },
    );
  });

  it('denies Selection mutations unless their Field and operator are explicitly allowed', async () => {
    const graph = defineBookGraph();
    const executeEntityMutation = vi.fn();
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: graph.Book,
          scope: 'all',
          actions: {
            delete: {
              result: ['id'],
              selection: { fields: { title: ['eq'] } },
            },
          },
        },
      ],
      executeEntityMutation,
    });

    for (const expression of [
      { kind: 'predicate' as const, fieldName: 'published', operator: 'eq' as const, value: false },
      { kind: 'predicate' as const, fieldName: 'title', operator: 'in' as const, values: ['A'] },
      { kind: 'all' as const },
    ]) {
      const command = mutateEntity(graph.Book).deleteSelection({
        kind: 'selection',
        entityName: 'Book',
        expression,
      });
      await expect(
        dispatch(toGraphCommandRequest(command), { authority: undefined }),
      ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    }
    expect(executeEntityMutation).not.toHaveBeenCalled();
  });

  it('denies negated and schema-invalid Selection targets without broad permission', async () => {
    const graph = defineBookGraph();
    const executeEntityMutation = vi.fn();
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: graph.Book,
          scope: 'all',
          actions: {
            delete: {
              result: ['id'],
              selection: { fields: { id: ['eq'], title: ['eq'] } },
            },
          },
        },
      ],
      executeEntityMutation,
    });
    const deniedExpressions = [
      {
        kind: 'not' as const,
        operand: {
          kind: 'predicate' as const,
          fieldName: 'title',
          operator: 'eq' as const,
          value: 'A',
        },
      },
      {
        kind: 'and' as const,
        operands: [
          {
            kind: 'predicate' as const,
            fieldName: 'title',
            operator: 'eq' as const,
            value: 'A',
          },
          {
            kind: 'not' as const,
            operand: {
              kind: 'predicate' as const,
              fieldName: 'title',
              operator: 'eq' as const,
              value: 'B',
            },
          },
        ],
      },
      {
        kind: 'references' as const,
        refs: [{ kind: 'entity-ref' as const, entityName: 'Book' as const, locator: { id: 42 } }],
      },
    ];

    for (const expression of deniedExpressions) {
      const command = mutateEntity(graph.Book).deleteSelection({
        kind: 'selection',
        entityName: 'Book',
        expression: expression as never,
      });
      await expect(
        dispatch(toGraphCommandRequest(command), { authority: undefined }),
      ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    }
    expect(executeEntityMutation).not.toHaveBeenCalled();
  });

  it('requires allowAll for negation and still validates its operand', async () => {
    const graph = defineBookGraph();
    const executeEntityMutation = vi.fn(async () => ({ created: [], updated: [], deleted: [] }));
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: graph.Book,
          scope: 'all',
          actions: {
            delete: {
              result: ['id'],
              selection: { fields: { title: ['eq'] }, allowAll: true },
            },
          },
        },
      ],
      executeEntityMutation,
    });
    const commandFor = (operand: object) =>
      mutateEntity(graph.Book).deleteSelection({
        kind: 'selection',
        entityName: 'Book',
        expression: { kind: 'not', operand } as never,
      });

    await expect(
      dispatch(
        toGraphCommandRequest(
          commandFor({ kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'A' }),
        ),
        { authority: undefined },
      ),
    ).resolves.toMatchObject({ kind: 'graph-command-result' });
    await expect(
      dispatch(
        toGraphCommandRequest(
          commandFor({ kind: 'predicate', fieldName: 'published', operator: 'eq', value: false }),
        ),
        { authority: undefined },
      ),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    expect(executeEntityMutation).toHaveBeenCalledOnce();
  });

  it('requires an explicit condition Field allowlist before execution', async () => {
    const graph = defineBookGraph();
    const executeEntityMutation = vi.fn();
    const target = createEntityRef(graph.Book, { id: 'book-1' });
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: graph.Book,
          scope: 'all',
          actions: {
            update: {
              fields: ['title'],
              if: ['published'],
              result: ['id', 'title'],
            },
          },
        },
      ],
      executeEntityMutation,
    });

    await expect(
      dispatch(
        toGraphCommandRequest(
          mutateEntity(graph.Book).update(
            target,
            { title: 'Revised' },
            { if: { internalNote: 'secret' } },
          ),
        ),
        { authority: undefined },
      ),
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

  it('collapses a zero-row conditional mutation into one authority-safe rejection', async () => {
    const graph = defineBookGraph();
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(graph)],
      executeEntityMutation: vi.fn(async () =>
        Promise.reject(
          Object.assign(new Error('provider detail'), {
            reason: 'entity_mutation_condition_not_met',
          }),
        ),
      ),
    });
    const command = mutateEntity(graph.Book).update(
      createEntityRef(graph.Book, { id: 'book-1' }),
      { title: 'Revised' },
      { if: { published: false } },
    );

    await expect(
      dispatch(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toEqual({
      kind: 'graph-command-rejection',
      diagnostic: {
        reason: 'entity_mutation_condition_not_met',
        rejection: {
          version: 1,
          code: 'entity_mutation_condition_not_met',
          message: 'Entity mutation condition was not satisfied.',
          parameters: { entityName: 'Book', action: 'update' },
        },
      },
    });
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

  it.each([
    {
      name: 'accessor properties',
      providerError: Object.defineProperty(new Error('provider detail'), 'cause', {
        get: () => {
          throw new Error('throwing accessor');
        },
      }),
    },
    {
      name: 'throwing reflection traps',
      providerError: new Proxy(new Error('provider detail'), {
        getOwnPropertyDescriptor: () => {
          throw new Error('throwing descriptor trap');
        },
        ownKeys: () => {
          throw new Error('throwing ownKeys trap');
        },
      }),
    },
  ])('keeps $name inside the safe execution boundary', async ({ providerError }) => {
    const graph = defineBookGraph();
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(graph)],
      executeEntityMutation: vi.fn(async () => Promise.reject(providerError)),
    });
    const command = mutateEntity(graph.Book).delete(createEntityRef(graph.Book, { id: 'book-1' }));

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
        updated: [
          {
            entityName: 'Book',
            ref: createEntityRef(graph.Book, { id: 'book-2' }),
            values: { id: 'book-2', title: 'Revised' },
          },
        ],
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
