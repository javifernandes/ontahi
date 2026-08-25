import {
  graphCommandProtocolError,
  type GraphCommandDispatchContext,
  type GraphCommandDispatcher,
  type GraphCommandDispatchResponse,
} from '@ontahi/core/data-graph';
import {
  getCurrentInvocationContext,
  withInvocationContext,
  type InvocationContext,
} from '@ontahi/core/runtime/server';
import type { Request, RequestHandler } from 'express';

import type { ExpressInvocationContextFactory } from '../request-context.js';

export type ExpressGraphCommandContextFactory<TAuthority> = (
  request: Request,
) => GraphCommandDispatchContext<TAuthority> | Promise<GraphCommandDispatchContext<TAuthority>>;

export type ExpressGraphCommandAuthorityFactory<TAuthority> = (
  context: InvocationContext,
  request: Request,
) => TAuthority | Promise<TAuthority>;

export type CreateExpressGraphCommandHandlerOptions<TAuthority> = {
  dispatcher: GraphCommandDispatcher<TAuthority>;
  context?: ExpressGraphCommandContextFactory<TAuthority>;
  authority?: ExpressGraphCommandAuthorityFactory<TAuthority>;
  invocationContext?: ExpressInvocationContextFactory;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (response: GraphCommandDispatchResponse) => {
  if (response.kind === 'graph-command-result') return 200;
  if (response.kind === 'graph-command-rejection') return 409;
  if (response.error.code === 'access_denied') return 403;
  if (response.error.code === 'execution_unavailable') return 503;
  return 400;
};

export const createExpressGraphCommandHandler =
  <TAuthority>({
    dispatcher,
    context,
    authority,
    invocationContext,
    reportError,
  }: CreateExpressGraphCommandHandlerOptions<TAuthority>): RequestHandler =>
  async (request, response) => {
    try {
      const dispatch = async () => {
        const currentContext = getCurrentInvocationContext();
        if (!currentContext) {
          throw new Error('Express graph Command invocation context is unavailable.');
        }
        const graphContext = context
          ? await context(request)
          : {
              authority: authority
                ? await authority(currentContext, request)
                : (currentContext as TAuthority),
            };
        return dispatcher(request.body, graphContext);
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
          graphCommandProtocolError(
            'execution_unavailable',
            'Data graph Command execution is temporarily unavailable.',
          ),
        );
    }
  };
