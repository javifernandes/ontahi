import {
  graphReadProtocolError,
  parseGraphReadRequest,
  type GraphReadDispatchContext,
  type GraphReadDispatcher,
  type GraphReadDispatchResponse,
} from '@ontahi/core/data-graph';
import type { Request, RequestHandler } from 'express';

export type ExpressGraphReadContextFactory<TAuthority> = (
  request: Request,
) => GraphReadDispatchContext<TAuthority> | Promise<GraphReadDispatchContext<TAuthority>>;

export type CreateExpressGraphReadHandlerOptions<TAuthority> = {
  dispatcher: GraphReadDispatcher<TAuthority>;
  context: ExpressGraphReadContextFactory<TAuthority>;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (response: GraphReadDispatchResponse) => {
  if (response.kind === 'graph-read-result') return 200;
  if (response.error.code === 'access_denied') return 403;
  if (response.error.code === 'execution_unavailable') return 503;
  return 400;
};

export const createExpressGraphReadHandler =
  <TAuthority>({
    dispatcher,
    context,
    reportError,
  }: CreateExpressGraphReadHandlerOptions<TAuthority>): RequestHandler =>
  async (request, response) => {
    const parsed = parseGraphReadRequest(request.body);
    if (!parsed.success) {
      response.status(400).json(parsed.error);
      return;
    }

    try {
      const protocolResponse = await dispatcher(parsed.request, await context(request));
      response.status(responseStatus(protocolResponse)).json(protocolResponse);
    } catch (error) {
      reportError?.(error, request);
      response
        .status(503)
        .json(
          graphReadProtocolError(
            'execution_unavailable',
            'Data graph read execution is temporarily unavailable.',
          ),
        );
    }
  };
