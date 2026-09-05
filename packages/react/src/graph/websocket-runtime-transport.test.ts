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
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
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
  observeGraph?: Parameters<typeof createRuntimeProtocolServerSession<TContext>>[0]['observeGraph'];
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

const graphReadRequest = {
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: {
    kind: 'selection',
    entityName: 'Todo',
    expression: { kind: 'all' },
  },
  orderBy: [],
} as const;

const readyFrame = (
  capabilities: Array<'request-response' | 'durable-operation-push' | 'graph-observation-push'> = [
    'request-response',
    'durable-operation-push',
  ],
): RuntimeProtocolSessionServerFrame => ({
  protocol: 'ontahi.runtime.session',
  version: 1,
  kind: 'ready',
  capabilities,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  it('receives repeated Graph results and their explicit stream completion', async () => {
    const pair = createSessionSocketFactory({
      dispatcher: async input =>
        createRuntimeProtocolResponse(input as RuntimeProtocolRequestEnvelope, null),
      context: { principal: 'receiver-session' },
      observeGraph: (_request, { context }) =>
        (async function* () {
          expect(context).toEqual({ principal: 'receiver-session' });
          yield { kind: 'graph-read-result' as const, value: [{ id: 'todo-1' }] };
          yield {
            kind: 'graph-read-result' as const,
            value: [{ id: 'todo-1' }, { id: 'todo-2' }],
          };
        })(),
    });
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: pair.createWebSocket,
      observationId: () => 'graph-observation-1',
    });
    const received = [];

    for await (const body of transport.graph.observe(graphReadRequest)) received.push(body);

    expect(received).toEqual([
      { kind: 'graph-read-result', value: [{ id: 'todo-1' }] },
      { kind: 'graph-read-result', value: [{ id: 'todo-1' }, { id: 'todo-2' }] },
    ]);
    expect(pair.sockets[0]?.sent).toEqual([
      {
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'graph-observe',
        id: 'graph-observation-1',
        request: graphReadRequest,
      },
    ]);
  });

  it('unsubscribes an aborted Graph observation and releases the server iterator', async () => {
    let serverSignal: AbortSignal | undefined;
    const pair = createSessionSocketFactory({
      dispatcher: async input =>
        createRuntimeProtocolResponse(input as RuntimeProtocolRequestEnvelope, null),
      context: undefined,
      observeGraph: (_request, { signal }) =>
        (async function* () {
          serverSignal = signal;
          yield { kind: 'graph-read-result' as const, value: [{ id: 'todo-1' }] };
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
      observationId: () => 'graph-observation-1',
    });
    const controller = new AbortController();
    const iterator = transport.graph
      .observe(graphReadRequest, { signal: controller.signal })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { kind: 'graph-read-result', value: [{ id: 'todo-1' }] },
    });
    controller.abort();
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    await vi.waitFor(() => expect(serverSignal?.aborted).toBe(true));
    expect(pair.sockets[0]?.sent.at(-1)).toMatchObject({
      kind: 'graph-unobserve',
      id: 'graph-observation-1',
    });
  });

  it('ignores duplicate, out-of-order, and post-terminal snapshots by observation sequence', async () => {
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

  it('detaches a stale closing socket before replacing its session', async () => {
    const sockets: MemoryWebSocket[] = [];
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: () => {
        const socket = new MemoryWebSocket();
        sockets.push(socket);
        socket.sendFromServer(readyFrame(['request-response']));
        return socket;
      },
    });

    const first = transport.request(operationRequest('request-1'));
    await vi.waitFor(() => expect(sockets[0]?.sent).toHaveLength(1));
    const firstRejected = expect(first).rejects.toThrow('active work was not resumed');
    sockets[0]!.readyState = 2;

    const second = transport.request(operationRequest('request-2'));
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    await firstRejected;
    expect(sockets[0]?.listenerCount('message')).toBe(0);
    expect(sockets[0]?.listenerCount('error')).toBe(0);
    expect(sockets[0]?.listenerCount('close')).toBe(0);

    sockets[0]?.sendFromServer({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'response',
      response: createRuntimeProtocolResponse(operationRequest('request-2'), { source: 'stale' }),
    });
    await vi.waitFor(() => expect(sockets[1]?.sent).toHaveLength(1));
    sockets[1]?.sendFromServer({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'response',
      response: createRuntimeProtocolResponse(operationRequest('request-2'), { source: 'current' }),
    });

    await expect(second).resolves.toMatchObject({ body: { source: 'current' } });
    transport.close();
  });

  it('resolves a browser-relative URL, forwards protocols, and validates construction options', async () => {
    const socket = new MemoryWebSocket();
    const createWebSocket = vi.fn((..._args: [string, string | string[] | undefined]) => {
      socket.sendFromServer(readyFrame([]));
      return socket;
    });
    const transport = createWebSocketRuntimeTransport({
      protocols: ['ontahi.runtime.session.v1'],
      createWebSocket,
    });

    await expect(transport.request(operationRequest('request-1'))).rejects.toThrow(
      'request/response is unavailable',
    );
    const [resolvedUrl, protocols] = createWebSocket.mock.calls[0]!;
    expect(new URL(resolvedUrl)).toMatchObject({ protocol: 'ws:', pathname: '/runtime' });
    expect(protocols).toEqual(['ontahi.runtime.session.v1']);
    expect(() => createWebSocketRuntimeTransport({ handshakeTimeoutMs: -1 })).toThrow(
      'handshake timeout must be non-negative',
    );

    const closed = createWebSocketRuntimeTransport({ createWebSocket });
    closed.close();
    closed.close();
    await expect(closed.request(operationRequest('closed'))).rejects.toThrow('transport is closed');
  });

  it('fails when the default WebSocket implementation is unavailable', async () => {
    vi.stubGlobal('WebSocket', undefined);
    const transport = createWebSocketRuntimeTransport({ url: 'ws://runtime.test/runtime' });

    await expect(transport.request(operationRequest('request-1'))).rejects.toThrow(
      'WebSocket is unavailable',
    );
  });

  it('times out a session that never completes its handshake', async () => {
    const socket = new MemoryWebSocket();
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: () => socket,
      handshakeTimeoutMs: 0,
    });

    await expect(transport.request(operationRequest('request-1'))).rejects.toThrow(
      'handshake timed out',
    );
    expect(socket.readyState).toBe(3);
  });

  it('fails active work on malformed and unexpected session frames', async () => {
    const malformedSocket = new MemoryWebSocket();
    const malformedErrors: Error[] = [];
    const malformedTransport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: () => {
        queueMicrotask(() => malformedSocket.emit('message', { data: '{not-json' }));
        return malformedSocket;
      },
      reportError: error => malformedErrors.push(error),
    });

    await expect(malformedTransport.request(operationRequest('malformed'))).rejects.toThrow(
      'session frame must be an object',
    );
    expect(malformedErrors).toHaveLength(1);
    expect(malformedSocket.readyState).toBe(3);

    const duplicateReadySocket = new MemoryWebSocket();
    const duplicateReadyErrors: Error[] = [];
    const duplicateReadyTransport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: () => {
        duplicateReadySocket.sendFromServer(readyFrame());
        return duplicateReadySocket;
      },
      reportError: error => duplicateReadyErrors.push(error),
    });
    const pending = duplicateReadyTransport.request(operationRequest('pending'));
    await vi.waitFor(() => expect(duplicateReadySocket.sent).toHaveLength(1));
    duplicateReadySocket.sendFromServer(readyFrame());

    await expect(pending).rejects.toThrow('unexpected ready frame');
    expect(duplicateReadyErrors).toHaveLength(1);
  });

  it('routes correlated session and observation errors without closing the session', async () => {
    const socket = new MemoryWebSocket();
    const reported: Error[] = [];
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      observationId: () => 'observation-1',
      createWebSocket: () => {
        socket.sendFromServer(readyFrame());
        return socket;
      },
      reportError: error => reported.push(error),
    });

    const request = transport.request(operationRequest('request-1'));
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    socket.sendFromServer({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'session-error',
      id: 'request-1',
      error: { code: 'request_failed', message: 'request exploded' },
    });
    await expect(request).rejects.toThrow('request exploded');

    const iterator = transport.durableOperation
      .observe({ taskId: 'Todo.completeAll', runId: 'run-1' })
      [Symbol.asyncIterator]();
    const next = iterator.next();
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
    socket.sendFromServer({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'session-error',
      id: 'observation-1',
      error: { code: 'observation_failed', message: 'observation exploded' },
    });
    await expect(next).rejects.toThrow('observation exploded');

    socket.sendFromServer({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'session-error',
      error: { code: 'request_failed', message: 'uncorrelated failure' },
    });
    await vi.waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0]?.message).toBe('uncorrelated failure');
    transport.close();
  });

  it('propagates a Durable Operation protocol error', async () => {
    const socket = new MemoryWebSocket();
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      observationId: () => 'observation-1',
      createWebSocket: () => {
        socket.sendFromServer(readyFrame());
        return socket;
      },
    });
    const iterator = transport.durableOperation
      .observe({ taskId: 'Todo.completeAll', runId: 'run-1' })
      [Symbol.asyncIterator]();
    const next = iterator.next();
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    socket.sendFromServer({
      protocol: 'ontahi.runtime.session',
      version: 1,
      kind: 'durable-observation',
      id: 'observation-1',
      sequence: 1,
      body: {
        kind: 'protocol-error',
        error: { code: 'inspection_unavailable', message: 'inspection failed' },
      },
    });

    await expect(next).rejects.toThrow('inspection failed');
  });

  it('enforces unique pending ids and aborts requests locally', async () => {
    const socket = new MemoryWebSocket();
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: () => {
        socket.sendFromServer(readyFrame(['request-response']));
        return socket;
      },
    });
    const controller = new AbortController();
    const first = transport.request(operationRequest('shared-id'), { signal: controller.signal });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));

    await expect(transport.request(operationRequest('shared-id'))).rejects.toThrow(
      'already pending',
    );
    controller.abort();
    await expect(first).rejects.toThrow('request was aborted');
  });

  it('rejects missing push capability and duplicate observation ids', async () => {
    const noPushSocket = new MemoryWebSocket();
    const noPushTransport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      createWebSocket: () => {
        noPushSocket.sendFromServer(readyFrame(['request-response']));
        return noPushSocket;
      },
    });
    const unavailable = noPushTransport.durableOperation
      .observe({ taskId: 'Todo.completeAll', runId: 'run-1' })
      [Symbol.asyncIterator]();
    await expect(unavailable.next()).rejects.toThrow('push is unavailable');

    const socket = new MemoryWebSocket();
    const transport = createWebSocketRuntimeTransport({
      url: 'ws://runtime.test/runtime',
      observationId: () => 'shared-observation',
      createWebSocket: () => {
        socket.sendFromServer(readyFrame());
        return socket;
      },
    });
    const controller = new AbortController();
    const first = transport.durableOperation
      .observe({ taskId: 'Todo.completeAll', runId: 'run-1' }, { signal: controller.signal })
      [Symbol.asyncIterator]();
    const firstNext = first.next();
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const duplicate = transport.durableOperation
      .observe({ taskId: 'Todo.completeAll', runId: 'run-2' })
      [Symbol.asyncIterator]();
    await expect(duplicate.next()).rejects.toThrow('already active');

    controller.abort();
    await expect(firstNext).resolves.toEqual({ done: true, value: undefined });
  });
});
