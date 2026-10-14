import type { AnyEventDeclaration, EventApplication } from '@ontahi/core/runtime/server';
import {
  createGraphHttpEventIngressDispatcher,
  createGraphHttpEventIngressRouter,
  type GraphHttpEventIngressRoute,
  type GraphHttpIngressProviderRegistry,
} from '@ontahi/core/runtime/server/ingress';

export type CreateNextEventIngressRouteHandlerOptions = {
  events: EventApplication<readonly AnyEventDeclaration[]>;
  route: GraphHttpEventIngressRoute;
  providers: GraphHttpIngressProviderRegistry;
  reportError?: (error: unknown, request: Request) => void;
};

export const createNextEventIngressRouteHandler = (
  options: CreateNextEventIngressRouteHandlerOptions,
) => {
  const router = createGraphHttpEventIngressRouter({
    routes: [options.route],
    providers: options.providers,
    dispatch: createGraphHttpEventIngressDispatcher({ events: options.events }),
  });

  return async (request: Request): Promise<Response> => {
    try {
      return await router.handle(request);
    } catch (error) {
      options.reportError?.(error, request);
      return Response.json(
        { ok: false, error: 'Event ingress is temporarily unavailable.' },
        { status: 500 },
      );
    }
  };
};
