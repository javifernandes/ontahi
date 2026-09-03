import { entity, field } from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  runtimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchReflectedOperationInvoker } from './index.js';

describe('createFetchReflectedOperationInvoker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invokes a reflected operation through the versioned Operation family', async () => {
    const fetchMock = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return {
        ok: true,
        json: async () =>
          createRuntimeProtocolResponse(request, {
            kind: 'invocation-result',
            result: {
              ok: true,
              kind: 'success',
              value: { title: 'Ontahi' },
            },
          }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const invoker = createFetchReflectedOperationInvoker({
      requestId: () => 'reflected-operation-1',
    });
    const Book = entity('Book', { id: field.id(), title: field.string() });
    const BookInfo = Book.view('BookInfo', { title: true });

    await expect(
      invoker.invokeOperation({
        operationId: 'Book.fetchInfo',
        input: {
          bookSlug: 'ontahi',
        },
        view: BookInfo.toJSON(),
      }),
    ).resolves.toEqual({
      ok: true,
      kind: 'success',
      value: {
        title: 'Ontahi',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith('/runtime', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      credentials: 'same-origin',
      body: JSON.stringify({
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'reflected-operation-1',
        kind: 'request',
        family: 'operation',
        body: {
          version: 1,
          kind: 'invoke',
          operationId: 'Book.fetchInfo',
          input: {
            bookSlug: 'ontahi',
          },
          view: BookInfo.toJSON(),
        },
      }),
    });
  });

  it('surfaces protocol errors as errored invocation results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return {
          ok: false,
          status: 503,
          json: async () =>
            runtimeProtocolError('dispatch_unavailable', 'No operation runtime is available.', {
              id: request.id,
              family: request.family,
            }),
        };
      }),
    );

    const invoker = createFetchReflectedOperationInvoker();

    await expect(
      invoker.invokeOperation({ operationId: 'Book.fetchInfo', input: {} }),
    ).resolves.toEqual({
      ok: false,
      kind: 'errored',
      executed: 'unknown',
      message: 'No operation runtime is available.',
    });
  });

  it('only advertises operations exposed through the server bridge', () => {
    const invoker = createFetchReflectedOperationInvoker();
    const operation = {
      id: 'Book.fetchInfo',
      entityName: 'Book',
      name: 'fetchInfo',
    };

    expect(
      invoker.canInvokeOperation?.({
        ...operation,
        kind: 'domain',
        exposure: 'bridge',
      }),
    ).toBe(true);
    expect(
      invoker.canInvokeOperation?.({
        ...operation,
        kind: 'graph',
        exposure: 'browser-direct',
      }),
    ).toBe(false);
    expect(
      invoker.canInvokeOperation?.({
        ...operation,
        kind: 'domain',
        exposure: 'server-only',
      }),
    ).toBe(false);
    expect(
      invoker.getOperationExecutionAffordance?.({
        ...operation,
        kind: 'domain',
        exposure: 'bridge',
        execution: { atomicity: 'required' },
      }),
    ).toEqual({ status: 'bridge', authority: 'server', bridge: 'fetch' });
    expect(
      invoker.getOperationExecutionAffordance?.({
        ...operation,
        kind: 'graph',
        exposure: 'bridge',
      }),
    ).toEqual({ status: 'unavailable', missingCapabilities: [] });
  });

  it('derives the Operation endpoint from the runtime mount path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: [] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const invoker = createFetchReflectedOperationInvoker({
      mountPath: '/internal/ontahi/',
    });

    await expect(
      invoker.invokeOperation({ operationId: 'Todo.list', input: {} }),
    ).resolves.toMatchObject({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/internal/ontahi/operations',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
