import {
  graphReadProtocolError,
  parseGraphReadRequest,
  type GraphReadDispatcher,
  type GraphReadDispatchResponse,
} from '@ontahi/core/data-graph';
import {
  getCurrentInvocationContext,
  withInvocationContext,
  type InvocationContext,
} from '@ontahi/core/runtime/server';

import type { NextInvocationContextFactory } from '../request-context.js';

export type NextGraphReadAuthorityFactory<TAuthority> = (
  context: InvocationContext,
  request: Request,
) => TAuthority | Promise<TAuthority>;

export type CreateNextGraphReadRouteHandlerOptions<TAuthority> = {
  dispatcher: GraphReadDispatcher<TAuthority>;
  authority?: NextGraphReadAuthorityFactory<TAuthority>;
  invocationContext?: NextInvocationContextFactory;
  reportError?: (error: unknown, request: Request) => void;
};

const responseStatus = (response: GraphReadDispatchResponse) => {
  if (response.kind === 'graph-read-result') return 200;
  if (response.error.code === 'access_denied') return 403;
  if (response.error.code === 'execution_unavailable') return 503;
  return 400;
};

export const createNextGraphReadRouteHandler =
  <TAuthority>({
    dispatcher,
    authority,
    invocationContext,
    reportError,
  }: CreateNextGraphReadRouteHandlerOptions<TAuthority>) =>
  async (request: Request): Promise<Response> => {
    const parsed = parseGraphReadRequest(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(parsed.error, { status: 400 });
    }

    try {
      const dispatch = async () => {
        const currentContext = getCurrentInvocationContext();
        if (!currentContext) {
          throw new Error('Next.js graph read invocation context is unavailable.');
        }
        return dispatcher(parsed.request, {
          authority: authority
            ? await authority(currentContext, request)
            : (currentContext as TAuthority),
        });
      };
      const protocolResponse = await withInvocationContext(
        invocationContext ? await invocationContext(request) : {},
        dispatch,
      );

      return Response.json(protocolResponse, { status: responseStatus(protocolResponse) });
    } catch (error) {
      reportError?.(error, request);

      return Response.json(
        graphReadProtocolError(
          'execution_unavailable',
          'Data graph read execution is temporarily unavailable.',
        ),
        { status: 503 },
      );
    }
  };
