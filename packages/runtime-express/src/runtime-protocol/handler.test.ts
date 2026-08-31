import {
  createRuntimeProtocolDispatcher,
  createRuntimeProtocolRequest,
  durableOperationProtocolError,
  runtimeProtocolError,
  toDurableOperationProtocolRequest,
  toDurableOperationSnapshotResponse,
} from '@ontahi/core/runtime/protocol';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createExpressRuntimeProtocolHandler } from './handler.js';

const run = { taskId: 'Todo.completeAll', runId: 'run-1' } as const;

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

describe('Express Runtime Protocol adapter', () => {
  it('dispatches a Durable inspection with receiver-derived context', async () => {
    const inspect = vi.fn(
      async (
        request: ReturnType<typeof toDurableOperationProtocolRequest>,
        context: { ownerId: string },
      ) =>
        toDurableOperationSnapshotResponse({
          ...request.run,
          status: 'running',
          updatedAt: '2026-08-31T01:00:00.000Z',
          progress: { phase: `owner:${context.ownerId}` },
        }),
    );
    const dispatcher = createRuntimeProtocolDispatcher({
      handlers: { 'durable.operation': inspect },
    });
    const requestBody = createRuntimeProtocolRequest({
      id: 'inspect-1',
      family: 'durable.operation',
      body: toDurableOperationProtocolRequest(run),
    });

    const response = await invokeHandler(
      createExpressRuntimeProtocolHandler({
        dispatcher,
        context: request => ({ ownerId: (request as Request & { ownerId: string }).ownerId }),
      }),
      requestBody,
      { ownerId: 'owner-1' } as Partial<Request>,
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      protocol: 'ontahi.runtime',
      version: 1,
      id: 'inspect-1',
      kind: 'response',
      family: 'durable.operation',
      body: {
        version: 1,
        kind: 'snapshot',
        snapshot: {
          ...run,
          status: 'running',
          updatedAt: '2026-08-31T01:00:00.000Z',
          progress: { phase: 'owner:owner-1' },
        },
      },
    });
    expect(inspect).toHaveBeenCalledWith(requestBody.body, { ownerId: 'owner-1' });
  });

  it.each([
    [runtimeProtocolError('invalid_envelope', 'Malformed.'), 400],
    [runtimeProtocolError('unknown_family', 'Unknown.'), 400],
    [runtimeProtocolError('family_unavailable', 'Unavailable.'), 501],
    [runtimeProtocolError('dispatch_unavailable', 'Unavailable.'), 503],
    [runtimeProtocolError('invalid_response', 'Invalid.'), 502],
  ] as const)('maps Runtime Protocol errors to HTTP status', async (result, status) => {
    const dispatcher = vi.fn(async () => result);
    const context = vi.fn(() => undefined);
    const response = await invokeHandler(
      createExpressRuntimeProtocolHandler({ dispatcher, context }),
      createRuntimeProtocolRequest({
        id: 'inspect-status',
        family: 'durable.operation',
        body: toDurableOperationProtocolRequest(run),
      }),
    );

    expect(response.status).toBe(status);
    expect(response.payload).toEqual(result);
    expect(context).toHaveBeenCalledOnce();
    expect(dispatcher).toHaveBeenCalledOnce();
  });

  it('rejects malformed envelopes before deriving receiver context', async () => {
    const dispatcher = vi.fn();
    const context = vi.fn(() => ({ ownerId: 'owner-1' }));
    const response = await invokeHandler(
      createExpressRuntimeProtocolHandler({ dispatcher, context }),
      { family: 'durable.operation' },
    );

    expect(response.status).toBe(400);
    expect(response.payload).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_envelope' },
    });
    expect(context).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('preserves a family access denial inside a successful common response', async () => {
    const dispatcher = createRuntimeProtocolDispatcher({
      handlers: {
        'durable.operation': () =>
          durableOperationProtocolError('access_denied', 'Run is not visible.'),
      },
    });
    const requestBody = createRuntimeProtocolRequest({
      id: 'inspect-denied',
      family: 'durable.operation',
      body: toDurableOperationProtocolRequest(run),
    });
    const response = await invokeHandler(
      createExpressRuntimeProtocolHandler({ dispatcher, context: () => undefined }),
      requestBody,
    );

    expect(response.status).toBe(200);
    expect(response.payload).toMatchObject({
      kind: 'response',
      body: { kind: 'protocol-error', error: { code: 'access_denied' } },
    });
  });

  it('reports context failures without leaking their cause', async () => {
    const failure = new Error('private session details');
    const reportError = vi.fn();
    const dispatcher = vi.fn();
    const response = await invokeHandler(
      createExpressRuntimeProtocolHandler({
        dispatcher,
        context: () => Promise.reject(failure),
        reportError,
      }),
      createRuntimeProtocolRequest({
        id: 'inspect-1',
        family: 'durable.operation',
        body: toDurableOperationProtocolRequest(run),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.payload).toEqual(
      runtimeProtocolError(
        'dispatch_unavailable',
        'Runtime Protocol dispatch is temporarily unavailable.',
        { id: 'inspect-1', family: 'durable.operation' },
      ),
    );
    expect(reportError).toHaveBeenCalledWith(failure, response.request);
    expect(dispatcher).not.toHaveBeenCalled();
  });
});
