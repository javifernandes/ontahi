import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchReflectedOperationInvoker } from '../../src/actions/index.js';

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

    await expect(
      invoker.invokeOperation({
        operationId: 'Book.fetchInfo',
        input: {
          bookSlug: 'ontahi',
        },
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
});
