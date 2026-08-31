import {
  createRuntimeProtocolRegistry,
  runtimeProtocolFamilies,
  runtimeProtocolError,
  type RuntimeProtocolDispatchResult,
  type RuntimeProtocolDispatcher,
} from '@ontahi/core/runtime/protocol';
import type { Request, RequestHandler } from 'express';

export type ExpressRuntimeProtocolContextFactory<TContext> = (
  request: Request,
) => TContext | Promise<TContext>;

export type CreateExpressRuntimeProtocolHandlerOptions<TContext> = {
  dispatcher: RuntimeProtocolDispatcher<TContext>;
  context: ExpressRuntimeProtocolContextFactory<TContext>;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (result: RuntimeProtocolDispatchResult) => {
  if (result.kind !== 'protocol-error') return 200;

  switch (result.error.code) {
    case 'invalid_envelope':
    case 'unsupported_version':
    case 'unknown_family':
    case 'invalid_family_request':
      return 400;
    case 'family_unavailable':
      return 501;
    case 'dispatch_unavailable':
      return 503;
    case 'invalid_response':
      return 502;
  }
};

const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);

export const createExpressRuntimeProtocolHandler = <TContext>({
  dispatcher,
  context,
  reportError,
}: CreateExpressRuntimeProtocolHandlerOptions<TContext>): RequestHandler =>
  async function runtimeProtocolHandler(request, response) {
    const parsed = registry.parseRequest(request.body);
    if (!parsed.success) {
      response.status(responseStatus(parsed.error)).json(parsed.error);
      return;
    }

    try {
      const result = await dispatcher(parsed.request, await context(request));
      response.status(responseStatus(result)).json(result);
    } catch (error) {
      reportError?.(error, request);
      response
        .status(503)
        .json(
          runtimeProtocolError(
            'dispatch_unavailable',
            'Runtime Protocol dispatch is temporarily unavailable.',
            { id: parsed.request.id, family: parsed.request.family },
          ),
        );
    }
  };
