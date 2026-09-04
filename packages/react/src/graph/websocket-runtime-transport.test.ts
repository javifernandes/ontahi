import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  createRuntimeProtocolServerSession,
  type RuntimeProtocolDispatchResult,
  type RuntimeProtocolDispatcher,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolServerSession,
  type RuntimeProtocolSessionServerFrame,
} from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import {
  createWebSocketRuntimeTransport,
  type RuntimeWebSocket,
} from './websocket-runtime-transport.js';

type SocketListener = (event: { data?: unknown; code?: number; reason?: string }) => void;

class MemoryWebSocket implements RuntimeWebSocket {
  readyState = 1;
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, Set<SocketListener>>();
  receive?: (frame: unknown) => void;

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: SocketListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    const frame: unknown = JSON.parse(data);
    this.sent.push(frame);
    this.receive?.(frame);
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', { code, reason });
  }

  emit(type: string, event: { data?: unknown; code?: number; reason?: string }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  sendFromServer(frame: unknown) {
    queueMicrotask(() => this.emit('message', { data: JSON.stringify(frame) }));
  }
}

const createSessionSocketFactory = <TContext>(options: {
  dispatcher: RuntimeProtocolDispatcher<TContext>;
  context: TContext;
  observeDurableOperation?: Parameters<
    typeof createRuntimeProtocolServerSession<TContext>
  >[0]['observeDurableOperation'];
}) => {
  const sockets: MemoryWebSocket[] = [];
  const sessions: RuntimeProtocolServerSession[] = [];
  const createWebSocket = () => {
    const socket = new MemoryWebSocket();
    const session = createRuntimeProtocolServerSession({
      ...options,
      send: frame => socket.sendFromServer(frame),
    });
    socket.receive = frame => {
      void session.receive(frame);
    };
    sockets.push(socket);
    sessions.push(session);
    return socket;
  };
  return { createWebSocket, sockets, sessions };
};

const operationRequest = (id: string) =>
  createRuntimeProtocolRequest({
    id,
    family: 'operation',
    body: { version: 1, kind: 'invoke', operationId: 'Todo.completeAll' },
  });

describe('WebSocket Runtime Transport', () => {
  it('correlates concurrent request/response families over one lazy session', async () => {
    const pending = new Map<string, (body: { readonly source: string }) => void>();
    const dispatcher: RuntimeProtocolDispatcher<{ principal: string }> = (input, context) => {
      const request = input as RuntimeProtocolRequestEnvelope;
      return new Promise(resolve => {
        pending.set(request.id, body =>
          resolve(
            createRuntimeProtocolResponse(request, {
              ...body,
              principal: context.principal,
            }),
          ),
        );
      });
    };
    const pair = createSessionSocketFactory({
      dispatcher,
      context: { principal: 'receiver-session' },
    });
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: pair.createWebSocket,
    });

    const first = transport.request(operationRequest('request-1'));
    const second = transport.request(
      createRuntimeProtocolRequest({
        id: 'request-2',
        family: 'graph.read',
        body: { version: 1, kind: 'graph-read', mode: 'run', selection: {} },
      }),
    );
    await vi.waitFor(() => expect(pending.size).toBe(2));
    pending.get('request-2')?.({ source: 'graph.read' });
    pending.get('request-1')?.({ source: 'operation' });

    await expect(second).resolves.toMatchObject({
      id: 'request-2',
      family: 'graph.read',
      body: { source: 'graph.read', principal: 'receiver-session' },
    });
    await expect(first).resolves.toMatchObject({
      id: 'request-1',
      family: 'operation',
      body: { source: 'operation', principal: 'receiver-session' },
    });
    expect(pair.sockets).toHaveLength(1);
    expect(pair.sockets[0]?.sent.map(frame => (frame as { kind: string }).kind)).toEqual([
      'request',
      'request',
    ]);
  });

  it('receives pushed Durable progress and terminal result without inspect polling', async () => {
    const pair = createSessionSocketFactory({
      dispatcher: async input =>
        createRuntimeProtocolResponse(input as RuntimeProtocolRequestEnvelope, null),
      context: undefined,
      observeDurableOperation: () =>
        (async function* () {
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'running' as const,
            updatedAt: '2026-09-04T00:00:00.000Z',
            progress: { phase: 'updating' },
          };
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'completed' as const,
            updatedAt: '2026-09-04T00:00:01.000Z',
            completedAt: '2026-09-04T00:00:01.000Z',
            progress: { phase: 'updating' },
            result: { completed: 2 },
          };
        })(),
    });
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: pair.createWebSocket,
      observationId: () => 'observation-1',
    });
    const received = [];

    for await (const snapshot of transport.durableOperation.observe({
      taskId: 'Todo.completeAll',
      runId: 'run-1',
    })) {
      received.push(snapshot);
    }

    expect(received).toMatchObject([
      { status: 'running', progress: { phase: 'updating' } },
      { status: 'completed', result: { completed: 2 } },
    ]);
    expect(pair.sockets[0]?.sent).toEqual([
      {
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-observe',
        id: 'observation-1',
        run: { taskId: 'Todo.completeAll', runId: 'run-1' },
      },
    ]);
  });

  it('ignores duplicate, out-of-order, and post-terminal snapshots by session sequence', async () => {
    const socket = new MemoryWebSocket();
    const snapshotFrame = (
      sequence: number,
      status: 'running' | 'completed' | 'failed',
    ): RuntimeProtocolSessionServerFrame => ({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'durable-observation',
      id: 'observation-1',
      sequence,
      body: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          taskId: 'Todo.completeAll',
          runId: 'run-1',
          status,
          updatedAt: `2026-09-04T00:00:0${sequence}.000Z`,
          ...(status === 'completed'
            ? { completedAt: '2026-09-04T00:00:03.000Z', result: { completed: 2 } }
            : {}),
        },
      },
    });
    socket.receive = frame => {
      if ((frame as { kind: string }).kind !== 'durable-observe') return;
      socket.sendFromServer(snapshotFrame(2, 'running'));
      socket.sendFromServer(snapshotFrame(2, 'failed'));
      socket.sendFromServer(snapshotFrame(1, 'failed'));
      socket.sendFromServer(snapshotFrame(3, 'completed'));
      socket.sendFromServer(snapshotFrame(4, 'failed'));
    };
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      observationId: () => 'observation-1',
      createWebSocket: () => {
        socket.sendFromServer({
          protocol: 'ontahi.runtime.session',
          version: 1,
          kind: 'ready',
          capabilities: ['request-response', 'durable-operation-push'],
        });
        return socket;
      },
    });
    const received = [];

    for await (const snapshot of transport.durableOperation.observe({
      taskId: 'Todo.completeAll',
      runId: 'run-1',
    })) {
      received.push(snapshot.status);
    }

    expect(received).toEqual(['running', 'completed']);
  });

  it('fails a mismatched run and unsubscribes the server observation', async () => {
    const socket = new MemoryWebSocket();
    socket.receive = frame => {
      if ((frame as { kind: string }).kind !== 'durable-observe') return;
      socket.sendFromServer({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-observation',
        id: 'observation-1',
        sequence: 1,
        body: {
          version: 1,
          kind: 'snapshot',
          snapshot: {
            taskId: 'Todo.completeAll',
            runId: 'another-run',
            status: 'running',
            updatedAt: '2026-09-04T00:00:00.000Z',
          },
        },
      });
    };
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      observationId: () => 'observation-1',
      createWebSocket: () => {
        socket.sendFromServer({
          protocol: 'ontahi.runtime.session',
          version: 1,
          kind: 'ready',
          capabilities: ['request-response', 'durable-operation-push'],
        });
        return socket;
      },
    });
    const observe = async () => {
      for await (const _snapshot of transport.durableOperation.observe({
        taskId: 'Todo.completeAll',
        runId: 'run-1',
      })) {
        // No mismatched snapshot is exposed.
      }
    };

    await expect(observe()).rejects.toThrow(
      'Durable Operation snapshot identity does not match the observed run.',
    );
    expect(socket.sent.at(-1)).toMatchObject({
      kind: 'durable-unobserve',
      id: 'observation-1',
    });
  });

  it('aborts observation resources and does not resume them after disconnect', async () => {
    let serverSignal: AbortSignal | undefined;
    const pair = createSessionSocketFactory({
      dispatcher: () => new Promise<RuntimeProtocolDispatchResult>(() => undefined),
      context: undefined,
      observeDurableOperation: (_run, { signal }) =>
        (async function* () {
          serverSignal = signal;
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'running' as const,
            updatedAt: '2026-09-04T00:00:00.000Z',
          };
          if (!signal.aborted) {
            await new Promise<void>(resolve =>
              signal.addEventListener('abort', () => resolve(), { once: true }),
            );
          }
        })(),
    });
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: pair.createWebSocket,
      observationId: () => 'observation-1',
    });
    const controller = new AbortController();
    const iterator = transport.durableOperation
      .observe({ taskId: 'Todo.completeAll', runId: 'run-1' }, { signal: controller.signal })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { status: 'running' },
    });
    controller.abort();
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    await vi.waitFor(() => expect(serverSignal?.aborted).toBe(true));
    expect(pair.sockets[0]?.sent.at(-1)).toMatchObject({ kind: 'durable-unobserve' });

    const disconnected = transport.request(operationRequest('request-after-abort'));
    await vi.waitFor(() => expect(pair.sockets[0]?.sent).toHaveLength(3));
    pair.sessions[0]?.close();
    pair.sockets[0]?.close(1006, 'network lost');
    await expect(disconnected).rejects.toThrow('active work was not resumed');

    const reconnected = transport.request(operationRequest('request-after-reconnect'));
    await vi.waitFor(() => expect(pair.sockets).toHaveLength(2));
    transport.close();
    await expect(reconnected).rejects.toThrow('transport is closed');
  });
});
