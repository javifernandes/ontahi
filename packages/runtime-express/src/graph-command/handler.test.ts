import { graphCommandProtocolError, type GraphCommandDispatcher } from '@ontahi/core/data-graph';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createExpressGraphCommandHandler } from './index.js';

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
    const dispatcher = vi.fn(async () => ({
      kind: 'graph-command-result' as const,
      value: {
        status: 'applied' as const,
        delta: { added: [], removed: [] },
      },
    })) as GraphCommandDispatcher<string>;
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

  it('maps structured Relationship rejections to an HTTP conflict without flattening them', async () => {
    const rejection = {
      kind: 'graph-command-rejection' as const,
      diagnostic: {
        reason: 'relationship_precondition_failed' as const,
        rejection: {
          version: 1 as const,
          code: 'relationship_precondition_failed',
          message: 'Current Relation target did not match the command precondition.',
        },
      },
    };
    const response = await invokeHandler(
      createExpressGraphCommandHandler({
        dispatcher: vi.fn(async () => rejection),
        context: () => ({ authority: undefined }),
      }),
      requestBody,
    );

    expect(response).toEqual({ status: 409, payload: rejection });
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
