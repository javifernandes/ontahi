import { describe, expect, it, vi } from 'vitest';

import { createNextOperationInvocationRouteHandler } from '../../src/operation-invocation/index.js';

describe('Next.js operation invocation route adapter', () => {
  it('rejects malformed protocol requests before dispatch', async () => {
    const dispatcher = vi.fn();
    const handler = createNextOperationInvocationRouteHandler({ dispatcher });
    const response = await handler(
      new Request('http://localhost/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationId: 'Book.rename', input: {} }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_request' },
    });
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('maps invocation messages and semantic responses', async () => {
    const dispatcher = vi.fn(async () => ({
      kind: 'invocation-result' as const,
      result: { ok: true as const, kind: 'success' as const, value: { renamed: true } },
    }));
    const handler = createNextOperationInvocationRouteHandler({ dispatcher });
    const requestBody = {
      kind: 'invoke',
      operationId: 'Book.rename',
      input: { title: 'Ontahi' },
    };
    const response = await handler(
      new Request('http://localhost/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success', value: { renamed: true } },
    });
    expect(dispatcher).toHaveBeenCalledWith(requestBody);
  });

  it('maps unavailable dispatch to an HTTP 500 protocol error', async () => {
    const dispatcher = vi.fn(async () => ({
      kind: 'protocol-error' as const,
      error: {
        code: 'invocation_unavailable' as const,
        message: 'No runtime.',
      },
    }));
    const handler = createNextOperationInvocationRouteHandler({ dispatcher });
    const response = await handler(
      new Request('http://localhost/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'check-permission', operationId: 'Book.rename', input: {} }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invocation_unavailable' },
    });
  });
});
