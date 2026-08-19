import { graphCommandProtocolError, type GraphCommandDispatcher } from '@ontahi/core/data-graph';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createExpressGraphCommandHandler } from '../../src/graph-command/index.js';

const requestBody = { version: 1, kind: 'graph-command', command: {} };

const invokeHandler = async (handler: RequestHandler, body: unknown) => {
  let status = 200;
  let payload: unknown;
  const response = {
    status: vi.fn((value: number) => {
      status = value;
      return response;
    }),
    json: vi.fn((value: unknown) => {
      payload = value;
      return response;
    }),
  } as unknown as Response;
  await handler({ body } as Request, response, vi.fn() as NextFunction);
  return { status, payload };
};

describe('Express graph Command adapter', () => {
  it('passes the protocol request through a server-derived authority boundary', async () => {
    const dispatcher = vi.fn(async (_request, context: { authority: string }) => ({
      kind: 'graph-command-result' as const,
      value: { added: [], removed: [], authority: context.authority },
    })) as unknown as GraphCommandDispatcher<string>;
    const response = await invokeHandler(
      createExpressGraphCommandHandler({
        dispatcher,
        context: () => ({ authority: 'server-owned' }),
      }),
      requestBody,
    );

    expect(response.status).toBe(200);
    expect(dispatcher).toHaveBeenCalledWith(requestBody, { authority: 'server-owned' });
  });

  it.each([
    ['invalid_request', 400],
    ['access_denied', 403],
    ['execution_unavailable', 503],
  ] as const)('maps %s protocol errors to HTTP %s', async (code, status) => {
    const dispatcher = vi.fn(async () => graphCommandProtocolError(code, 'Rejected.'));
    const response = await invokeHandler(
      createExpressGraphCommandHandler({
        dispatcher,
        context: () => ({ authority: undefined }),
      }),
      requestBody,
    );
    expect(response).toEqual({ status, payload: graphCommandProtocolError(code, 'Rejected.') });
  });
});
