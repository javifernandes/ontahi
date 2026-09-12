import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { ontahi } from '../runtime/server/ontahi.js';

import {
  createInMemoryDataGraphStorage,
  createRemoteDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  Selection,
  withContextualSelections,
  type GraphReadPolicy,
  type RemoteGraphReadTransport,
} from './index.js';

const defineGraph = () => {
  const Item = entity('ContextItem', {
    id: field.id(),
    listId: field.string(),
    done: field.boolean(),
  });
  const List = withContextualSelections(
    entity('ContextList', { id: field.id(), owner: field.string() }).hasMany('items', Item, {
      via: 'listId',
    }),
    ({ self }) => ({ pending: self.items.where(item => item.done.eq(false)) }),
  );
  return { Item, List };
};

const fixture = (supported = true) => {
  const server = defineGraph();
  const client = defineGraph();
  const storage = createInMemoryDataGraphStorage({
    entities: [server.List, server.Item],
    dataset: {
      ContextList: [
        { id: 'a', owner: 'alice' },
        { id: 'b', owner: 'bob' },
      ],
      ContextItem: [
        { id: '1', listId: 'a', done: false },
        { id: '2', listId: 'b', done: false },
        { id: '3', listId: 'a', done: true },
      ],
    },
  });
  const createRuntime = vi.fn(storage.createRuntime);
  const application = ontahi({
    storage: {
      ...storage,
      createRuntime,
      graphReadCapabilities: supported ? storage.graphReadCapabilities : undefined,
    },
    entities: { ContextList: server.List, ContextItem: server.Item },
  });
  type Authority = { owner: string };
  const listPolicy: GraphReadPolicy<typeof server.List, Authority> = {
    entity: server.List,
    fields: {},
    selectionRelations: ['items'],
    scope: ({ authority }) => Selection.where(server.List, list => list.owner.eq(authority.owner)),
    modes: ['run', 'get', 'count'],
    cardinalities: ['many', 'one'],
    maxLimit: 25,
  };
  const itemPolicy: GraphReadPolicy<typeof server.Item, Authority> = {
    entity: server.Item,
    fields: {
      id: { select: true },
      listId: { select: true },
      done: { select: true, filter: ['eq'] },
    },
    scope: 'all',
    modes: ['run', 'get', 'count'],
    cardinalities: ['many', 'one'],
    maxLimit: 25,
  };
  const dispatcher = application.createGraphReadDispatcher([listPolicy, itemPolicy]);
  const transport = vi.fn<RemoteGraphReadTransport<Authority>>(async (request, options) =>
    JSON.parse(
      JSON.stringify(
        await dispatcher(JSON.parse(JSON.stringify(request)), {
          authority: options ?? { owner: 'missing' },
        }),
      ),
    ),
  );
  const runtime = createRemoteDataGraphRuntime({ transport });
  const Lists = createRuntimeBoundDataGraphApi(() => runtime).bindSelectionEntity(client.List);
  createRuntime.mockClear();
  return {
    client,
    server,
    listPolicy,
    itemPolicy,
    application,
    transport,
    runtime,
    Lists,
    createRuntime,
  };
};

describe('Application/client contextual Graph Reads', () => {
  it('negotiates deferred named selections with receiver-owned models and the same authority options', async () => {
    const graph = fixture();
    const options = { owner: 'alice' };
    const selected = graph.Lists.selection(() => ({ kind: 'all' })).pending;
    // Authoring and binding never issue either discovery or a data read.
    expect(graph.transport).not.toHaveBeenCalled();
    expect(await Effect.runPromise(selected.run(options))).toEqual([
      { id: '1', listId: 'a', done: false },
    ]);
    expect(graph.transport.mock.calls.map(([request]) => [request.kind, request.version])).toEqual([
      ['graph-read-capabilities', 1],
      ['graph-read', 2],
    ]);
    expect(graph.transport.mock.calls.every(([, value]) => value === options)).toBe(true);
    expect(graph.transport.mock.calls[0]![0]).toEqual({
      version: 1,
      kind: 'graph-read-capabilities',
      entityName: 'ContextItem',
    });
    expect(JSON.stringify(graph.transport.mock.calls.map(([request]) => request))).not.toContain(
      'alice',
    );
    expect(graph.createRuntime).toHaveBeenCalledOnce();
    expect(
      await Effect.runPromise(graph.runtime.count(selected.toQuery(), undefined, options)),
    ).toBe(1);
    expect(
      await Effect.runPromise(graph.runtime.get(selected.toQuery(), undefined, options)),
    ).toEqual({ id: '1', listId: 'a', done: false });
    expect(await Effect.runPromise(selected.run({ owner: 'bob' }))).toEqual([
      { id: '2', listId: 'b', done: false },
    ]);
    expect(
      graph.transport.mock.calls.filter(([request]) => request.kind === 'graph-read-capabilities'),
    ).toHaveLength(4);
  });

  it('keeps unsupported storage closed without invoking the runtime or retrying as v1', async () => {
    const graph = fixture(false);
    const result = await Effect.runPromise(
      graph.runtime
        .run(Selection.all(graph.client.List).pending.toQuery(), undefined)
        .pipe(Effect.either),
    );
    expect(result).toMatchObject({
      _tag: 'Left',
      left: { code: 'unsupported_capability', message: expect.stringContaining('Graph Read v2') },
    });
    expect(graph.transport).toHaveBeenCalledOnce();
    expect(graph.createRuntime).not.toHaveBeenCalled();
  });

  it('does not turn capability discovery into authorization or retry a rejected read', async () => {
    const graph = fixture();
    const dispatcher = graph.application.createGraphReadDispatcher([
      { ...graph.listPolicy, selectionRelations: [] },
      graph.itemPolicy,
    ]);
    graph.transport.mockImplementation((request, options) =>
      dispatcher(request, { authority: options ?? { owner: 'alice' } }),
    );
    expect(
      await Effect.runPromise(
        graph.runtime
          .run(Selection.all(graph.client.List).pending.toQuery(), undefined)
          .pipe(Effect.either),
      ),
    ).toMatchObject({ _tag: 'Left', left: { code: 'access_denied' } });
    expect(graph.transport).toHaveBeenCalledTimes(2);
    expect(graph.createRuntime).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'invalid_response'],
    [{ kind: 'graph-read-result', value: [] }, 'invalid_response'],
    [
      {
        kind: 'graph-read-capabilities-result',
        entityName: 'Wrong',
        capabilities: { orderBy: [], relationSelections: { version: 2, relations: [] } },
      },
      'invalid_response',
    ],
    [
      {
        kind: 'graph-read-capabilities-result',
        entityName: 'ContextItem',
        capabilities: { orderBy: [], relationSelections: { version: 2, relations: [42] } },
      },
      'invalid_response',
    ],
    [
      { kind: 'protocol-error', error: { code: 'access_denied', message: 'Denied by receiver.' } },
      'access_denied',
    ],
  ])(
    'rejects invalid or denied discovery without sending a data read (%j)',
    async (response, code) => {
      const graph = fixture();
      graph.transport.mockResolvedValue(response);
      expect(
        await Effect.runPromise(
          graph.runtime
            .run(Selection.all(graph.client.List).pending.toQuery(), undefined)
            .pipe(Effect.either),
        ),
      ).toMatchObject({ _tag: 'Left', left: { code } });
      expect(graph.transport).toHaveBeenCalledOnce();
    },
  );

  it('preserves transport failures and validates encoding before discovery', async () => {
    const graph = fixture();
    graph.transport.mockRejectedValue(new Error('offline'));
    const read = Selection.all(graph.client.List).pending.toQuery();
    expect(
      await Effect.runPromise(graph.runtime.run(read, undefined).pipe(Effect.either)),
    ).toMatchObject({ _tag: 'Left', left: { code: 'transport_failure' } });
    graph.transport.mockClear();
    const invalid = {
      ...read.build(),
      selection: {
        kind: 'relation-image' as const,
        relationName: 'items',
        source: {
          kind: 'selection' as const,
          entityName: 'ContextList',
          expression: {
            kind: 'predicate' as const,
            fieldName: 'owner',
            operator: 'eq' as const,
            value: Number.NaN,
          },
        },
      },
    };
    expect(
      await Effect.runPromise(graph.runtime.run(invalid, undefined).pipe(Effect.either)),
    ).toMatchObject({ _tag: 'Left', left: { code: 'invalid_request' } });
    expect(graph.transport).not.toHaveBeenCalled();
  });

  it('rejects contextual observation explicitly without opening a subscription or discovery', async () => {
    const graph = fixture();
    const observeTransport = vi.fn(async function* () {
      yield [];
    });
    const runtime = createRemoteDataGraphRuntime({ transport: graph.transport, observeTransport });
    expect(
      await Effect.runPromise(
        Stream.runCollect(
          runtime.observe(Selection.all(graph.client.List).pending.toQuery(), undefined),
        ).pipe(Effect.either),
      ),
    ).toMatchObject({ _tag: 'Left', left: { code: 'unsupported_capability' } });
    expect(observeTransport).not.toHaveBeenCalled();
    expect(graph.transport).not.toHaveBeenCalled();
  });
});
