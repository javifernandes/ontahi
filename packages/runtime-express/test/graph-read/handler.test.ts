import { graphReadProtocolError, type GraphReadDispatcher } from '@ontahi/core/data-graph';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createExpressGraphReadHandler } from '../../src/graph-read/index.js';

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

const invokeHandler = async (
  handler: RequestHandler,
  body: unknown,
  requestOverrides: Partial<Request> = {},
) => {
  let status = 200;
  let payload: unknown;
  const response = {
    status: vi.fn((nextStatus: number) => {
      status = nextStatus;
      return response;
    }),
    json: vi.fn((nextPayload: unknown) => {
      payload = nextPayload;
      return response;
    }),
  } as unknown as Response;
  const request = { body, ...requestOverrides } as Request;

  await handler(request, response, vi.fn() as NextFunction);

  return { payload, request, status };
};

describe('Express graph read adapter', () => {
  it('rejects malformed requests before deriving context or dispatching', async () => {
    const dispatcher = vi.fn() as GraphReadDispatcher<unknown>;
    const context = vi.fn(() => ({ authority: undefined }));
    const response = await invokeHandler(createExpressGraphReadHandler({ dispatcher, context }), {
      version: 1,
      kind: 'not-a-graph-read',
    });

    expect(response.status).toBe(400);
    expect(response.payload).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_request' },
    });
    expect(context).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('passes the request and a server-derived authority context to the dispatcher', async () => {
    const dispatcher = vi.fn(async (_request, context: { authority: { ownerId: string } }) => ({
      kind: 'graph-read-result' as const,
      value: [{ ownerId: context.authority.ownerId }],
    })) as GraphReadDispatcher<{ ownerId: string }>;
    const response = await invokeHandler(
      createExpressGraphReadHandler({
        dispatcher,
        context: request => ({
          authority: { ownerId: (request as Request & { ownerId: string }).ownerId },
        }),
      }),
      { ...validRequest, authority: { ownerId: 'untrusted' } },
      { ownerId: 'owner-1' } as Partial<Request>,
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      kind: 'graph-read-result',
      value: [{ ownerId: 'owner-1' }],
    });
    expect(dispatcher).toHaveBeenCalledWith(validRequest, {
      authority: { ownerId: 'owner-1' },
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
    const response = await invokeHandler(
      createExpressGraphReadHandler({
        dispatcher,
        context: () => ({ authority: undefined }),
      }),
      validRequest,
    );

    expect(response.status).toBe(status);
    expect(response.payload).toEqual(graphReadProtocolError(code, 'Rejected.'));
  });

  it('reports adapter failures without exposing their cause', async () => {
    const failure = new Error('session details');
    const reportError = vi.fn();
    const dispatcher = vi.fn() as GraphReadDispatcher<unknown>;
    const response = await invokeHandler(
      createExpressGraphReadHandler({
        dispatcher,
        context: () => Promise.reject(failure),
        reportError,
      }),
      validRequest,
    );

    expect(response.status).toBe(503);
    expect(response.payload).toEqual(
      graphReadProtocolError(
        'execution_unavailable',
        'Data graph read execution is temporarily unavailable.',
      ),
    );
    expect(reportError).toHaveBeenCalledWith(failure, response.request);
    expect(dispatcher).not.toHaveBeenCalled();
  });
});
