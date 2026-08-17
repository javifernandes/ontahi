import {
  graphReadProtocolError,
  parseGraphReadRequest,
  type GraphReadDispatchContext,
  type GraphReadDispatcher,
  type GraphReadDispatchResponse,
} from '@ontahi/core/data-graph';
import {
  getCurrentInvocationContext,
  withInvocationContext,
  type InvocationContext,
} from '@ontahi/core/runtime/server';
import type { Request, RequestHandler } from 'express';

import type { ExpressInvocationContextFactory } from '../request-context.js';

export type ExpressGraphReadContextFactory<TAuthority> = (
  request: Request,
) => GraphReadDispatchContext<TAuthority> | Promise<GraphReadDispatchContext<TAuthority>>;

export type ExpressGraphReadAuthorityFactory<TAuthority> = (
  context: InvocationContext,
  request: Request,
) => TAuthority | Promise<TAuthority>;

export type CreateExpressGraphReadHandlerOptions<TAuthority> = {
  dispatcher: GraphReadDispatcher<TAuthority>;
  context?: ExpressGraphReadContextFactory<TAuthority>;
  authority?: ExpressGraphReadAuthorityFactory<TAuthority>;
  invocationContext?: ExpressInvocationContextFactory;
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
    authority,
    invocationContext,
    reportError,
  }: CreateExpressGraphReadHandlerOptions<TAuthority>): RequestHandler =>
  async (request, response) => {
    const parsed = parseGraphReadRequest(request.body);
    if (!parsed.success) {
      response.status(400).json(parsed.error);
      return;
    }

    try {
      const dispatch = async () => {
        const currentContext = getCurrentInvocationContext();
        if (!currentContext)
          throw new Error('Express graph read invocation context is unavailable.');
        const graphContext = context
          ? await context(request)
          : {
              authority: authority
                ? await authority(currentContext, request)
                : (currentContext as TAuthority),
            };
        return dispatcher(parsed.request, graphContext);
      };
      const protocolResponse = await withInvocationContext(
        invocationContext ? await invocationContext(request) : {},
        dispatch,
      );
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
