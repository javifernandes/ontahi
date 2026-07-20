import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createExpressOperationInvocationHandler } from '../../src/operation-invocation/index.js';

const invokeHandler = async (handler: RequestHandler, body: unknown) => {
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

  await handler({ body } as Request, response, vi.fn() as NextFunction);

  return { status, payload };
};

describe('Express operation invocation adapter', () => {
  it('rejects malformed protocol requests before dispatch', async () => {
    const dispatcher = vi.fn();
    const response = await invokeHandler(createExpressOperationInvocationHandler({ dispatcher }), {
      operationId: 'Book.rename',
      input: {},
    });

    expect(response.status).toBe(400);
    expect(response.payload).toMatchObject({
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
    const requestBody = {
      kind: 'invoke' as const,
      operationId: 'Book.rename',
      input: { title: 'Ontahi' },
    };

    const response = await invokeHandler(
      createExpressOperationInvocationHandler({ dispatcher }),
      requestBody,
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
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

    const response = await invokeHandler(createExpressOperationInvocationHandler({ dispatcher }), {
      kind: 'check-permission',
      operationId: 'Book.rename',
      input: {},
    });

    expect(response.status).toBe(500);
    expect(response.payload).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invocation_unavailable' },
    });
  });
});
