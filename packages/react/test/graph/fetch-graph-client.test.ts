import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchGraphClient } from '../../src/graph/index.js';

describe('Fetch graph client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assembles the conventional same-origin graph capabilities', () => {
    const client = createFetchGraphClient();

    expect(client.graphExecutor).toBeDefined();
    expect(client.operationBridgeAdapters).toHaveLength(1);
    expect(client.operationBridgeAdapters?.[0]?.name).toBe('fetch');
    expect(client.reflectedOperationInvoker).toBeDefined();
    expect(client.reflectedEntityDataReader).toBeDefined();
  });

  it('uses the conventional Operation and task endpoints', async () => {
    const fetchRequest = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ taskId: 'Todo.completeAll', runId: 'run-1', status: 'completed' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: { completed: 2 } },
        }),
      });
    vi.stubGlobal('fetch', fetchRequest);
    const client = createFetchGraphClient();

    await client.operationBridgeAdapters?.[0]?.getTaskSnapshot?.({
      taskId: 'Todo.completeAll',
      runId: 'run-1',
    });
    await client.reflectedOperationInvoker?.invokeOperation({
      operationId: 'Todo.complete',
      input: { ids: ['todo-1'] },
    });

    expect(fetchRequest).toHaveBeenNthCalledWith(1, '/operations/tasks/Todo.completeAll/run-1', {
      credentials: 'same-origin',
    });
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

  it('allows every conventional capability to be disabled', () => {
    expect(
      createFetchGraphClient({
        graphRead: false,
        operations: false,
        reflectedEntityData: false,
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
