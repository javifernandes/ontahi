import { entity, field } from '@ontahi/core/data-graph';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
} from '../../src/actions/index.js';

describe('createFetchReflectedOperationInvoker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invokes a reflected operation through the bridge endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        kind: 'invocation-result',
        result: {
          ok: true,
          kind: 'success',
          value: {
            title: 'Ontahi',
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const invoker = createFetchReflectedOperationInvoker({
      endpoint: '/internal/reflected-operations',
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

    expect(fetchMock).toHaveBeenCalledWith('/internal/reflected-operations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        kind: 'invoke',
        operationId: 'Book.fetchInfo',
        input: {
          bookSlug: 'ontahi',
        },
        view: BookInfo.toJSON(),
      }),
    });
  });

  it('surfaces protocol errors as errored invocation results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({
          kind: 'protocol-error',
          error: {
            code: 'invocation_unavailable',
            message: 'No operation runtime is available.',
          },
        }),
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
  });

  it('derives bridge and task endpoints from the runtime mount path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          taskId: 'Todo.completeAll',
          runId: 'run-1',
          status: 'completed',
          updatedAt: '2026-08-09T00:00:00.000Z',
          result: { completed: 3 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: [] },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createFetchOperationBridgeAdapter({
      mountPath: '/internal/ontahi/',
    });
    const invoker = createFetchReflectedOperationInvoker({
      mountPath: '/internal/ontahi/',
    });

    await adapter.getTaskSnapshot?.({ taskId: 'Todo.completeAll', runId: 'run-1' });
    await expect(
      invoker.invokeOperation({ operationId: 'Todo.list', input: {} }),
    ).resolves.toMatchObject({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/internal/ontahi/operations/tasks/Todo.completeAll/run-1',
      { credentials: 'same-origin' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/internal/ontahi/operations',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
