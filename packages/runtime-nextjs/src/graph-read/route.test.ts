import { graphReadProtocolError, type GraphReadDispatcher } from '@ontahi/core/data-graph';
import { getCurrentInvocationContext, type InvocationContext } from '@ontahi/core/runtime/server';
import { describe, expect, it, vi } from 'vitest';

import { createNextGraphReadRouteHandler } from './index.js';

const validRequest = {
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: {
    kind: 'selection',
    entityName: 'Todo',
    expression: { kind: 'all' },
  },
  orderBy: [],
};

const graphReadRequest = (body: unknown, headers?: Record<string, string>) =>
  new Request('http://localhost/graph/reads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('Next.js graph read route adapter', () => {
  it('requires an authority factory for a specialized dispatcher', () => {
    const dispatcher = vi.fn() as GraphReadDispatcher<{ ownerId: string }>;

    // @ts-expect-error Specialized authority cannot fall back to InvocationContext.
    createNextGraphReadRouteHandler({ dispatcher });
  });

  it('rejects malformed requests before deriving context or dispatching', async () => {
    const dispatcher = vi.fn() as GraphReadDispatcher<unknown>;
    const invocationContext = vi.fn(() => ({}));
    const handler = createNextGraphReadRouteHandler({ dispatcher, invocationContext });
    const response = await handler(graphReadRequest({ version: 1, kind: 'not-a-graph-read' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_request' },
    });
    expect(invocationContext).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON before deriving context or dispatching', async () => {
    const dispatcher = vi.fn() as GraphReadDispatcher<unknown>;
    const invocationContext = vi.fn(() => ({}));
    const handler = createNextGraphReadRouteHandler({ dispatcher, invocationContext });
    const response = await handler(
      new Request('http://localhost/graph/reads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_request' },
    });
    expect(invocationContext).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('dispatches with authority derived from the trusted request context', async () => {
    const dispatcher = vi.fn(async (_request, context: { authority: { ownerId: string } }) => ({
      kind: 'graph-read-result' as const,
      value: [{ ownerId: context.authority.ownerId }],
    })) as GraphReadDispatcher<{ ownerId: string }>;
    const principal = {
      subject: 'owner-1',
      kind: 'user' as const,
      issuer: 'https://auth.example',
    };
    const handler = createNextGraphReadRouteHandler({
      dispatcher,
      invocationContext: request => ({
        principal: request.headers.get('x-test-principal') ? principal : null,
      }),
      authority: context => ({ ownerId: context.principal?.subject ?? 'anonymous' }),
    });
    const response = await handler(
      graphReadRequest(
        { ...validRequest, authority: { ownerId: 'untrusted' } },
        { 'x-test-principal': principal.subject },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'graph-read-result',
      value: [{ ownerId: 'owner-1' }],
    });
    expect(dispatcher).toHaveBeenCalledWith(validRequest, {
      authority: { ownerId: 'owner-1' },
    });
    expect(getCurrentInvocationContext()).toBeUndefined();
  });

  it('uses the invocation context as the default authority', async () => {
    const dispatcher = vi.fn(async (_request, context: { authority: InvocationContext }) => ({
      kind: 'graph-read-result' as const,
      value: context.authority.principal?.subject,
    })) as GraphReadDispatcher<InvocationContext>;
    const handler = createNextGraphReadRouteHandler({
      dispatcher,
      invocationContext: () => ({
        principal: { subject: 'owner-1', kind: 'user' },
      }),
    });
    const response = await handler(graphReadRequest(validRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'graph-read-result',
      value: 'owner-1',
    });
  });

  it.each([
    ['invalid_request', 400],
    ['unsupported_version', 400],
    ['unknown_entity', 400],
    ['invalid_selection', 400],
    ['invalid_projection', 400],
    ['access_denied', 403],
    ['execution_unavailable', 503],
  ] as const)('maps %s protocol errors to HTTP %s', async (code, status) => {
    const dispatcher = vi.fn(async () => graphReadProtocolError(code, 'Rejected.'));
    const handler = createNextGraphReadRouteHandler({ dispatcher });
    const response = await handler(graphReadRequest(validRequest));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual(graphReadProtocolError(code, 'Rejected.'));
  });

  it('reports adapter failures without exposing their cause', async () => {
    const failure = new Error('session details');
    const reportError = vi.fn();
    const dispatcher = vi.fn() as GraphReadDispatcher<unknown>;
    const handler = createNextGraphReadRouteHandler({
      dispatcher,
      invocationContext: () => Promise.reject(failure),
      reportError,
    });
    const request = graphReadRequest(validRequest);
    const response = await handler(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      graphReadProtocolError(
        'execution_unavailable',
        'Data graph read execution is temporarily unavailable.',
      ),
    );
    expect(reportError).toHaveBeenCalledWith(failure, request);
    expect(dispatcher).not.toHaveBeenCalled();
  });
});
