import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { runCollectArray } from '../computation/stream.js';

import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  query,
  selection,
  type GraphReadMode,
  type GraphReadPolicy,
  type QuerySpec,
  type RemoteDataGraphError,
} from './index.js';

const defineTodoGraph = () => {
  const Todo = entity('Todo', {
    id: field.id(),
    title: field.string(),
    completed: field.boolean(),
    ownerId: field.string(),
  });

  return { Todo };
};

type Authority = { ownerId: string };

const createTodoPolicy = (
  Todo: ReturnType<typeof defineTodoGraph>['Todo'],
): GraphReadPolicy<typeof Todo, Authority> => ({
  entity: Todo,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 50,
  fields: {
    id: { select: true, filter: ['eq'] },
    title: { select: true, order: true },
    completed: { filter: ['eq'] },
    ownerId: { filter: ['eq'] },
  },
  scope: ({ authority, entity: ScopedTodo }) =>
    selection(ScopedTodo, todo => todo.ownerId.eq(authority.ownerId)),
});

const dataset = {
  Todo: [
    {
      id: 'todo-1',
      title: 'Define the protocol',
      completed: false,
      ownerId: 'owner-1',
    },
    {
      id: 'todo-2',
      title: 'Build the runtime',
      completed: false,
      ownerId: 'owner-1',
    },
    {
      id: 'todo-private',
      title: 'Another owner',
      completed: false,
      ownerId: 'owner-2',
    },
  ],
};

const executeWithRuntime = (
  runtime: ReturnType<typeof createInMemoryDataGraphRuntime>,
  query: QuerySpec,
  mode: GraphReadMode,
) =>
  Effect.runPromise(
    mode === 'get'
      ? runtime.get(query, undefined)
      : mode === 'count'
        ? runtime.count(query, undefined)
        : runtime.run(query, undefined),
  );

describe('remote data graph runtime', () => {
  it('runs the same projected Todo read through direct and remote runtime bindings', async () => {
    const client = defineTodoGraph();
    const server = defineTodoGraph();
    const directRuntime = createInMemoryDataGraphRuntime({
      dataset: {
        Todo: dataset.Todo.filter(todo => todo.ownerId === 'owner-1'),
      },
    });
    const serverRuntime = createInMemoryDataGraphRuntime({ dataset });
    const dispatch = createGraphReadDispatcher({
      policies: [createTodoPolicy(server.Todo)],
      execute: (query, mode) => executeWithRuntime(serverRuntime, query, mode),
    });
    const transport = vi.fn(
      (request: unknown, options?: { authority: Authority; credential: string }) =>
        dispatch(JSON.parse(JSON.stringify(request)), {
          authority: options?.authority ?? { ownerId: 'missing' },
        }).then(response => JSON.parse(JSON.stringify(response))),
    );
    const remoteRuntime = createRemoteDataGraphRuntime({ transport });
    const directGraph = createRuntimeBoundDataGraphApi(() => directRuntime);
    const remoteGraph = createRuntimeBoundDataGraphApi(() => remoteRuntime);
    const TodoListItem = client.Todo.view('TodoListItem', { id: true, title: true });
    const openTodos = query(client.Todo)
      .where(todo => todo.completed.eq(false))
      .as(TodoListItem)
      .orderBy(todo => todo.title);

    const direct = await Effect.runPromise(directGraph.bindGraphRead(openTodos).run());
    const remote = await Effect.runPromise(
      remoteGraph.bindGraphRead(openTodos).run(undefined, {
        authority: { ownerId: 'owner-1' },
        credential: 'server-session',
      }),
    );

    expect(remote).toEqual(direct);
    expect(remote).toEqual([
      { id: 'todo-2', title: 'Build the runtime' },
      { id: 'todo-1', title: 'Define the protocol' },
    ]);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        view: TodoListItem.toJSON(),
      }),
      { authority: { ownerId: 'owner-1' }, credential: 'server-session' },
    );
    expect(transport.mock.calls[0]?.[0]).not.toHaveProperty('authority');
    expect(JSON.stringify(transport.mock.calls[0]?.[0])).not.toContain('owner-1');
    expect(JSON.stringify(transport.mock.calls[0]?.[0])).not.toContain('server-session');
  });

  it('maps get, run, and count to their corresponding remote read modes', async () => {
    const { Todo } = defineTodoGraph();
    const responses = {
      get: { kind: 'graph-read-result', value: { id: 'todo-1' } },
      run: { kind: 'graph-read-result', value: [{ id: 'todo-1' }] },
      count: { kind: 'graph-read-result', value: 1 },
    } as const;
    const transport = vi.fn((request: { mode: GraphReadMode }) =>
      Promise.resolve(responses[request.mode]),
    );
    const runtime = createRemoteDataGraphRuntime({ transport });
    const read = query(Todo).where(todo => todo.id.eq('todo-1'));

    await expect(Effect.runPromise(runtime.get(read, undefined))).resolves.toEqual({
      id: 'todo-1',
    });
    await expect(Effect.runPromise(runtime.run(read, undefined))).resolves.toEqual([
      { id: 'todo-1' },
    ]);
    await expect(Effect.runPromise(runtime.count(read, undefined))).resolves.toBe(1);
    expect(transport.mock.calls.map(([request]) => request.mode)).toEqual(['get', 'run', 'count']);
  });

  it('fails unavailable stream and Command capabilities without invoking transport', async () => {
    const { Todo } = defineTodoGraph();
    const transport = vi.fn();
    const runtime = createRemoteDataGraphRuntime({ transport });
    const read = query(Todo).where(todo => todo.id.eq('todo-1'));
    const command = {
      kind: 'command',
      operation: 'update',
      root: Todo,
      selection: read.build().selection,
      payload: { completed: true },
    } as const;

    await expect(
      Effect.runPromise(runCollectArray(runtime.stream(read, undefined)).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { _tag: 'RemoteDataGraphError', code: 'unsupported_capability' },
    });
    await expect(
      Effect.runPromise(runtime.runCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { _tag: 'RemoteDataGraphError', code: 'unsupported_capability' },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('preserves protocol errors and rejects transport failures or malformed results', async () => {
    const { Todo } = defineTodoGraph();
    const read = query(Todo).where(todo => todo.id.eq('todo-1'));
    const run = async (response: unknown | Promise<unknown>) => {
      const runtime = createRemoteDataGraphRuntime({
        transport: () => Promise.resolve(response),
      });
      const result = await Effect.runPromise(runtime.run(read, undefined).pipe(Effect.either));
      return result._tag === 'Left' ? (result.left as RemoteDataGraphError) : undefined;
    };

    await expect(
      run({
        kind: 'protocol-error',
        error: { code: 'access_denied', message: 'Data graph read access denied.' },
      }),
    ).resolves.toMatchObject({
      _tag: 'RemoteDataGraphError',
      code: 'access_denied',
      message: 'Data graph read access denied.',
    });
    await expect(run({ kind: 'graph-read-result', value: 'not-an-array' })).resolves.toMatchObject({
      code: 'invalid_response',
    });

    for (const response of [
      null,
      { kind: 'graph-read-result', value: undefined },
      { kind: 'unexpected-result', value: [] },
      { kind: 'protocol-error', error: null },
      { kind: 'protocol-error', error: { code: 42, message: 'Invalid code.' } },
      { kind: 'protocol-error', error: { code: 'unknown_code', message: 'Unknown code.' } },
      { kind: 'protocol-error', error: { code: 'access_denied', message: 42 } },
    ]) {
      await expect(run(response)).resolves.toMatchObject({ code: 'invalid_response' });
    }

    const malformedResultRuntime = createRemoteDataGraphRuntime({
      transport: request =>
        Promise.resolve({
          kind: 'graph-read-result',
          value: request.mode === 'get' ? [] : -1,
        }),
    });
    await expect(
      Effect.runPromise(malformedResultRuntime.get(read, undefined).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { code: 'invalid_response' },
    });
    await expect(
      Effect.runPromise(malformedResultRuntime.count(read, undefined).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { code: 'invalid_response' },
    });

    const failedRuntime = createRemoteDataGraphRuntime({
      transport: () => Promise.reject(new Error('network offline')),
    });
    await expect(
      Effect.runPromise(failedRuntime.count(read, undefined).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { _tag: 'RemoteDataGraphError', code: 'transport_failure' },
    });
  });

  it('rejects a locally unsupported read shape before invoking transport', async () => {
    const { Todo } = defineTodoGraph();
    const transport = vi.fn();
    const runtime = createRemoteDataGraphRuntime({ transport });
    const projectionWithoutView = query(Todo).select(todo => ({ id: todo.id }));

    await expect(
      Effect.runPromise(runtime.run(projectionWithoutView, undefined).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { _tag: 'RemoteDataGraphError', code: 'invalid_request' },
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
