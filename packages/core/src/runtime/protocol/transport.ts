import type { GraphReadRequestV1 } from '../../data-graph/read-protocol.js';
import type { JsonValue } from '../../value/json.js';
import type { TaskRunIdentity, TaskSnapshot } from '../contracts.js';

import {
  createRuntimeProtocolRequest,
  isRuntimeProtocolError,
  parseRuntimeProtocolResponse,
  type RuntimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
} from './envelope.js';
import type { RuntimeProtocolGraphObservationBody } from './session.js';

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

export type RuntimeTransport<TTransportOptions = unknown> = {
  request(
    request: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions<TTransportOptions>,
  ): Promise<RuntimeProtocolResponseEnvelope | RuntimeProtocolError>;
  readonly durableOperation?: DurableOperationObservationCapability;
  readonly graph?: GraphObservationCapability<TTransportOptions>;
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

let fallbackExchangeSequence = 0;

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
