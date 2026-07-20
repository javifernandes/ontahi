import type { OperationInvocationDispatcher } from '../operation-invocation.js';

export type GraphHttpIngressAccepted = {
  kind: 'accepted';
  provider: string;
  providerKey?: string;
  channel?: string;
  event: string | null;
  deliveryId: string | null;
  payload?: unknown;
  status?: number;
  details?: Record<string, unknown>;
};

export type GraphHttpIngressIgnored = {
  kind: 'ignored';
  provider: string;
  providerKey?: string;
  channel?: string;
  event: string | null;
  deliveryId: string | null;
  payload?: unknown;
  status?: number;
  details?: Record<string, unknown>;
};

export type GraphHttpIngressRejected = {
  kind: 'rejected';
  status: number;
  error: string;
};

export type GraphHttpIngressOutcome =
  | GraphHttpIngressAccepted
  | GraphHttpIngressIgnored
  | GraphHttpIngressRejected;

export type GraphHttpIngressProvider = {
  receive: (request: Request) => Promise<GraphHttpIngressOutcome>;
};

export type GraphHttpIngressProviderRegistry = Record<string, GraphHttpIngressProvider>;

export type GraphHttpIngressRoute = {
  operationId: string;
  method: string;
  route: string;
  provider?: string;
  channel?: string;
};

export type GraphHttpIngressDispatchInput = {
  operationId: string;
  payload: unknown;
  route: GraphHttpIngressRoute;
};

export type GraphHttpIngressDispatcher = (input: GraphHttpIngressDispatchInput) => Promise<unknown>;

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, {
    status,
  });

const acceptedStatus = (outcome: GraphHttpIngressAccepted | GraphHttpIngressIgnored) =>
  outcome.status ?? (outcome.kind === 'ignored' ? 202 : 200);

const acceptedBody = (outcome: GraphHttpIngressAccepted | GraphHttpIngressIgnored) => ({
  ok: true,
  provider: outcome.provider,
  event: outcome.event,
  deliveryId: outcome.deliveryId,
  ...(outcome.kind === 'ignored' ? { ignored: true } : {}),
  ...outcome.details,
});

const findMatchingRoute = (input: {
  routes: readonly GraphHttpIngressRoute[];
  request: Request;
  route: string;
  outcome: GraphHttpIngressAccepted | GraphHttpIngressIgnored;
}) => {
  const provider = input.outcome.providerKey ?? input.outcome.provider;
  const method = input.request.method.toUpperCase();

  return input.routes.find(
    route =>
      route.method.toUpperCase() === method &&
      route.route === input.route &&
      (!route.provider || route.provider === provider) &&
      (!route.channel || route.channel === input.outcome.channel),
  );
};

const findRequestRoutes = (input: {
  routes: readonly GraphHttpIngressRoute[];
  request: Request;
  route: string;
}) => {
  const method = input.request.method.toUpperCase();

  return input.routes.filter(
    route => route.method.toUpperCase() === method && route.route === input.route,
  );
};

const findRequestProvider = (input: {
  providers: GraphHttpIngressProviderRegistry;
  routes: readonly GraphHttpIngressRoute[];
}) => {
  const providerKeys = Array.from(
    new Set(
      input.routes
        .map(route => route.provider)
        .filter((provider): provider is string => typeof provider === 'string'),
    ),
  );

  if (providerKeys.length !== 1) {
    return {
      kind: 'error' as const,
      response: json(
        {
          ok: false,
          error:
            providerKeys.length === 0
              ? 'No HTTP ingress provider is configured for this route.'
              : 'Multiple HTTP ingress providers match this route.',
        },
        500,
      ),
    };
  }

  const providerKey = providerKeys[0] as string;
  const provider = input.providers[providerKey];

  if (!provider) {
    return {
      kind: 'error' as const,
      response: json(
        {
          ok: false,
          error: `HTTP ingress provider "${providerKey}" is not registered.`,
        },
        500,
      ),
    };
  }

  return {
    kind: 'provider' as const,
    provider,
  };
};

export const createGraphHttpIngressOperationDispatcher =
  (input: { dispatcher: OperationInvocationDispatcher }) =>
  async ({ operationId, payload }: GraphHttpIngressDispatchInput) => {
    const response = await input.dispatcher({
      kind: 'invoke',
      operationId,
      input: payload ?? {},
    });

    if (response.kind === 'protocol-error') {
      throw new Error(response.error.message);
    }

    if (response.kind !== 'invocation-result') {
      throw new Error('Ingress operation returned an unexpected permission result.');
    }

    if (!response.result.ok) {
      throw new Error(response.result.message);
    }
  };

export const createGraphHttpIngressRoute =
  (input: {
    provider: GraphHttpIngressProvider;
    route?: string;
    routes?: readonly GraphHttpIngressRoute[];
    dispatch?: GraphHttpIngressDispatcher;
  }) =>
  async (request: Request) => {
    const outcome = await input.provider.receive(request);

    if (outcome.kind === 'rejected') {
      return json(
        {
          ok: false,
          error: outcome.error,
        },
        outcome.status,
      );
    }

    const route =
      input.routes && input.dispatch
        ? findMatchingRoute({
            routes: input.routes,
            request,
            route: input.route ?? new URL(request.url).pathname,
            outcome,
          })
        : undefined;
    const dispatch = input.dispatch;

    if (route && dispatch) {
      try {
        await dispatch({
          operationId: route.operationId,
          payload: outcome.payload,
          route,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ingress operation failed';

        return json(
          {
            ok: false,
            error: message,
          },
          500,
        );
      }
    }

    return json(acceptedBody(outcome), acceptedStatus(outcome));
  };

export const createGraphHttpIngressRouter = (input: {
  routes: readonly GraphHttpIngressRoute[];
  providers: GraphHttpIngressProviderRegistry;
  dispatch: GraphHttpIngressDispatcher;
}) => ({
  handle: async (request: Request) => {
    const routePath = new URL(request.url).pathname;
    const requestRoutes = findRequestRoutes({
      routes: input.routes,
      request,
      route: routePath,
    });

    if (requestRoutes.length === 0) {
      return json(
        {
          ok: false,
          error: 'No HTTP ingress route matches this request.',
        },
        404,
      );
    }

    const providerMatch = findRequestProvider({
      providers: input.providers,
      routes: requestRoutes,
    });

    if (providerMatch.kind === 'error') {
      return providerMatch.response;
    }

    return createGraphHttpIngressRoute({
      provider: providerMatch.provider,
      route: routePath,
      routes: requestRoutes,
      dispatch: input.dispatch,
    })(request);
  },
});
