'use client';

import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  isRuntimeProtocolError,
  parseDurableOperationProtocolResponse,
  parseRuntimeProtocolResponse,
  toDurableOperationProtocolRequest,
  type DurableOperationObservationCapability,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
  type RuntimeTransportRequestOptions,
} from '@ontahi/core/runtime/protocol';

export type FetchRuntimeTransportOptions<TTransportOptions = undefined> = {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  requestId?: () => string;
  requestInit?: (options?: TTransportOptions) => Omit<RequestInit, 'body' | 'method'>;
  durableOperation?: {
    pollIntervalMs?: number;
  };
};

export type FetchRuntimeTransport<TTransportOptions = undefined> =
  RuntimeTransport<TTransportOptions> & {
    readonly durableOperation: DurableOperationObservationCapability;
  };

const DEFAULT_RUNTIME_ENDPOINT = '/runtime';
const DEFAULT_POLL_INTERVAL_MS = 500;
const terminalTaskStatuses = new Set(['completed', 'failed', 'cancelled']);

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

export const createFetchRuntimeTransport = <TTransportOptions = undefined>({
  endpoint = DEFAULT_RUNTIME_ENDPOINT,
  fetch: fetchRequest = globalThis.fetch,
  requestId,
  requestInit,
  durableOperation = {},
}: FetchRuntimeTransportOptions<TTransportOptions> = {}): FetchRuntimeTransport<TTransportOptions> => {
  const pollIntervalMs = durableOperation.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new TypeError('Durable Operation poll interval must be a non-negative finite number.');
  }

  const request = async (
    runtimeRequest: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions<TTransportOptions>,
  ) => {
    const init = requestInit?.(options?.transportOptions) ?? {};
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
  const exchange = createRuntimeProtocolExchange({
    transport: { request },
    requestId,
  });

  const observe: DurableOperationObservationCapability['observe'] = async function* <TResult>(
    run: TaskRunIdentity,
    options?: RuntimeTransportRequestOptions,
  ): AsyncIterable<TaskSnapshot<TResult>> {
    while (!options?.signal?.aborted) {
      const responseBody = await exchange(
        {
          family: 'durable.operation',
          body: toDurableOperationProtocolRequest(run),
        },
        options?.signal ? { signal: options.signal } : undefined,
      );

      const parsed = parseDurableOperationProtocolResponse(responseBody);
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
