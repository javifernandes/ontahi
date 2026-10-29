import type { OperationInvocationDispatcher } from '@ontahi/core/runtime/operation-invocation';
import type { AnyEventDeclaration, EventApplication } from '@ontahi/core/runtime/server';
import {
  type GraphHttpEventIngressRoute,
  type GraphHttpIngressProviderRegistry,
  type GraphHttpIngressRoute,
} from '@ontahi/core/runtime/server/ingress';
import { createHttpIngressHandler } from '@ontahi/runtime-http/ingress';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response as ExpressResponse,
  type Router,
} from 'express';

export type { GraphHttpEventIngressRoute } from '@ontahi/core/runtime/server/ingress';

export type OntahiExpressIngressOptions = {
  providers: GraphHttpIngressProviderRegistry;
  eventRoutes?: readonly GraphHttpEventIngressRoute[];
  bodyLimit?: number | string;
};

type MountExpressHttpIngressOptions = {
  router: Router;
  routes: readonly GraphHttpIngressRoute[];
  ingress: OntahiExpressIngressOptions;
  dispatcher: OperationInvocationDispatcher;
  events?: EventApplication<readonly AnyEventDeclaration[]>;
  reportError?: (error: unknown, request: Request) => void;
};

const requestHeaders = (request: Request) => {
  const headers = new Headers();

  Object.entries(request.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => headers.append(name, item));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  });

  return headers;
};

const requestBody = (request: Request) => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.body === undefined) {
    return undefined;
  }

  if (Buffer.isBuffer(request.body) || typeof request.body === 'string') {
    return request.body;
  }

  throw new Error(
    'Ontahi HTTP ingress requires the raw request body. Mount ontahiExpress before host body-parsing middleware.',
  );
};

const toWebRequest = (request: Request) =>
  new globalThis.Request(
    new URL(request.url, `${request.protocol}://${request.get('host') ?? 'localhost'}`),
    {
      method: request.method,
      headers: requestHeaders(request),
      body: requestBody(request),
    },
  );

const sendWebResponse = async (response: ExpressResponse, webResponse: Response) => {
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.status(webResponse.status).send(Buffer.from(await webResponse.arrayBuffer()));
};

const ingressHandler =
  (input: {
    handle: (request: globalThis.Request) => Promise<Response>;
    reportError?: (error: unknown, request: Request) => void;
  }): RequestHandler =>
  (request, response, next: NextFunction) => {
    void input
      .handle(toWebRequest(request))
      .then(result => sendWebResponse(response, result))
      .catch(error => {
        input.reportError?.(error, request);
        next(error);
      });
  };

export const mountExpressHttpIngress = ({
  router,
  routes,
  ingress,
  dispatcher,
  events,
  reportError,
}: MountExpressHttpIngressOptions) => {
  const eventRoutes = ingress.eventRoutes ?? [];
  if (routes.length === 0 && eventRoutes.length === 0) return;

  if (eventRoutes.length > 0 && !events) {
    throw new Error(
      'Ontahi Express Event ingress requires an application created with ontahi() and registered Events.',
    );
  }

  const ingressHandlerAdapter = createHttpIngressHandler({
    providers: ingress.providers,
    operations: { routes, dispatcher },
    ...(events ? { events: { routes: eventRoutes, events } } : {}),
  });
  const handle = ingressHandler({ handle: ingressHandlerAdapter.handle, reportError });
  const rawBody = express.raw({
    type: '*/*',
    ...(ingress.bodyLimit === undefined ? {} : { limit: ingress.bodyLimit }),
  });

  Array.from(new Set(routes.map(route => route.route))).forEach(path =>
    router.all(path, rawBody, handle),
  );
  Array.from(new Set(eventRoutes.map(route => route.route))).forEach(path =>
    router.all(path, rawBody, handle),
  );
};
