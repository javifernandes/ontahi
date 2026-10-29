import type { OperationInvocationDispatcher } from '@ontahi/core/runtime/operation-invocation';
import type { AnyEventDeclaration, EventApplication } from '@ontahi/core/runtime/server';
import {
  createGraphHttpEventIngressDispatcher,
  createGraphHttpEventIngressRouter,
  createGraphHttpIngressOperationDispatcher,
  createGraphHttpIngressRouter,
  type GraphHttpEventIngressRoute,
  type GraphHttpIngressProviderRegistry,
  type GraphHttpIngressRoute,
} from '@ontahi/core/runtime/server/ingress';

export type HttpOperationIngress = {
  readonly routes: readonly GraphHttpIngressRoute[];
  readonly dispatcher: OperationInvocationDispatcher;
};

export type HttpEventIngress = {
  readonly routes: readonly GraphHttpEventIngressRoute[];
  readonly events: EventApplication<readonly AnyEventDeclaration[]>;
};

export type CreateHttpIngressHandlerOptions = {
  readonly providers: GraphHttpIngressProviderRegistry;
  readonly operations?: HttpOperationIngress;
  readonly events?: HttpEventIngress;
};

export type HttpIngressHandler = {
  readonly handle: (request: Request) => Promise<Response>;
};

const notFound = () =>
  Response.json(
    { ok: false, error: 'No HTTP ingress route matches this request.' },
    { status: 404 },
  );

const routePaths = (routes: readonly { route: string }[]) =>
  new Set(routes.map(route => route.route));

export const createHttpIngressHandler = (
  options: CreateHttpIngressHandlerOptions,
): HttpIngressHandler => {
  const operationRoutes = options.operations?.routes ?? [];
  const eventRoutes = options.events?.routes ?? [];
  const operationPaths = routePaths(operationRoutes);
  const sharedPath = eventRoutes.find(route => operationPaths.has(route.route))?.route;
  if (sharedPath !== undefined) {
    throw new TypeError(
      `HTTP ingress cannot bind Operation and Event routes to the same path ${sharedPath}.`,
    );
  }

  const operationRouter = options.operations
    ? createGraphHttpIngressRouter({
        routes: operationRoutes,
        providers: options.providers,
        dispatch: createGraphHttpIngressOperationDispatcher({
          dispatcher: options.operations.dispatcher,
        }),
      })
    : undefined;
  const eventRouter = options.events
    ? createGraphHttpEventIngressRouter({
        routes: eventRoutes,
        providers: options.providers,
        dispatch: createGraphHttpEventIngressDispatcher({ events: options.events.events }),
      })
    : undefined;
  const eventPaths = routePaths(eventRoutes);

  return {
    handle: request => {
      const path = new URL(request.url).pathname;
      if (operationPaths.has(path) && operationRouter !== undefined) {
        return operationRouter.handle(request);
      }
      if (eventPaths.has(path) && eventRouter !== undefined) return eventRouter.handle(request);
      return Promise.resolve(notFound());
    },
  };
};
