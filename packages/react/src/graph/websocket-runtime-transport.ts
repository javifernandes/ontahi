'use client';

import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  parseRuntimeProtocolResponse,
  parseRuntimeProtocolSessionServerFrame,
  RUNTIME_PROTOCOL_SESSION_NAME,
  RUNTIME_PROTOCOL_SESSION_VERSION,
  type DurableOperationObservationCapability,
  type GraphObservationCapability,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolGraphObservationBody,
  type RuntimeProtocolSessionClientFrame,
  type RuntimeProtocolSessionServerFrame,
  type RuntimeTransport,
  type RuntimeTransportRequestOptions,
} from '@ontahi/core/runtime/protocol';

type WebSocketEvent = {
  readonly data?: unknown;
  readonly code?: number;
  readonly reason?: string;
};

export type RuntimeWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: WebSocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: WebSocketEvent) => void): void;
};

export type WebSocketRuntimeTransportOptions = {
  readonly url?: string;
  readonly protocols?: string | string[];
  readonly createWebSocket?: (url: string, protocols?: string | string[]) => RuntimeWebSocket;
  readonly observationId?: () => string;
  readonly handshakeTimeoutMs?: number;
  readonly reportError?: (error: Error) => void;
};

export type WebSocketRuntimeTransport = RuntimeTransport<never> & {
  readonly durableOperation: DurableOperationObservationCapability;
  readonly graph: GraphObservationCapability<never>;
  close(): void;
};

type PendingRequest = {
  readonly request: RuntimeProtocolRequestEnvelope;
  readonly resolve: RuntimeTransport['request'] extends (...args: any[]) => Promise<infer TResult>
    ? (result: TResult) => void
    : never;
  readonly reject: (error: Error) => void;
  readonly removeAbortListener: () => void;
};

type QueueWaiter<TValue> = {
  readonly resolve: (result: IteratorResult<TValue>) => void;
  readonly reject: (error: Error) => void;
};

type AsyncQueue<TValue> = {
  readonly next: () => Promise<IteratorResult<TValue>>;
  readonly push: (value: TValue) => void;
  readonly end: () => void;
  readonly fail: (error: Error) => void;
};

const createAsyncQueue = <TValue>(): AsyncQueue<TValue> => {
  const values: TValue[] = [];
  const waiters: QueueWaiter<TValue>[] = [];
  let ended = false;
  let failure: Error | undefined;

  const settleWaiters = () => {
    while (waiters.length > 0) {
      const waiter = waiters.shift()!;
      if (failure) waiter.reject(failure);
      else waiter.resolve({ done: true, value: undefined });
    }
  };

  return {
    next: () => {
      const value = values.shift();
      if (value !== undefined) return Promise.resolve({ done: false, value });
      if (failure) return Promise.reject(failure);
      if (ended) return Promise.resolve({ done: true, value: undefined });
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    push: value => {
      if (ended || failure) return;
      const waiter = waiters.shift();
      if (waiter) waiter.resolve({ done: false, value });
      else values.push(value);
    },
    end: () => {
      if (ended || failure) return;
      ended = true;
      settleWaiters();
    },
    fail: error => {
      if (ended || failure) return;
      failure = error;
      settleWaiters();
    },
  };
};

type ActiveDurableObservation = {
  readonly run: TaskRunIdentity;
  readonly queue: AsyncQueue<TaskSnapshot>;
  lastSequence: number;
  terminal: boolean;
};

type ActiveGraphObservation = {
  readonly queue: AsyncQueue<RuntimeProtocolGraphObservationBody>;
  lastSequence: number;
  terminal: boolean;
};

const SOCKET_OPEN = 1;
const DEFAULT_RUNTIME_PATH = '/runtime';
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const terminalTaskStatuses = new Set(['completed', 'failed', 'cancelled']);

let fallbackObservationSequence = 0;

const defaultObservationId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `ontahi-observation-${Date.now()}-${(fallbackObservationSequence += 1)}`;

const resolveWebSocketUrl = (configuredUrl = DEFAULT_RUNTIME_PATH) => {
  if (/^wss?:\/\//.test(configuredUrl)) return configuredUrl;
  if (!globalThis.location?.href) {
    throw new Error('A WebSocket Runtime Transport url is required outside a browser.');
  }
  const url = new URL(configuredUrl, globalThis.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

const createDefaultWebSocket = (url: string, protocols?: string | string[]): RuntimeWebSocket => {
  if (!globalThis.WebSocket) {
    throw new Error('WebSocket is unavailable in this runtime.');
  }
  return new globalThis.WebSocket(url, protocols) as unknown as RuntimeWebSocket;
};

const abortError = (message: string) => new Error(message);

const awaitWithSignal = async <TValue>(
  promise: Promise<TValue>,
  signal: AbortSignal | undefined,
  message: string,
): Promise<TValue> => {
  if (!signal) return promise;
  if (signal.aborted) throw abortError(message);
  return new Promise<TValue>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(abortError(message));
    };
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      value => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
};

export const createWebSocketRuntimeTransport = ({
  url,
  protocols,
  createWebSocket = createDefaultWebSocket,
  observationId = defaultObservationId,
  handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
  reportError,
}: WebSocketRuntimeTransportOptions = {}): WebSocketRuntimeTransport => {
  if (!Number.isFinite(handshakeTimeoutMs) || handshakeTimeoutMs < 0) {
    throw new TypeError('Runtime Protocol WebSocket handshake timeout must be non-negative.');
  }

  let socket: RuntimeWebSocket | undefined;
  let connection:
    | {
        readonly promise: Promise<ReadonlySet<string>>;
        readonly resolve: (capabilities: ReadonlySet<string>) => void;
        readonly reject: (error: Error) => void;
        readonly timeout: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let capabilities: ReadonlySet<string> | undefined;
  let removeSocketListeners: (() => void) | undefined;
  let disposed = false;
  const pendingRequests = new Map<string, PendingRequest>();
  const durableObservations = new Map<string, ActiveDurableObservation>();
  const graphObservations = new Map<string, ActiveGraphObservation>();

  const send = (frame: RuntimeProtocolSessionClientFrame) => {
    if (disposed) throw new Error('Runtime Protocol WebSocket transport is closed.');
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      throw new Error('Runtime Protocol WebSocket session is not open.');
    }
    socket.send(JSON.stringify(frame));
  };

  const failActiveWork = (error: Error) => {
    for (const pending of pendingRequests.values()) {
      pending.removeAbortListener();
      pending.reject(error);
    }
    pendingRequests.clear();
    for (const observation of durableObservations.values()) observation.queue.fail(error);
    durableObservations.clear();
    for (const observation of graphObservations.values()) observation.queue.fail(error);
    graphObservations.clear();
  };

  const failConnection = (currentSocket: RuntimeWebSocket, error: Error) => {
    if (socket !== currentSocket) return;
    removeSocketListeners?.();
    removeSocketListeners = undefined;
    connection?.reject(error);
    if (connection) clearTimeout(connection.timeout);
    connection = undefined;
    capabilities = undefined;
    socket = undefined;
    failActiveWork(error);
  };

  const handleFrame = (currentSocket: RuntimeWebSocket, input: unknown) => {
    const parsed = parseRuntimeProtocolSessionServerFrame(input);
    if (!parsed.success) {
      const error = new Error(parsed.error.error.message);
      reportError?.(error);
      failConnection(currentSocket, error);
      currentSocket.close(1002, 'Invalid Runtime Protocol session frame');
      return;
    }

    const frame: RuntimeProtocolSessionServerFrame = parsed.frame;
    if (frame.kind === 'ready') {
      if (!connection || capabilities) {
        const error = new Error(
          'Runtime Protocol WebSocket session sent an unexpected ready frame.',
        );
        reportError?.(error);
        failConnection(currentSocket, error);
        currentSocket.close(1002, 'Unexpected Runtime Protocol ready frame');
        return;
      }
      capabilities = new Set(frame.capabilities);
      clearTimeout(connection.timeout);
      connection.resolve(capabilities);
      connection = undefined;
      return;
    }

    if (frame.kind === 'response') {
      const id = frame.response.id;
      if (!id) return;
      const pending = pendingRequests.get(id);
      if (!pending) return;
      pendingRequests.delete(id);
      pending.removeAbortListener();
      const response = parseRuntimeProtocolResponse(frame.response, pending.request);
      if (!response.success) pending.reject(new Error(response.error.error.message));
      else pending.resolve(response.response);
      return;
    }

    if (frame.kind === 'session-error') {
      const error = new Error(frame.error.message);
      if (frame.id) {
        const pending = pendingRequests.get(frame.id);
        if (pending) {
          pendingRequests.delete(frame.id);
          pending.removeAbortListener();
          pending.reject(error);
          return;
        }
        const durableObservation = durableObservations.get(frame.id);
        if (durableObservation) {
          durableObservations.delete(frame.id);
          durableObservation.queue.fail(error);
          return;
        }
        const graphObservation = graphObservations.get(frame.id);
        if (graphObservation) {
          graphObservations.delete(frame.id);
          graphObservation.queue.fail(error);
          return;
        }
      }
      reportError?.(error);
      return;
    }

    if (frame.kind === 'durable-observation') {
      const observation = durableObservations.get(frame.id);
      if (!observation || observation.terminal || frame.sequence <= observation.lastSequence) return;
      observation.lastSequence = frame.sequence;
      if (frame.body.kind === 'protocol-error') {
        durableObservations.delete(frame.id);
        observation.queue.fail(new Error(frame.body.error.message));
        return;
      }

      const snapshot = frame.body.snapshot;
      if (snapshot.taskId !== observation.run.taskId || snapshot.runId !== observation.run.runId) {
        durableObservations.delete(frame.id);
        observation.queue.fail(
          new Error('Durable Operation snapshot identity does not match the observed run.'),
        );
        try {
          send({
            protocol: RUNTIME_PROTOCOL_SESSION_NAME,
            version: RUNTIME_PROTOCOL_SESSION_VERSION,
            kind: 'durable-unobserve',
            id: frame.id,
          });
        } catch {
          // The failed observation is already detached locally.
        }
        return;
      }

      observation.queue.push(snapshot);
      if (terminalTaskStatuses.has(snapshot.status)) {
        observation.terminal = true;
        observation.queue.end();
      }
      return;
    }

    const observation = graphObservations.get(frame.id);
    if (!observation || observation.terminal || frame.sequence <= observation.lastSequence) return;
    observation.lastSequence = frame.sequence;
    if (frame.kind === 'graph-observation-complete') {
      observation.terminal = true;
      graphObservations.delete(frame.id);
      observation.queue.end();
      return;
    }
    observation.queue.push(frame.body);
    if (frame.body.kind === 'protocol-error') {
      observation.terminal = true;
      graphObservations.delete(frame.id);
      observation.queue.end();
    }
  };

  const ensureConnection = (): Promise<ReadonlySet<string>> => {
    if (disposed)
      return Promise.reject(new Error('Runtime Protocol WebSocket transport is closed.'));
    if (capabilities && socket?.readyState === SOCKET_OPEN) return Promise.resolve(capabilities);
    if (connection) return connection.promise;

    if (socket) {
      failConnection(
        socket,
        new Error('Runtime Protocol WebSocket session was replaced; active work was not resumed.'),
      );
    }

    const currentSocket = createWebSocket(resolveWebSocketUrl(url), protocols);
    socket = currentSocket;
    let resolveConnection!: (value: ReadonlySet<string>) => void;
    let rejectConnection!: (error: Error) => void;
    const promise = new Promise<ReadonlySet<string>>((resolve, reject) => {
      resolveConnection = resolve;
      rejectConnection = reject;
    });
    const timeout = setTimeout(() => {
      const error = new Error('Runtime Protocol WebSocket session handshake timed out.');
      failConnection(currentSocket, error);
      currentSocket.close(1002, 'Runtime Protocol handshake timeout');
    }, handshakeTimeoutMs);
    connection = {
      promise,
      resolve: resolveConnection,
      reject: rejectConnection,
      timeout,
    };

    const onMessage = (event: WebSocketEvent) => {
      let input: unknown;
      try {
        input = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        input = undefined;
      }
      handleFrame(currentSocket, input);
    };
    const onError = () =>
      failConnection(currentSocket, new Error('Runtime Protocol WebSocket session failed.'));
    const onClose = (event: WebSocketEvent) =>
      failConnection(
        currentSocket,
        new Error(
          `Runtime Protocol WebSocket session disconnected${
            event.code === undefined
              ? ''
              : ` (${event.code}${event.reason ? `: ${event.reason}` : ''})`
          }; active work was not resumed.`,
        ),
      );
    currentSocket.addEventListener('message', onMessage);
    currentSocket.addEventListener('error', onError);
    currentSocket.addEventListener('close', onClose);
    removeSocketListeners = () => {
      currentSocket.removeEventListener('message', onMessage);
      currentSocket.removeEventListener('error', onError);
      currentSocket.removeEventListener('close', onClose);
    };

    return promise;
  };

  const request: RuntimeTransport['request'] = async (runtimeRequest, options) => {
    const signal = options?.signal;
    const connectedCapabilities = await awaitWithSignal(
      ensureConnection(),
      signal,
      'Runtime Protocol WebSocket request was aborted.',
    );
    if (!connectedCapabilities.has('request-response')) {
      throw new Error(
        'Runtime Protocol request/response is unavailable in this WebSocket session.',
      );
    }
    if (pendingRequests.has(runtimeRequest.id)) {
      throw new Error(`Runtime Protocol request id ${runtimeRequest.id} is already pending.`);
    }

    return new Promise((resolve, reject) => {
      const abort = () => {
        const pending = pendingRequests.get(runtimeRequest.id);
        if (!pending) return;
        pendingRequests.delete(runtimeRequest.id);
        pending.removeAbortListener();
        reject(abortError('Runtime Protocol WebSocket request was aborted.'));
      };
      const removeAbortListener = () => signal?.removeEventListener('abort', abort);
      pendingRequests.set(runtimeRequest.id, {
        request: runtimeRequest,
        resolve,
        reject,
        removeAbortListener,
      });
      signal?.addEventListener('abort', abort, { once: true });

      try {
        send({
          protocol: RUNTIME_PROTOCOL_SESSION_NAME,
          version: RUNTIME_PROTOCOL_SESSION_VERSION,
          kind: 'request',
          request: runtimeRequest,
        });
      } catch (error) {
        pendingRequests.delete(runtimeRequest.id);
        removeAbortListener();
        reject(
          error instanceof Error ? error : new Error('Runtime Protocol WebSocket send failed.'),
        );
      }
    });
  };

  const observeDurable: DurableOperationObservationCapability['observe'] = async function* <TResult>(
    run: TaskRunIdentity,
    options?: RuntimeTransportRequestOptions,
  ): AsyncIterable<TaskSnapshot<TResult>> {
    if (options?.signal?.aborted) return;
    const id = observationId();
    const queue = createAsyncQueue<TaskSnapshot>();
    const observation: ActiveDurableObservation = {
      run,
      queue,
      lastSequence: 0,
      terminal: false,
    };
    let subscribed = false;
    const abort = () => queue.end();
    options?.signal?.addEventListener('abort', abort, { once: true });

    try {
      const connectedCapabilities = await awaitWithSignal(
        ensureConnection(),
        options?.signal,
        'Durable Operation WebSocket observation was aborted.',
      );
      if (!connectedCapabilities.has('durable-operation-push')) {
        throw new Error('Durable Operation push is unavailable in this WebSocket session.');
      }
      if (durableObservations.has(id) || graphObservations.has(id)) {
        throw new Error(`Durable observation id ${id} is already active.`);
      }
      durableObservations.set(id, observation);
      send({
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'durable-observe',
        id,
        run: { taskId: run.taskId, runId: run.runId },
      });
      subscribed = true;

      while (true) {
        const next = await queue.next();
        if (next.done) return;
        yield next.value as TaskSnapshot<TResult>;
      }
    } catch (error) {
      if (!options?.signal?.aborted) throw error;
    } finally {
      options?.signal?.removeEventListener('abort', abort);
      if (durableObservations.get(id) === observation) durableObservations.delete(id);
      if (subscribed && !observation.terminal) {
        try {
          send({
            protocol: RUNTIME_PROTOCOL_SESSION_NAME,
            version: RUNTIME_PROTOCOL_SESSION_VERSION,
            kind: 'durable-unobserve',
            id,
          });
        } catch {
          // Disconnect already released the server-side session resources.
        }
      }
    }
  };

  const observeGraph: GraphObservationCapability<never>['observe'] = async function* (
    request,
    options,
  ) {
    if (options?.signal?.aborted) return;
    const id = observationId();
    const queue = createAsyncQueue<RuntimeProtocolGraphObservationBody>();
    const observation: ActiveGraphObservation = {
      queue,
      lastSequence: 0,
      terminal: false,
    };
    let subscribed = false;
    const abort = () => queue.end();
    options?.signal?.addEventListener('abort', abort, { once: true });

    try {
      const connectedCapabilities = await awaitWithSignal(
        ensureConnection(),
        options?.signal,
        'Data graph WebSocket observation was aborted.',
      );
      if (!connectedCapabilities.has('graph-observation-push')) {
        throw new Error('Data graph push observation is unavailable in this WebSocket session.');
      }
      if (durableObservations.has(id) || graphObservations.has(id)) {
        throw new Error(`Graph observation id ${id} is already active.`);
      }
      graphObservations.set(id, observation);
      send({
        protocol: RUNTIME_PROTOCOL_SESSION_NAME,
        version: RUNTIME_PROTOCOL_SESSION_VERSION,
        kind: 'graph-observe',
        id,
        request,
      });
      subscribed = true;

      while (true) {
        const next = await queue.next();
        if (next.done) return;
        yield next.value;
      }
    } catch (error) {
      if (!options?.signal?.aborted) throw error;
    } finally {
      options?.signal?.removeEventListener('abort', abort);
      if (graphObservations.get(id) === observation) graphObservations.delete(id);
      if (subscribed && !observation.terminal) {
        try {
          send({
            protocol: RUNTIME_PROTOCOL_SESSION_NAME,
            version: RUNTIME_PROTOCOL_SESSION_VERSION,
            kind: 'graph-unobserve',
            id,
          });
        } catch {
          // Disconnect already released the server-side session resources.
        }
      }
    }
  };

  return {
    request,
    durableOperation: { observe: observeDurable },
    graph: { observe: observeGraph },
    close: () => {
      if (disposed) return;
      disposed = true;
      const currentSocket = socket;
      const error = new Error('Runtime Protocol WebSocket transport was closed.');
      if (currentSocket) failConnection(currentSocket, error);
      else failActiveWork(error);
      currentSocket?.close(1000, 'Runtime Protocol transport closed');
    },
  };
};
