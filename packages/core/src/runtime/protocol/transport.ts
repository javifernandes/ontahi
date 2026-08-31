import type { JsonValue } from '../../value/json.js';
import type { TaskRunIdentity, TaskSnapshot } from '../contracts.js';

import type {
  RuntimeProtocolError,
  RuntimeProtocolRequestEnvelope,
  RuntimeProtocolResponseEnvelope,
} from './envelope.js';

export type RuntimeTransportRequestOptions = {
  readonly signal?: AbortSignal;
};

export type DurableOperationObservationOptions = RuntimeTransportRequestOptions;

export type DurableOperationObservationCapability = {
  observe<TResult = JsonValue>(
    run: TaskRunIdentity,
    options?: DurableOperationObservationOptions,
  ): AsyncIterable<TaskSnapshot<TResult>>;
};

export type RuntimeTransport = {
  request(
    request: RuntimeProtocolRequestEnvelope,
    options?: RuntimeTransportRequestOptions,
  ): Promise<RuntimeProtocolResponseEnvelope | RuntimeProtocolError>;
  readonly durableOperation?: DurableOperationObservationCapability;
};
