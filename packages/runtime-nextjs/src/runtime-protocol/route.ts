import {
  createRuntimeProtocolRegistry,
  runtimeProtocolError,
  runtimeProtocolFamilies,
  type RuntimeProtocolDispatchResult,
  type RuntimeProtocolDispatcher,
} from '@ontahi/core/runtime/protocol';

export type NextRuntimeProtocolContextFactory<TContext> = (
  request: Request,
) => TContext | Promise<TContext>;

export type CreateNextRuntimeProtocolRouteHandlerOptions<TContext> = {
  dispatcher: RuntimeProtocolDispatcher<TContext>;
  context: NextRuntimeProtocolContextFactory<TContext>;
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

export const createNextRuntimeProtocolRouteHandler =
  <TContext>({
    dispatcher,
    context,
    reportError,
  }: CreateNextRuntimeProtocolRouteHandlerOptions<TContext>) =>
  async (request: Request): Promise<Response> => {
    const parsed = registry.parseRequest(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(parsed.error, { status: responseStatus(parsed.error) });
    }

    try {
      const result = await dispatcher(parsed.request, await context(request));
      return Response.json(result, { status: responseStatus(result) });
    } catch (error) {
      reportError?.(error, request);

      return Response.json(
        runtimeProtocolError(
          'dispatch_unavailable',
          'Runtime Protocol dispatch is temporarily unavailable.',
          { id: parsed.request.id, family: parsed.request.family },
        ),
        { status: 503 },
      );
    }
  };
