import type { TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  type DurableOperationObservationCapability,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import type { FetchRuntimeTransport, WebSocketRuntimeTransport } from '@ontahi/react/graph';
import { describe, expect, it, vi } from 'vitest';

import {
  createTodoRuntimeTransportRouter,
  defaultTodoTransportRouting,
  httpTodoTransportRouting,
  loadTodoTransportRouting,
  saveTodoTransportRouting,
  splitTodoTransportRouting,
  todoTransportRoutingStorageKey,
} from './runtime-transport-routing.js';

const snapshot = (source: string): TaskSnapshot => ({
  taskId: 'TodoList.completeAll',
  runId: 'run-1',
  status: 'running',
  updatedAt: '2026-09-04T00:00:00.000Z',
  progress: { message: source },
});

const createTransport = (source: string) => {
  const request = vi.fn<RuntimeTransport<never>['request']>(async input =>
    createRuntimeProtocolResponse(input, { source }),
  );
  const observe: DurableOperationObservationCapability['observe'] = async function* <TResult>() {
    yield snapshot(source) as TaskSnapshot<TResult>;
  };
  return { request, durableOperation: { observe } };
};

const request = (id: string, family: string): RuntimeProtocolRequestEnvelope =>
  createRuntimeProtocolRequest({ id, family, body: null });

describe('Todo Runtime Transport routing', () => {
  it('routes each existing family and Durable observation independently', async () => {
    const http = createTransport('http');
    const websocket = { ...createTransport('websocket'), close: vi.fn() };
    const router = createTodoRuntimeTransportRouter({
      initialRouting: {
        graphRead: 'http',
        graphCommand: 'websocket',
        operation: 'http',
        durableProgress: 'websocket',
      },
      http: http as unknown as FetchRuntimeTransport<never>,
      websocket: websocket as unknown as WebSocketRuntimeTransport,
    });

    await router.transport.request(request('read-1', 'graph.read'));
    await router.transport.request(request('command-1', 'graph.command'));
    await router.transport.request(request('operation-1', 'operation'));
    await router.transport.request(request('inspect-1', 'durable.operation'));
    const observations = [];
    for await (const value of router.transport.durableOperation.observe({
      taskId: 'TodoList.completeAll',
      runId: 'run-1',
    })) {
      observations.push(value);
    }

    expect(http.request.mock.calls.map(([value]) => value.family)).toEqual([
      'graph.read',
      'operation',
    ]);
    expect(websocket.request.mock.calls.map(([value]) => value.family)).toEqual([
      'graph.command',
      'durable.operation',
    ]);
    expect(observations).toEqual([snapshot('websocket')]);
  });

  it('applies route changes to subsequent work and keeps unknown families on WebSocket', async () => {
    const http = createTransport('http');
    const websocket = { ...createTransport('websocket'), close: vi.fn() };
    const router = createTodoRuntimeTransportRouter({
      initialRouting: httpTodoTransportRouting,
      http: http as unknown as FetchRuntimeTransport<never>,
      websocket: websocket as unknown as WebSocketRuntimeTransport,
    });

    await router.transport.request(request('read-http', 'graph.read'));
    router.configure(defaultTodoTransportRouting);
    await router.transport.request(request('read-websocket', 'graph.read'));
    await router.transport.request(request('future-family', 'future.family'));
    router.close();

    expect(router.routing()).toEqual(defaultTodoTransportRouting);
    expect(http.request).toHaveBeenCalledOnce();
    expect(websocket.request).toHaveBeenCalledTimes(2);
    expect(websocket.close).toHaveBeenCalledOnce();
  });

  it('persists valid settings and falls back safely for stale storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    saveTodoTransportRouting(storage, splitTodoTransportRouting);
    expect(values.get(todoTransportRoutingStorageKey)).toBe(
      JSON.stringify(splitTodoTransportRouting),
    );
    expect(loadTodoTransportRouting(storage)).toEqual(splitTodoTransportRouting);

    values.set(todoTransportRoutingStorageKey, '{"graphRead":"tcp"}');
    expect(loadTodoTransportRouting(storage)).toEqual(defaultTodoTransportRouting);
  });
});
