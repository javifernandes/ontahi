'use client';

import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolRequest,
  isRuntimeProtocolError,
  parseDurableOperationProtocolResponse,
  parseRuntimeProtocolResponse,
  toDurableOperationProtocolRequest,
  type DurableOperationObservationCapability,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
  type RuntimeTransportRequestOptions,
} from '@ontahi/core/runtime/protocol';

export type FetchRuntimeTransportOptions = {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  requestId?: () => string;
  requestInit?: () => Omit<RequestInit, 'body' | 'method' | 'signal'>;
  durableOperation?: {
    pollIntervalMs?: number;
  };
};

export type FetchRuntimeTransport = RuntimeTransport & {
  readonly durableOperation: DurableOperationObservationCapability;
};

const DEFAULT_RUNTIME_ENDPOINT = '/runtime';
const DEFAULT_POLL_INTERVAL_MS = 500;
const terminalTaskStatuses = new Set(['completed', 'failed', 'cancelled']);
let fallbackRequestSequence = 0;

const defaultRequestId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `ontahi-runtime-${Date.now()}-${(fallbackRequestSequence += 1)}`;

const waitForNextInspection = (
  intervalMs: number,
  signal: AbortSignal | undefined,
): Promise<boolean> => {
  if (signal?.aborted) return Promise.resolve(false);
  if (intervalMs === 0) return Promise.resolve(true);

  return new Promise(resolve => {
    let settled = false;
    const finish = (shouldContinue: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      resolve(shouldContinue);
    };
    const abort = () => finish(false);
    const timeout = setTimeout(() => finish(true), intervalMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
};

export const createFetchRuntimeTransport = ({
  endpoint = DEFAULT_RUNTIME_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
  requestId = defaultRequestId,
  requestInit,
  durableOperation = {},
}: FetchRuntimeTransportOptions = {}): FetchRuntimeTransport => {
  const pollIntervalMs = durableOperation.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new TypeError('Durable Operation poll interval must be a non-negative finite number.');
  }

  const request = async (
    runtimeRequest: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions,
  ) => {
    const init = requestInit?.() ?? {};
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetchRequest(endpoint, {
      ...init,
      method: 'POST',
      headers,
      credentials: init.credentials ?? 'same-origin',
      body: JSON.stringify(runtimeRequest),
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    const payload: unknown = await response.json().catch(() => null);
    const parsed = parseRuntimeProtocolResponse(payload, runtimeRequest);
    if (!parsed.success) throw new Error(parsed.error.error.message);
    if (!response.ok && !isRuntimeProtocolError(parsed.response)) {
      throw new Error(`Runtime Protocol request failed with status ${response.status}.`);
    }
    return parsed.response;
  };

  const observe: DurableOperationObservationCapability['observe'] = async function* <TResult>(
    run: TaskRunIdentity,
    options?: RuntimeTransportRequestOptions,
  ): AsyncIterable<TaskSnapshot<TResult>> {
    while (!options?.signal?.aborted) {
      const runtimeRequest = createRuntimeProtocolRequest({
        id: requestId(),
        family: 'durable.operation',
        body: toDurableOperationProtocolRequest(run),
      });
      const runtimeResponse = await request(runtimeRequest, options);
      if (isRuntimeProtocolError(runtimeResponse)) {
        throw new Error(runtimeResponse.error.message);
      }

      const parsed = parseDurableOperationProtocolResponse(runtimeResponse.body);
      if (!parsed.success) throw new Error(parsed.error.error.message);
      if (parsed.response.kind === 'protocol-error') {
        throw new Error(parsed.response.error.message);
      }

      const snapshot = parsed.response.snapshot as TaskSnapshot<TResult>;
      if (snapshot.taskId !== run.taskId || snapshot.runId !== run.runId) {
        throw new Error('Durable Operation snapshot identity does not match the observed run.');
      }
      yield snapshot;
      if (terminalTaskStatuses.has(snapshot.status)) return;
      if (!(await waitForNextInspection(pollIntervalMs, options?.signal))) return;
    }
  };

  return {
    request,
    durableOperation: { observe },
  };
};
