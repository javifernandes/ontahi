import { getCurrentPrincipal } from '@ontahi/core/runtime/server';
import { describe, expect, it, vi } from 'vitest';

import { createNextOperationInvocationRouteHandler } from './index.js';

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

  it('runs dispatch inside the invocation context derived from the web request', async () => {
    const dispatcher = vi.fn(async () => ({
      kind: 'invocation-result' as const,
      result: {
        ok: true as const,
        kind: 'success' as const,
        value: getCurrentPrincipal(),
      },
    }));
    const principal = {
      subject: 'supabase-user-123',
      kind: 'user' as const,
      issuer: 'https://supabase.example/auth/v1',
    };
    const handler = createNextOperationInvocationRouteHandler({
      dispatcher,
      invocationContext: request => ({
        principal: request.headers.get('x-test-principal') ? principal : null,
      }),
    });
    const response = await handler(
      new Request('http://localhost/operations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-principal': principal.subject,
        },
        body: JSON.stringify({ kind: 'invoke', operationId: 'Book.rename', input: {} }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, value: principal },
    });
    expect(getCurrentPrincipal()).toBeNull();
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
