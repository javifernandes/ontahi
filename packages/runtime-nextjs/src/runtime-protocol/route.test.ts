import {
  createEntityRef,
  entity,
  field,
  mutateEntity,
  query,
  toGraphCommandRequest,
  toGraphReadRequest,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolDispatcher,
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
  durableOperationProtocolError,
  runtimeProtocolError,
  toDurableOperationProtocolRequest,
  toOperationProtocolRequest,
  type RuntimeProtocolDispatcher,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createNextRuntimeProtocolRouteHandler } from './index.js';

const run = { taskId: 'Todo.completeAll', runId: 'run-1' } as const;
const operationBody = toOperationProtocolRequest({
  kind: 'invoke',
  operationId: 'Book.rename',
  input: { title: 'Ontahí' },
});
const operationRequest = createRuntimeProtocolRequest({
  id: 'operation-1',
  family: 'operation',
  body: operationBody,
});

const jsonRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/runtime', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const rawRequest = (body: string) =>
  new Request('http://localhost/runtime', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

describe('Next.js Runtime Protocol adapter', () => {
  it('dispatches a valid request and preserves exact response correlation', async () => {
    const operation = vi.fn(async () => ({
      kind: 'invocation-result' as const,
      result: { ok: true as const, kind: 'success' as const, value: { renamed: true } },
    }));
    const dispatcher = createRuntimeProtocolDispatcher({ handlers: { operation } });
    const handler = createNextRuntimeProtocolRouteHandler({
      dispatcher,
      context: () => ({ source: 'next-route' }),
    });

    const response = await handler(jsonRequest(operationRequest));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'operation-1',
      kind: 'response',
      family: 'operation',
      body: {
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: { renamed: true } },
      },
    });
    expect(operation).toHaveBeenCalledWith(operationBody, { source: 'next-route' });
  });

  it.each([
    ['invalid JSON', rawRequest('{')],
    ['invalid envelope', jsonRequest({ family: 'operation' })],
  ])('rejects %s before deriving context or dispatching', async (_label, request) => {
    const dispatcher = vi.fn();
    const context = vi.fn(() => ({ principal: 'server-user' }));
    const handler = createNextRuntimeProtocolRouteHandler({ dispatcher, context });

    const response = await handler(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_envelope' },
    });
    expect(context).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it.each([
    ['envelope', { ...operationRequest, version: 2 }, 'unsupported_version', undefined],
    [
      'family body',
      { ...operationRequest, body: { ...operationRequest.body, version: 2 } },
      'invalid_family_request',
      'unsupported_version',
    ],
  ] as const)(
    'rejects an unknown %s version before deriving context or dispatching',
    async (_label, body, code, familyCode) => {
      const dispatcher = vi.fn();
      const context = vi.fn(() => ({ principal: 'server-user' }));
      const handler = createNextRuntimeProtocolRouteHandler({ dispatcher, context });

      const response = await handler(jsonRequest(body));
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload).toMatchObject({
        id: 'operation-1',
        family: 'operation',
        kind: 'protocol-error',
        error: { code },
      });
      if (familyCode) {
        expect(payload).toMatchObject({
          error: { details: { familyError: { error: { code: familyCode } } } },
        });
      }
      expect(context).not.toHaveBeenCalled();
      expect(dispatcher).not.toHaveBeenCalled();
    },
  );

  it('returns a correlated capability error for a known family without a handler', async () => {
    const dispatcher = createRuntimeProtocolDispatcher({ handlers: {} });
    const handler = createNextRuntimeProtocolRouteHandler({
      dispatcher,
      context: () => undefined,
    });

    const response = await handler(jsonRequest(operationRequest));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual(
      runtimeProtocolError(
        'family_unavailable',
        'Runtime Protocol family operation is unavailable in this runtime.',
        { id: 'operation-1', family: 'operation' },
      ),
    );
  });

  it('derives trusted context only from the received server request', async () => {
    const operation = vi.fn(
      async (_body: typeof operationBody, context: { principal: string }) => ({
        kind: 'invocation-result' as const,
        result: {
          ok: true as const,
          kind: 'success' as const,
          value: { principal: context.principal },
        },
      }),
    );
    const dispatcher = createRuntimeProtocolDispatcher({ handlers: { operation } });
    const context = vi.fn((request: Request) => ({
      principal: request.headers.get('x-test-principal') ?? 'anonymous',
    }));
    const handler = createNextRuntimeProtocolRouteHandler({ dispatcher, context });
    const portableRequest = createRuntimeProtocolRequest({
      id: 'trusted-context',
      family: 'operation',
      body: toOperationProtocolRequest({
        kind: 'invoke',
        operationId: 'Book.rename',
        input: { principal: 'caller-authored' },
      }),
    });
    const request = jsonRequest(portableRequest, { 'x-test-principal': 'server-user' });

    const response = await handler(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      body: {
        kind: 'invocation-result',
        result: { ok: true, value: { principal: 'server-user' } },
      },
    });
    expect(context).toHaveBeenCalledWith(request);
    expect(operation).toHaveBeenCalledWith(portableRequest.body, { principal: 'server-user' });
  });

  it('preserves a family protocol error as a semantic response', async () => {
    const familyError = durableOperationProtocolError('access_denied', 'Run is not visible.');
    const dispatcher = createRuntimeProtocolDispatcher({
      handlers: { 'durable.operation': () => familyError },
    });
    const request = createRuntimeProtocolRequest({
      id: 'inspect-denied',
      family: 'durable.operation',
      body: toDurableOperationProtocolRequest(run),
    });
    const handler = createNextRuntimeProtocolRouteHandler({
      dispatcher,
      context: () => undefined,
    });

    const response = await handler(jsonRequest(request));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      createRuntimeProtocolResponse(request, familyError),
    );
  });

  it.each([
    ['invalid_envelope', 400],
    ['unsupported_version', 400],
    ['unknown_family', 400],
    ['invalid_family_request', 400],
    ['family_unavailable', 501],
    ['dispatch_unavailable', 503],
    ['invalid_response', 502],
  ] as const)('maps %s common protocol errors to HTTP %s', async (code, status) => {
    const result = runtimeProtocolError(code, 'Rejected.', {
      id: operationRequest.id,
      family: operationRequest.family,
    });
    const dispatcher = vi.fn(async () => result);
    const handler = createNextRuntimeProtocolRouteHandler({
      dispatcher,
      context: () => undefined,
    });

    const response = await handler(jsonRequest(operationRequest));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual(result);
  });

  it('reports context failures without leaking their cause', async () => {
    const failure = new Error('private session details');
    const reportError = vi.fn();
    const dispatcher = vi.fn();
    const handler = createNextRuntimeProtocolRouteHandler({
      dispatcher,
      context: () => Promise.reject(failure),
      reportError,
    });
    const request = jsonRequest(operationRequest);

    const response = await handler(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      runtimeProtocolError(
        'dispatch_unavailable',
        'Runtime Protocol dispatch is temporarily unavailable.',
        { id: operationRequest.id, family: operationRequest.family },
      ),
    );
    expect(reportError).toHaveBeenCalledWith(failure, request);
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('delegates every registered family without a Next.js-specific family switch', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    });
    const requests = [
      operationRequest,
      createRuntimeProtocolRequest({
        id: 'durable-1',
        family: 'durable.operation',
        body: toDurableOperationProtocolRequest(run),
      }),
      createRuntimeProtocolRequest({
        id: 'read-1',
        family: 'graph.read',
        body: toGraphReadRequest(query(Book), 'run'),
      }),
      createRuntimeProtocolRequest({
        id: 'command-1',
        family: 'graph.command',
        body: toGraphCommandRequest(
          mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' })),
        ),
      }),
    ];
    const dispatcher: RuntimeProtocolDispatcher<undefined> = vi.fn(async input => {
      const request = input as RuntimeProtocolRequestEnvelope;
      return createRuntimeProtocolResponse(request, { family: request.family });
    });
    const handler = createNextRuntimeProtocolRouteHandler({
      dispatcher,
      context: () => undefined,
    });

    for (const request of requests) {
      const response = await handler(jsonRequest(request));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(
        createRuntimeProtocolResponse(request, { family: request.family }),
      );
    }
    expect(dispatcher).toHaveBeenCalledTimes(requests.length);
  });
});
