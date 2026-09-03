import {
  createEntityRef,
  defineClientEntity,
  entity,
  field,
  mutateEntity,
  query,
} from '@ontahi/core/data-graph';
import { runBrowserEffect } from '@ontahi/core/runtime/browser';
import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchGraphClient } from './index.js';

describe('Fetch graph client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assembles the conventional same-origin graph capabilities', () => {
    const client = createFetchGraphClient();

    expect(client.graph).toBeDefined();
    expect(client.graphExecutor).toBeDefined();
    expect(client.runtimeTransport).toBeDefined();
    expect(client.operationBridgeAdapters).toHaveLength(1);
    expect(client.operationBridgeAdapters?.[0]?.name).toBe('fetch');
    expect(client.reflectedOperationInvoker).toBeDefined();
    expect(client.reflectedEntityDataReader).toBeDefined();
    expect(client.reflectedRelatedEntityDataReader).toBeDefined();
  });

  it('binds a generated client Entity facade for fluent execution outside React', async () => {
    const TodoSchema = entity('Todo', {
      id: field.id(),
      title: field.string(),
    });
    const Todo = defineClientEntity(TodoSchema);
    const TodoRow = Todo.view('TodoRow', { id: true, title: true });
    const fetchRequest = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return {
        ok: true,
        status: 200,
        json: async () =>
          createRuntimeProtocolResponse(request, {
            kind: 'graph-read-result',
            value: [{ id: 'todo-1', title: 'Use the fluent client' }],
          }),
      };
    });
    const client = createFetchGraphClient({
      graphRead: { fetch: fetchRequest as unknown as typeof fetch },
    });
    const BoundTodo = client.graph.bindClientEntity(Todo);

    await expect(
      runBrowserEffect(
        BoundTodo.all()
          .as(TodoRow)
          .orderBy(todo => todo.title)
          .run(),
      ),
    ).resolves.toEqual([{ id: 'todo-1', title: 'Use the fluent client' }]);
    expect(BoundTodo).not.toBe(Todo);
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchRequest.mock.calls[0]?.[1]?.body))).toMatchObject({
      family: 'graph.read',
      body: {
        kind: 'graph-read',
        mode: 'run',
        selection: { entityName: 'Todo' },
        view: { name: 'TodoRow' },
        orderBy: [{ fieldName: 'title', direction: 'asc' }],
      },
    });
  });

  it('binds generated client Entity mutation authoring to the remote Command capability', async () => {
    const TodoSchema = entity('MutableTodo', {
      id: field.id(),
      title: field.string(),
    });
    const Todo = defineClientEntity(TodoSchema);
    const todo = Todo.refById('todo-1');
    const delta = {
      created: [],
      updated: [
        {
          entityName: 'MutableTodo',
          ref: todo,
          values: { id: 'todo-1', title: 'Remote' },
        },
      ],
      deleted: [],
    };
    const fetchRequest = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return {
        ok: true,
        status: 200,
        json: async () =>
          createRuntimeProtocolResponse(request, { kind: 'graph-command-result', value: delta }),
      };
    });
    const client = createFetchGraphClient({
      graphRead: { fetch: fetchRequest as unknown as typeof fetch },
    });
    const BoundTodo = client.graph.bindClientEntity(Todo);

    await expect(
      runBrowserEffect(BoundTodo.refById('todo-1').update({ title: 'Remote' }).run()),
    ).resolves.toEqual(delta);
    expect(JSON.parse(String(fetchRequest.mock.calls[0]?.[1]?.body))).toMatchObject({
      family: 'graph.command',
      body: {
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'MutableTodo',
          target: { entityName: 'MutableTodo', locator: { id: 'todo-1' } },
          values: { title: 'Remote' },
        },
      },
    });
  });

  it('composes all request/response families through one configured Fetch Runtime Transport', async () => {
    const RuntimeTodo = entity('RuntimeTodo', {
      id: field.id(),
      title: field.string(),
    });
    const RuntimeTodoRow = RuntimeTodo.view('RuntimeTodoRow', { id: true, title: true });
    const read = query(RuntimeTodo).as(RuntimeTodoRow);
    const todoRef = createEntityRef(RuntimeTodo, { id: 'todo-1' });
    const command = mutateEntity(RuntimeTodo).update(todoRef, { title: 'Unified' });
    const delta = {
      created: [],
      updated: [
        {
          entityName: 'RuntimeTodo',
          ref: todoRef,
          values: { id: 'todo-1', title: 'Unified' },
        },
      ],
      deleted: [],
    };
    const fetchRequest = vi.fn(async (endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      const body = (() => {
        switch (request.family) {
          case 'graph.read':
            return {
              kind: 'graph-read-result',
              value: [{ id: 'todo-1', title: 'Unified' }],
            };
          case 'graph.command':
            return { kind: 'graph-command-result', value: delta };
          case 'operation':
            return {
              kind: 'invocation-result',
              result: { ok: true, kind: 'success', value: { completed: 2 } },
            };
          case 'durable.operation':
            return {
              version: 1,
              kind: 'snapshot',
              snapshot: {
                taskId: 'Todo.completeAll',
                runId: 'run-1',
                status: 'completed',
                updatedAt: '2026-08-31T01:00:00.000Z',
              },
            };
          default:
            throw new Error(`Unexpected family ${request.family}.`);
        }
      })();
      return {
        ok: true,
        status: 200,
        json: async () => createRuntimeProtocolResponse(request, body),
      };
    });
    const requestIds = ['read-1', 'command-1', 'operation-1', 'inspect-1'][Symbol.iterator]();
    const client = createFetchGraphClient({
      runtimeTransport: {
        endpoint: '/internal/runtime',
        fetch: fetchRequest as unknown as typeof fetch,
        requestId: () => requestIds.next().value ?? 'unexpected',
        requestInit: () => ({
          credentials: 'include',
          headers: { authorization: 'Bearer browser-session' },
        }),
      },
    });

    await expect(client.graphExecutor.run(read, undefined)).resolves.toEqual([
      { id: 'todo-1', title: 'Unified' },
    ]);
    await expect(client.graphExecutor.runEntityMutationCommand!(command)).resolves.toEqual(delta);
    await expect(
      client.reflectedOperationInvoker?.invokeOperation({
        operationId: 'RuntimeTodo.complete',
        input: { id: 'todo-1' },
      }),
    ).resolves.toMatchObject({ ok: true, value: { completed: 2 } });
    await client.runtimeTransport?.durableOperation
      ?.observe({ taskId: 'Todo.completeAll', runId: 'run-1' })
      [Symbol.asyncIterator]()
      .next();

    expect(fetchRequest).toHaveBeenCalledTimes(4);
    expect(fetchRequest.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      '/internal/runtime',
      '/internal/runtime',
      '/internal/runtime',
      '/internal/runtime',
    ]);
    expect(
      fetchRequest.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).family),
    ).toEqual(['graph.read', 'graph.command', 'operation', 'durable.operation']);
    for (const [, init] of fetchRequest.mock.calls) {
      expect(init?.credentials).toBe('include');
      expect(Object.fromEntries(new Headers(init?.headers).entries())).toEqual({
        authorization: 'Bearer browser-session',
        'content-type': 'application/json',
      });
    }
  });

  it('lets explicit compatibility endpoints override deprecated aliases while Durable stays on /runtime', async () => {
    const LegacyTodo = entity('LegacyTodo', { id: field.id(), title: field.string() });
    const LegacyTodoRow = LegacyTodo.view('LegacyTodoRow', { id: true, title: true });
    const read = query(LegacyTodo).as(LegacyTodoRow);
    const todoRef = createEntityRef(LegacyTodo, { id: 'todo-1' });
    const command = mutateEntity(LegacyTodo).delete(todoRef);
    const delta = {
      created: [],
      updated: [],
      deleted: [{ entityName: 'LegacyTodo', ref: todoRef, values: { id: 'todo-1' } }],
    };
    const fetchRequest = vi.fn(async (endpoint: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (endpoint === '/legacy/graph/reads') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            kind: 'graph-read-result',
            value: [{ id: 'todo-1', title: 'Legacy read' }],
          }),
        };
      }
      if (endpoint === '/legacy/operations') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            kind: 'invocation-result',
            result: { ok: true, kind: 'success', value: { source: 'legacy' } },
          }),
        };
      }
      if (endpoint === '/legacy/graph/commands') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ kind: 'graph-command-result', value: delta }),
        };
      }

      const request = payload as RuntimeProtocolRequestEnvelope;
      return {
        ok: true,
        status: 200,
        json: async () =>
          createRuntimeProtocolResponse(
            request,
            request.family === 'graph.command'
              ? { kind: 'graph-command-result', value: delta }
              : {
                  version: 1,
                  kind: 'snapshot',
                  snapshot: {
                    taskId: 'LegacyTodo.deleteAll',
                    runId: 'run-1',
                    status: 'completed',
                    updatedAt: '2026-09-03T00:00:00.000Z',
                  },
                },
          ),
      };
    });
    const client = createFetchGraphClient({
      graphRead: {
        endpoint: '/deprecated/graph/reads',
        commandEndpoint: '/deprecated/graph/commands',
      },
      operations: { endpoint: '/deprecated/operations' },
      runtimeTransport: { fetch: fetchRequest as unknown as typeof fetch },
      compatibility: {
        graphRead: { endpoint: '/legacy/graph/reads' },
        graphCommand: { endpoint: '/legacy/graph/commands' },
        operation: { endpoint: '/legacy/operations' },
      },
    });

    await expect(client.graphExecutor.run(read, undefined)).resolves.toEqual([
      { id: 'todo-1', title: 'Legacy read' },
    ]);
    await expect(client.graphExecutor.runEntityMutationCommand!(command)).resolves.toEqual(delta);
    await expect(
      client.reflectedOperationInvoker?.invokeOperation({
        operationId: 'LegacyTodo.archive',
        input: { id: 'todo-1' },
      }),
    ).resolves.toMatchObject({ ok: true, value: { source: 'legacy' } });
    await client.runtimeTransport?.durableOperation
      ?.observe({ taskId: 'LegacyTodo.deleteAll', runId: 'run-1' })
      [Symbol.asyncIterator]()
      .next();

    expect(fetchRequest.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      '/legacy/graph/reads',
      '/legacy/graph/commands',
      '/legacy/operations',
      '/runtime',
    ]);
    expect(JSON.parse(String(fetchRequest.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind: 'graph-read',
    });
    expect(JSON.parse(String(fetchRequest.mock.calls[1]?.[1]?.body))).toMatchObject({
      kind: 'graph-command',
    });
  });

  it('never falls back to a legacy endpoint after transmitting a common request', async () => {
    const fetchRequest = vi.fn(async (_endpoint: string, _init?: RequestInit) => {
      throw new TypeError('The connection closed after transmission.');
    });
    const client = createFetchGraphClient({
      runtimeTransport: { fetch: fetchRequest as unknown as typeof fetch },
      compatibility: {
        graphRead: { endpoint: '/graph/reads' },
        graphCommand: { endpoint: '/graph/commands' },
      },
    });

    await expect(
      client.reflectedOperationInvoker?.invokeOperation({
        operationId: 'Todo.complete',
        input: { id: 'todo-1' },
      }),
    ).resolves.toMatchObject({
      ok: false,
      kind: 'errored',
      message: 'The connection closed after transmission.',
    });

    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(fetchRequest.mock.calls[0]?.[0]).toBe('/runtime');
  });

  it('reads reflected entity data from the conventional Explorer endpoint', async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        entityName: 'TodoItem',
        columns: [],
        rows: [],
        page: 1,
        pageSize: 25,
        totalCount: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      }),
    });
    const client = createFetchGraphClient({
      reflectedEntityData: { fetch: fetchRequest as typeof fetch },
    });
    const query = { entityName: 'TodoItem', page: 1, pageSize: 25 };

    await expect(client.reflectedEntityDataReader?.readEntityData(query)).resolves.toMatchObject({
      rows: [],
      totalCount: 0,
    });
    expect(fetchRequest).toHaveBeenCalledWith('/explorer/entities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(query),
    });
  });

  it('reads reflected related Entity data from the conventional Explorer endpoint', async () => {
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        entityName: 'TodoItem',
        columns: [],
        rows: [{ id: 'todo-1' }],
        page: 1,
        pageSize: 25,
        totalCount: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      }),
    });
    const client = createFetchGraphClient({
      reflectedRelatedEntityData: { fetch: fetchRequest as typeof fetch },
    });
    const query = {
      source: { kind: 'entity-ref' as const, entityName: 'Tag', locator: { id: 'tag-1' } },
      relationName: 'TodoItem.tags',
      sourceEntityName: 'Tag',
      targetEntityName: 'TodoItem',
    };

    await expect(
      client.reflectedRelatedEntityDataReader?.readRelatedEntityData(query),
    ).resolves.toMatchObject({ rows: [{ id: 'todo-1' }], totalCount: 1 });
    expect(fetchRequest).toHaveBeenCalledWith('/explorer/related-entities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(query),
    });
  });

  it('allows every conventional capability to be disabled', () => {
    expect(
      createFetchGraphClient({
        graphRead: false,
        operations: false,
        runtimeTransport: false,
        reflectedEntityData: false,
        reflectedRelatedEntityData: false,
      }),
    ).toEqual({});
  });

  it('rejects failed reflected entity data responses', async () => {
    const client = createFetchGraphClient({
      reflectedEntityData: {
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch,
      },
    });

    await expect(
      client.reflectedEntityDataReader?.readEntityData({
        entityName: 'TodoItem',
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow('Reflected entity data request failed with status 403.');
  });
});
