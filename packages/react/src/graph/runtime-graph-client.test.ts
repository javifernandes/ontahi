import { runCollectArray } from '@ontahi/core/computation/stream';
import { entity, field, query } from '@ontahi/core/data-graph';
import { runBrowserEffect } from '@ontahi/core/runtime/browser';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeGraphClient } from './runtime-graph-client.js';

describe('Runtime Graph client', () => {
  it('assembles graph and operation capabilities around one Runtime Transport', () => {
    const runtimeTransport = { request: vi.fn() } as unknown as RuntimeTransport;
    const requestId = () => 'request-1';

    const client = createRuntimeGraphClient({
      runtimeTransport,
      requestId,
      reflectedEntityData: false,
      reflectedRelatedEntityData: false,
    });

    expect(client.runtimeTransport).toBe(runtimeTransport);
    expect(client.graph).toBeDefined();
    expect(client.graphExecutor.run).toBeTypeOf('function');
    expect(client.operationBridgeAdapters).toHaveLength(1);
    expect(client.reflectedOperationInvoker?.invokeOperation).toBeTypeOf('function');
    expect(client.reflectedEntityDataReader).toBeUndefined();
    expect(client.reflectedRelatedEntityDataReader).toBeUndefined();
  });

  it('includes the optional reflected readers by default', () => {
    const runtimeTransport = { request: vi.fn() } as unknown as RuntimeTransport;

    const client = createRuntimeGraphClient({ runtimeTransport });

    expect(client.reflectedEntityDataReader?.readEntityData).toBeTypeOf('function');
    expect(client.reflectedRelatedEntityDataReader?.readRelatedEntityData).toBeTypeOf('function');
  });

  it('binds remote Query observation to the Runtime Transport Graph stream', async () => {
    const Todo = entity('Todo', { id: field.id(), completed: field.boolean() });
    const openTodos = query(Todo).where(todo => todo.completed.eq(false));
    const observe = vi.fn(async function* () {
      yield { kind: 'graph-read-result' as const, value: [{ id: 'todo-1', completed: false }] };
      yield {
        kind: 'graph-read-result' as const,
        value: [
          { id: 'todo-1', completed: false },
          { id: 'todo-2', completed: false },
        ],
      };
    });
    const client = createRuntimeGraphClient({
      runtimeTransport: { request: vi.fn(), graph: { observe } } as RuntimeTransport,
      reflectedEntityData: false,
      reflectedRelatedEntityData: false,
    });

    await expect(
      runBrowserEffect(runCollectArray(client.graph.bindGraphRead(openTodos).observe())),
    ).resolves.toEqual([
      [{ id: 'todo-1', completed: false }],
      [
        { id: 'todo-1', completed: false },
        { id: 'todo-2', completed: false },
      ],
    ]);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'graph-read', mode: 'run' }),
      undefined,
    );
    expect(client.clientCache.inspect().records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: expect.objectContaining({ entityName: 'Todo', locator: { id: 'todo-1' } }),
          value: { id: 'todo-1', completed: false },
        }),
        expect.objectContaining({
          ref: expect.objectContaining({ entityName: 'Todo', locator: { id: 'todo-2' } }),
          value: { id: 'todo-2', completed: false },
        }),
      ]),
    );
  });
});
