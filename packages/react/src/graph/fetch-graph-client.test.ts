import { defineClientEntity, entity, field } from '@ontahi/core/data-graph';
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
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Use the fluent client' }],
      }),
    });
    const client = createFetchGraphClient({
      graphRead: { fetch: fetchRequest as typeof fetch },
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
    expect(JSON.parse(fetchRequest.mock.calls[0]![1].body)).toMatchObject({
      kind: 'graph-read',
      mode: 'run',
      selection: { entityName: 'Todo' },
      view: { name: 'TodoRow' },
      orderBy: [{ fieldName: 'title', direction: 'asc' }],
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
    const fetchRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ kind: 'graph-command-result', value: delta }),
    });
    const client = createFetchGraphClient({
      graphRead: { fetch: fetchRequest as typeof fetch },
    });
    const BoundTodo = client.graph.bindClientEntity(Todo);

    await expect(
      runBrowserEffect(BoundTodo.refById('todo-1').update({ title: 'Remote' }).run()),
    ).resolves.toEqual(delta);
    expect(JSON.parse(fetchRequest.mock.calls[0]![1].body)).toMatchObject({
      version: 1,
      kind: 'graph-command',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'MutableTodo',
        target: { entityName: 'MutableTodo', locator: { id: 'todo-1' } },
        values: { title: 'Remote' },
      },
    });
  });

  it('uses the conventional Runtime Protocol and Operation endpoints', async () => {
    const fetchRequest = vi.fn(async (endpoint: string, init?: RequestInit) => {
      if (endpoint === '/runtime') {
        const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return {
          ok: true,
          json: async () =>
            createRuntimeProtocolResponse(request, {
              version: 1,
              kind: 'snapshot',
              snapshot: {
                taskId: 'Todo.completeAll',
                runId: 'run-1',
                status: 'completed',
                updatedAt: '2026-08-31T01:00:00.000Z',
              },
            }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: { completed: 2 } },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchRequest);
    const client = createFetchGraphClient({
      runtimeTransport: { requestId: () => 'inspect-1' },
    });

    await client.runtimeTransport?.durableOperation
      ?.observe({ taskId: 'Todo.completeAll', runId: 'run-1' })
      [Symbol.asyncIterator]()
      .next();
    await client.reflectedOperationInvoker?.invokeOperation({
      operationId: 'Todo.complete',
      input: { ids: ['todo-1'] },
    });

    expect(fetchRequest).toHaveBeenNthCalledWith(
      1,
      '/runtime',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"family":"durable.operation"'),
      }),
    );
    expect(fetchRequest).toHaveBeenNthCalledWith(
      2,
      '/operations',
      expect.objectContaining({ method: 'POST' }),
    );
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
