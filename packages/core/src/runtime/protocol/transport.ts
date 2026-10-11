import type { GraphReadRequest, GraphReadRequestV1 } from '../../data-graph/read-protocol.js';
import type { JsonValue } from '../../value/json.js';
import type { TaskRunIdentity, TaskSnapshot } from '../contracts.js';

import {
  createRuntimeProtocolRequest,
  isRuntimeProtocolError,
  parseRuntimeProtocolResponse,
  RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY,
  type RuntimeProtocolExecutionMetadata,
  type RuntimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
} from './envelope.js';
import type {
  RuntimeProtocolGraphObservationBody,
  RuntimeProtocolGraphRefreshCause,
} from './session.js';

export type RuntimeTransportRequestOptions<TTransportOptions = unknown> = {
  readonly signal?: AbortSignal;
  readonly transportOptions?: TTransportOptions;
};

export type DurableOperationObservationOptions = RuntimeTransportRequestOptions;

export type DurableOperationObservationCapability = {
  observe<TResult = JsonValue>(
    run: TaskRunIdentity,
    options?: DurableOperationObservationOptions,
  ): AsyncIterable<TaskSnapshot<TResult>>;
};

export type GraphObservationCapability<TTransportOptions = unknown> = {
  observe(
    request: GraphReadRequestV1,
    options?: RuntimeTransportRequestOptions<TTransportOptions>,
  ): AsyncIterable<RuntimeProtocolGraphObservationBody>;
};

export type RuntimeTransportCausalityCapability = {
  associateGraphReadRefreshes(
    requests: readonly GraphReadRequest[],
    causedBy: RuntimeProtocolGraphRefreshCause,
  ): void;
};

export type RuntimeTransportDescriptor = {
  /** Stable implementation kind for tooling and host composition (for example, fetch or websocket). */
  readonly kind: string;
};

export type RuntimeTransport<TTransportOptions = unknown> = {
  readonly descriptor?: RuntimeTransportDescriptor;
  request(
    request: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions<TTransportOptions>,
  ): Promise<RuntimeProtocolResponseEnvelope | RuntimeProtocolError>;
  readonly durableOperation?: DurableOperationObservationCapability;
  readonly graph?: GraphObservationCapability<TTransportOptions>;
  /** Client-local causal context used by diagnostics; it is never sent over the wire. */
  readonly causality?: RuntimeTransportCausalityCapability;
};

export type RuntimeProtocolExchangeRequest<TFamily extends string, TBody> = {
  readonly family: TFamily;
  readonly body: TBody;
};

export type RuntimeProtocolExchange<TTransportOptions = unknown> = <TFamily extends string, TBody>(
  request: RuntimeProtocolExchangeRequest<TFamily, TBody>,
  options?: RuntimeTransportRequestOptions<TTransportOptions>,
) => Promise<unknown>;

export type CreateRuntimeProtocolExchangeOptions<TTransportOptions = unknown> = {
  readonly transport: RuntimeTransport<TTransportOptions>;
  readonly requestId?: () => string;
};

export type RuntimeProtocolExecutionExchangeResult = {
  readonly body: unknown;
  readonly metadata?: RuntimeProtocolExecutionMetadata;
};

export type RuntimeProtocolExecution = {
  readonly request: RuntimeProtocolExchangeRequest<string, unknown>;
  readonly metadata: RuntimeProtocolExecutionMetadata;
};

export type RuntimeProtocolExecutionListener = (
  execution: RuntimeProtocolExecution,
) => boolean | void | Promise<boolean | void>;

export type RuntimeProtocolExecutionExchange<TTransportOptions = unknown> = <
  TFamily extends string,
  TBody,
>(
  request: RuntimeProtocolExchangeRequest<TFamily, TBody>,
  options?: RuntimeTransportRequestOptions<TTransportOptions>,
) => Promise<RuntimeProtocolExecutionExchangeResult>;

let fallbackExchangeSequence = 0;

const executionListeners = new WeakMap<RuntimeTransport, Set<RuntimeProtocolExecutionListener>>();
const observedExecutionMetadata = new WeakSet<RuntimeProtocolExecutionMetadata>();

export const subscribeRuntimeProtocolExecutions = (
  transport: RuntimeTransport,
  listener: RuntimeProtocolExecutionListener,
) => {
  const listeners =
    executionListeners.get(transport) ?? new Set<RuntimeProtocolExecutionListener>();
  listeners.add(listener);
  executionListeners.set(transport, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) executionListeners.delete(transport);
  };
};

export const wasRuntimeProtocolExecutionObserved = (metadata: RuntimeProtocolExecutionMetadata) =>
  observedExecutionMetadata.has(metadata);

const publishRuntimeProtocolExecution = async (
  transport: RuntimeTransport,
  execution: RuntimeProtocolExecution,
) => {
  const listeners = [...(executionListeners.get(transport) ?? [])];
  if (listeners.length === 0) return;
  const outcomes = await Promise.allSettled(
    listeners.map(listener => Promise.resolve().then(() => listener(execution))),
  );
  if (outcomes.some(outcome => outcome.status === 'fulfilled' && outcome.value === true))
    observedExecutionMetadata.add(execution.metadata);
};

const defaultRequestId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `ontahi-runtime-${Date.now()}-${(fallbackExchangeSequence += 1)}`;

export const createRuntimeProtocolExchange =
  <TTransportOptions = unknown>({
    transport,
    requestId = defaultRequestId,
  }: CreateRuntimeProtocolExchangeOptions<TTransportOptions>): RuntimeProtocolExchange<TTransportOptions> =>
  async (input, options) => {
    const request = createRuntimeProtocolRequest({
      id: requestId(),
      ...input,
    }) as RuntimeProtocolRequestEnvelope;
    const parsed = parseRuntimeProtocolResponse(await transport.request(request, options), request);
    if (!parsed.success) throw new Error(parsed.error.error.message);
    if (isRuntimeProtocolError(parsed.response)) {
      throw new Error(parsed.response.error.message);
    }
    return parsed.response.body;
  };

export const createRuntimeProtocolExecutionExchange =
  <TTransportOptions = unknown>({
    transport,
    requestId = defaultRequestId,
  }: CreateRuntimeProtocolExchangeOptions<TTransportOptions>): RuntimeProtocolExecutionExchange<TTransportOptions> =>
  async (input, options) => {
    const request = createRuntimeProtocolRequest({
      id: requestId(),
      ...input,
      accepts: [RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY],
    }) as RuntimeProtocolRequestEnvelope;
    const parsed = parseRuntimeProtocolResponse(await transport.request(request, options), request);
    if (!parsed.success) throw new Error(parsed.error.error.message);
    if (isRuntimeProtocolError(parsed.response)) {
      throw new Error(parsed.response.error.message);
    }
    const result = {
      body: parsed.response.body,
      ...(parsed.response.metadata === undefined ? {} : { metadata: parsed.response.metadata }),
    };
    if (parsed.response.metadata) {
      await publishRuntimeProtocolExecution(transport, {
        request: input,
        metadata: parsed.response.metadata,
      });
    }
    return result;
  };
