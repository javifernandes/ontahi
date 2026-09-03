import {
  createRuntimeProtocolExchange,
  createRuntimeProtocolResponse,
  durableOperationProtocolError,
  runtimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createFetchRuntimeTransport } from './fetch-runtime-transport.js';

const run = { taskId: 'Todo.completeAll', runId: 'run-1' } as const;

const jsonResponse = (payload: unknown, options?: { ok?: boolean; status?: number }) =>
  ({
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => payload,
  }) as Response;

describe('Fetch Runtime Transport', () => {
  it('applies per-exchange request initialization and abort through the shared request path', async () => {
    const fetchRequest = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return jsonResponse(createRuntimeProtocolResponse(request, { kind: 'operation-result' }));
    });
    const transport = createFetchRuntimeTransport<{ credential: string }>({
      endpoint: '/internal/runtime',
      fetch: fetchRequest as typeof fetch,
      requestInit: options => ({
        headers: { authorization: `Bearer ${options?.credential}` },
        credentials: 'include',
      }),
    });
    const exchange = createRuntimeProtocolExchange({
      transport,
      requestId: () => 'operation-1',
    });
    const controller = new AbortController();

    await exchange(
      {
        family: 'operation',
        body: { version: 1, kind: 'invoke', operationId: 'Todo.complete' },
      },
      {
        signal: controller.signal,
        transportOptions: { credential: 'browser-session' },
      },
    );

    expect(fetchRequest).toHaveBeenCalledWith('/internal/runtime', {
      method: 'POST',
      headers: new Headers({
        authorization: 'Bearer browser-session',
        'content-type': 'application/json',
      }),
      credentials: 'include',
      body: expect.not.stringContaining('browser-session'),
      signal: controller.signal,
    });
  });

  it('sends and validates one correlated Runtime Protocol exchange', async () => {
    const fetchRequest = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return jsonResponse(
        createRuntimeProtocolResponse(request, {
          version: 1,
          kind: 'snapshot',
          snapshot: {
            ...run,
            status: 'running',
            updatedAt: '2026-08-31T01:00:00.000Z',
          },
        }),
      );
    });
    const transport = createFetchRuntimeTransport({
      endpoint: '/internal/runtime',
      fetch: fetchRequest as typeof fetch,
    });
    const request = {
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'exchange-1',
      kind: 'request',
      family: 'durable.operation',
      body: { version: 1, kind: 'inspect', run },
    } as const;

    await expect(transport.request(request)).resolves.toEqual(
      createRuntimeProtocolResponse(request, {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: '2026-08-31T01:00:00.000Z',
        },
      }),
    );
    expect(fetchRequest).toHaveBeenCalledWith('/internal/runtime', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify(request),
    });
  });

  it('polls with inspect messages and completes the observation at terminal state', async () => {
    const statuses = ['running', 'completed'] as const;
    const fetchRequest = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      const status = statuses[fetchRequest.mock.calls.length - 1];
      return jsonResponse(
        createRuntimeProtocolResponse(request, {
          version: 1,
          kind: 'snapshot',
          snapshot: {
            ...run,
            status,
            updatedAt: `2026-08-31T01:00:0${fetchRequest.mock.calls.length}.000Z`,
            ...(status === 'completed' ? { result: { completed: 3 } } : {}),
          },
        }),
      );
    });
    const requestIds = ['inspect-1', 'inspect-2'][Symbol.iterator]();
    const transport = createFetchRuntimeTransport({
      fetch: fetchRequest as typeof fetch,
      requestId: () => requestIds.next().value ?? 'unexpected',
      durableOperation: { pollIntervalMs: 0 },
    });
    const snapshots = [];

    for await (const snapshot of transport.durableOperation.observe(run)) {
      snapshots.push(snapshot);
    }

    expect(snapshots).toEqual([
      {
        ...run,
        status: 'running',
        updatedAt: '2026-08-31T01:00:01.000Z',
      },
      {
        ...run,
        status: 'completed',
        updatedAt: '2026-08-31T01:00:02.000Z',
        result: { completed: 3 },
      },
    ]);
    expect(fetchRequest.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'inspect-1',
        kind: 'request',
        family: 'durable.operation',
        body: { version: 1, kind: 'inspect', run },
      },
      {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'inspect-2',
        kind: 'request',
        family: 'durable.operation',
        body: { version: 1, kind: 'inspect', run },
      },
    ]);
  });

  it('aborts between polls without issuing another inspection', async () => {
    const fetchRequest = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return jsonResponse(
        createRuntimeProtocolResponse(request, {
          version: 1,
          kind: 'snapshot',
          snapshot: {
            ...run,
            status: 'running',
            updatedAt: '2026-08-31T01:00:00.000Z',
          },
        }),
      );
    });
    const transport = createFetchRuntimeTransport({
      fetch: fetchRequest as typeof fetch,
      durableOperation: { pollIntervalMs: 60_000 },
    });
    const controller = new AbortController();
    const iterator = transport.durableOperation
      .observe(run, { signal: controller.signal })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { status: 'running' },
    });
    const pending = iterator.next();
    controller.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it('fails closed for mismatched envelopes and Durable family errors', async () => {
    const mismatchFetch = vi.fn(async () =>
      jsonResponse(
        runtimeProtocolError('invalid_response', 'Mismatched.', {
          id: 'another-exchange',
          family: 'durable.operation',
        }),
      ),
    );
    const mismatch = createFetchRuntimeTransport({
      fetch: mismatchFetch as typeof fetch,
      requestId: () => 'inspect-1',
    });

    await expect(
      mismatch.durableOperation.observe(run)[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('Runtime Protocol error correlation does not match request.');

    const familyErrorFetch = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return jsonResponse(
        createRuntimeProtocolResponse(
          request,
          durableOperationProtocolError('access_denied', 'Run is not visible.'),
        ),
      );
    });
    const familyError = createFetchRuntimeTransport({
      fetch: familyErrorFetch as typeof fetch,
      requestId: () => 'inspect-2',
    });

    await expect(
      familyError.durableOperation.observe(run)[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('Run is not visible.');
  });

  it('rejects invalid polling configuration and malformed transport responses', async () => {
    expect(() => createFetchRuntimeTransport({ durableOperation: { pollIntervalMs: -1 } })).toThrow(
      'Durable Operation poll interval must be a non-negative finite number.',
    );

    const request = createFetchRuntimeTransport({
      fetch: vi.fn(async () => jsonResponse({ kind: 'not-a-runtime-response' })) as typeof fetch,
    });
    await expect(
      request.request({
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'malformed-1',
        kind: 'request',
        family: 'durable.operation',
        body: { version: 1, kind: 'inspect', run },
      }),
    ).rejects.toThrow('Runtime Protocol response is invalid or mismatched.');

    const failedHttp = createFetchRuntimeTransport({
      fetch: vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const runtimeRequest = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return jsonResponse(
          createRuntimeProtocolResponse(runtimeRequest, {
            version: 1,
            kind: 'snapshot',
            snapshot: {
              ...run,
              status: 'running',
              updatedAt: '2026-08-31T01:00:00.000Z',
            },
          }),
          { ok: false, status: 503 },
        );
      }) as typeof fetch,
    });
    await expect(
      failedHttp.durableOperation.observe(run)[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('Runtime Protocol request failed with status 503.');
  });

  it('preserves common protocol errors and validates the family response body', async () => {
    const commonError = createFetchRuntimeTransport({
      requestId: () => 'inspect-common-error',
      fetch: vi.fn(async () =>
        jsonResponse(
          runtimeProtocolError('dispatch_unavailable', 'Runtime unavailable.', {
            id: 'inspect-common-error',
            family: 'durable.operation',
          }),
          { ok: false, status: 503 },
        ),
      ) as typeof fetch,
    });
    await expect(
      commonError.durableOperation.observe(run)[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('Runtime unavailable.');

    const malformedFamily = createFetchRuntimeTransport({
      fetch: vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const runtimeRequest = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return jsonResponse(
          createRuntimeProtocolResponse(runtimeRequest, {
            version: 1,
            kind: 'snapshot',
            snapshot: { ...run, status: 'unknown' },
          }),
        );
      }) as typeof fetch,
    });
    await expect(
      malformedFamily.durableOperation.observe(run)[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('Durable Operation snapshot response is invalid.');

    const mismatchedRun = createFetchRuntimeTransport({
      fetch: vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const runtimeRequest = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return jsonResponse(
          createRuntimeProtocolResponse(runtimeRequest, {
            version: 1,
            kind: 'snapshot',
            snapshot: {
              ...run,
              runId: 'another-run',
              status: 'running',
              updatedAt: '2026-08-31T01:00:00.000Z',
            },
          }),
        );
      }) as typeof fetch,
    });
    await expect(
      mismatchedRun.durableOperation.observe(run)[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('Durable Operation snapshot identity does not match the observed run.');
  });
});
