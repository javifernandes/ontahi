import { isJsonValue } from '../../value/json.js';

import {
  createRuntimeProtocolResponse,
  runtimeProtocolError,
  type RuntimeProtocolError,
  type RuntimeProtocolResponseEnvelope,
} from './envelope.js';
import { runtimeProtocolFamilies } from './families.js';
import {
  createRuntimeProtocolRegistry,
  type RuntimeProtocolRegisteredRequest,
} from './registry.js';

type RegisteredRequest = RuntimeProtocolRegisteredRequest<typeof runtimeProtocolFamilies>;
type RegisteredFamily = RegisteredRequest['family'];
type RegisteredRequestFor<TFamily extends RegisteredFamily> = Extract<
  RegisteredRequest,
  { readonly family: TFamily }
>;

export type RuntimeProtocolFamilyHandler<TRequest, TContext> = (
  request: TRequest,
  context: TContext,
) => unknown | PromiseLike<unknown>;

export type RuntimeProtocolFamilyHandlers<TContext> = {
  readonly [TFamily in RegisteredFamily]?: RuntimeProtocolFamilyHandler<
    RegisteredRequestFor<TFamily>['body'],
    TContext
  >;
};

export type RuntimeProtocolDispatchResult = RuntimeProtocolResponseEnvelope | RuntimeProtocolError;

export type RuntimeProtocolDispatcher<TContext> = (
  request: unknown,
  context: TContext,
) => Promise<RuntimeProtocolDispatchResult>;

export type RuntimeProtocolDispatchContext<TDispatcher> =
  TDispatcher extends RuntimeProtocolDispatcher<infer TContext> ? TContext : never;

export type CreateRuntimeProtocolDispatcherOptions<TContext> = {
  readonly handlers: RuntimeProtocolFamilyHandlers<TContext>;
  readonly reportError?: (error: unknown, request: RegisteredRequest) => void;
};

type UnknownFamilyHandler<TContext> = RuntimeProtocolFamilyHandler<unknown, TContext>;

const registry = createRuntimeProtocolRegistry(runtimeProtocolFamilies);
const registeredFamilies = new Set<string>(runtimeProtocolFamilies.map(family => family.name));

const createHandlerRegistry = <TContext>(handlers: RuntimeProtocolFamilyHandlers<TContext>) => {
  const handlerByFamily = new Map<string, UnknownFamilyHandler<TContext>>();
  for (const [family, handler] of Object.entries(handlers)) {
    if (!registeredFamilies.has(family)) {
      throw new Error(`Unknown Runtime Protocol handler family ${family}.`);
    }
    if (handler !== undefined && typeof handler !== 'function') {
      throw new TypeError(`Runtime Protocol handler ${family} must be a function.`);
    }
    if (handler) handlerByFamily.set(family, handler as UnknownFamilyHandler<TContext>);
  }
  return handlerByFamily;
};

const familyUnavailable = (request: RegisteredRequest): RuntimeProtocolError =>
  runtimeProtocolError(
    'family_unavailable',
    `Runtime Protocol family ${request.family} is unavailable in this runtime.`,
    { id: request.id, family: request.family },
  );

const dispatchUnavailable = (request: RegisteredRequest): RuntimeProtocolError =>
  runtimeProtocolError(
    'dispatch_unavailable',
    `Runtime Protocol family ${request.family} dispatch is temporarily unavailable.`,
    { id: request.id, family: request.family },
  );

const invalidHandlerResponse = (request: RegisteredRequest): RuntimeProtocolError =>
  runtimeProtocolError(
    'invalid_response',
    `Runtime Protocol family ${request.family} returned a non-portable response.`,
    { id: request.id, family: request.family },
  );

export const createRuntimeProtocolDispatcher = <TContext>(
  options: CreateRuntimeProtocolDispatcherOptions<TContext>,
): RuntimeProtocolDispatcher<TContext> => {
  const handlers = createHandlerRegistry(options.handlers);

  return async (input, context) => {
    const parsed = registry.parseRequest(input);
    if (!parsed.success) return parsed.error;

    const request = parsed.request;
    const handler = handlers.get(request.family);
    if (!handler) return familyUnavailable(request);

    let body: unknown;
    try {
      body = await handler(request.body, context);
    } catch (error) {
      options.reportError?.(error, request);
      return dispatchUnavailable(request);
    }

    if (!isJsonValue(body)) {
      options.reportError?.(
        new TypeError(`Runtime Protocol family ${request.family} response must be JSON-safe.`),
        request,
      );
      return invalidHandlerResponse(request);
    }

    return createRuntimeProtocolResponse(request, body);
  };
};
