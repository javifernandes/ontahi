import {
  isGraphReadCapabilities,
  parseGraphCommandRequest,
  parseGraphReadRequest,
  type GraphCommandRequest,
  type GraphReadCapabilities,
  type GraphReadRequest,
} from '../../data-graph/index.js';
import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';
import type { ModelCommandRequest, ModelCommandResult } from '../contracts.js';
import {
  parseOperationInvocationRequest,
  type OperationInvokeRequest,
} from '../operation-invocation.js';

import { isTaskRunIdentity, parseTaskPendingInteraction } from './durable-operation.js';
import { defineRuntimeProtocolFamily } from './registry.js';

export type ModelCommandProtocolRequestV1 = {
  readonly version: 1;
  readonly kind: 'model-command';
  readonly text: string;
  readonly language?: string;
  readonly context?: JsonValue;
};

export type ModelCommandProtocolRequestError = {
  readonly error: {
    readonly code: 'invalid_request' | 'unsupported_version';
    readonly message: string;
  };
};

export type ModelCommandProtocolRequestParseResult =
  | { readonly success: true; readonly request: ModelCommandProtocolRequestV1 }
  | { readonly success: false; readonly error: ModelCommandProtocolRequestError };

export type ModelCommandProtocolResponse =
  | {
      readonly version: 1;
      readonly kind: 'model-command-result';
      readonly result: ModelCommandResult<ModelCommandCanonicalRequest, ModelCommandReadResponse>;
    }
  | {
      readonly version: 1;
      readonly kind: 'protocol-error';
      readonly error: { readonly code: string; readonly message: string };
    };

export type ModelCommandProtocolResponseParseResult =
  | { readonly success: true; readonly response: ModelCommandProtocolResponse }
  | { readonly success: false; readonly error: ModelCommandProtocolRequestError };

const requestKeys = new Set(['version', 'kind', 'text', 'language', 'context']);
const responseKeys = new Set(['version', 'kind', 'result', 'error']);
const resultKeys = new Set(['status', 'message', 'request', 'response', 'run', 'interaction']);
const errorKeys = new Set(['code', 'message']);
const readResponseKeys = new Set(['kind', 'value', 'capabilities']);
const hasOnlyKeys = (value: Record<string, unknown>, keys: ReadonlySet<string>) =>
  Object.keys(value).every(key => keys.has(key));

export type ModelCommandCanonicalRequest =
  | GraphReadRequest
  | GraphCommandRequest
  | OperationInvokeRequest;
export type ModelCommandReadResponse = {
  readonly kind: 'graph-read-result';
  readonly value: JsonValue;
  readonly capabilities?: GraphReadCapabilities;
};

const parseModelCommandCanonicalRequest = (
  value: unknown,
): ModelCommandCanonicalRequest | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'graph-read') {
    const parsed = parseGraphReadRequest(value);
    return parsed.success ? parsed.request : undefined;
  }
  if (value.kind === 'graph-command') {
    const parsed = parseGraphCommandRequest(value);
    return parsed.success ? parsed.request : undefined;
  }
  const parsed = parseOperationInvocationRequest(value);
  return parsed.success && parsed.request.kind === 'invoke' ? parsed.request : undefined;
};

const parseModelCommandReadResponse = (value: unknown): ModelCommandReadResponse | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, readResponseKeys) ||
    value.kind !== 'graph-read-result' ||
    !isJsonValue(value.value) ||
    (value.capabilities !== undefined && !isGraphReadCapabilities(value.capabilities)) ||
    !isJsonValue(value)
  )
    return undefined;
  return cloneJson(value) as ModelCommandReadResponse;
};

const requestError = (
  code: ModelCommandProtocolRequestError['error']['code'],
  message: string,
): ModelCommandProtocolRequestError => ({ error: { code, message } });

export const parseModelCommandProtocolRequest = (
  value: unknown,
): ModelCommandProtocolRequestParseResult => {
  if (!isRecord(value))
    return {
      success: false,
      error: requestError('invalid_request', 'Model command must be an object.'),
    };
  if (value.version !== 1)
    return {
      success: false,
      error: requestError(
        'unsupported_version',
        `Unsupported Model Command protocol version: ${String(value.version)}.`,
      ),
    };
  if (
    !hasOnlyKeys(value, requestKeys) ||
    value.kind !== 'model-command' ||
    typeof value.text !== 'string' ||
    (value.language !== undefined && typeof value.language !== 'string') ||
    (value.context !== undefined && !isJsonValue(value.context)) ||
    !isJsonValue(value)
  )
    return {
      success: false,
      error: requestError('invalid_request', 'Model command request is invalid.'),
    };
  return { success: true, request: cloneJson(value) as ModelCommandProtocolRequestV1 };
};

export const toModelCommandProtocolRequest = (
  request: ModelCommandRequest,
): ModelCommandProtocolRequestV1 => {
  const parsed = parseModelCommandProtocolRequest({
    version: 1,
    kind: 'model-command',
    ...request,
  });
  if (!parsed.success) throw new TypeError(parsed.error.error.message);
  return parsed.request;
};

export const modelCommandProtocolResult = (
  result: ModelCommandResult<ModelCommandCanonicalRequest, ModelCommandReadResponse>,
): ModelCommandProtocolResponse => ({ version: 1, kind: 'model-command-result', result });

export const modelCommandProtocolError = (
  code: string,
  message: string,
): ModelCommandProtocolResponse => ({
  version: 1,
  kind: 'protocol-error',
  error: { code, message },
});

export const parseModelCommandProtocolResponse = (
  value: unknown,
): ModelCommandProtocolResponseParseResult => {
  if (!isRecord(value) || value.version !== 1 || !hasOnlyKeys(value, responseKeys))
    return {
      success: false,
      error: requestError('invalid_request', 'Model command response is invalid.'),
    };
  if (
    value.kind === 'protocol-error' &&
    value.result === undefined &&
    isRecord(value.error) &&
    hasOnlyKeys(value.error, errorKeys) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    isJsonValue(value)
  )
    return { success: true, response: cloneJson(value) as ModelCommandProtocolResponse };
  if (
    value.kind === 'model-command-result' &&
    value.error === undefined &&
    isRecord(value.result) &&
    hasOnlyKeys(value.result, resultKeys) &&
    typeof value.result.message === 'string' &&
    isJsonValue(value)
  ) {
    if (
      (value.result.status === 'answered' || value.result.status === 'unresolved') &&
      value.result.request === undefined &&
      value.result.response === undefined &&
      value.result.run === undefined &&
      value.result.interaction === undefined
    )
      return {
        success: true,
        response: {
          version: 1,
          kind: 'model-command-result',
          result: { status: value.result.status, message: value.result.message },
        },
      };
    if (
      value.result.status === 'executed' &&
      value.result.run === undefined &&
      value.result.interaction === undefined
    ) {
      const request = parseModelCommandCanonicalRequest(value.result.request);
      const response =
        request?.kind === 'graph-read'
          ? parseModelCommandReadResponse(value.result.response)
          : undefined;
      if (
        request &&
        ((request.kind === 'graph-read' && response !== undefined) ||
          (request.kind !== 'graph-read' && value.result.response === undefined))
      )
        return {
          success: true,
          response: {
            version: 1,
            kind: 'model-command-result',
            result: {
              status: 'executed',
              message: value.result.message,
              request,
              ...(response === undefined ? {} : { response }),
            },
          },
        };
    }
    if (
      value.result.status === 'started' &&
      value.result.response === undefined &&
      value.result.interaction === undefined
    ) {
      const request = parseModelCommandCanonicalRequest(value.result.request);
      if (request && isTaskRunIdentity(value.result.run))
        return {
          success: true,
          response: {
            version: 1,
            kind: 'model-command-result',
            result: {
              status: 'started',
              message: value.result.message,
              request,
              run: { taskId: value.result.run.taskId, runId: value.result.run.runId },
            },
          },
        };
    }
    if (
      value.result.status === 'pending' &&
      value.result.request === undefined &&
      value.result.response === undefined &&
      isTaskRunIdentity(value.result.run)
    ) {
      const interaction = parseTaskPendingInteraction(value.result.interaction);
      if (interaction)
        return {
          success: true,
          response: {
            version: 1,
            kind: 'model-command-result',
            result: {
              status: 'pending',
              message: value.result.message,
              run: { taskId: value.result.run.taskId, runId: value.result.run.runId },
              interaction,
            },
          },
        };
    }
  }
  return {
    success: false,
    error: requestError('invalid_request', 'Model command response is invalid.'),
  };
};

export const modelCommandRuntimeProtocolFamily = defineRuntimeProtocolFamily<
  'model.command',
  ModelCommandProtocolRequestV1,
  ModelCommandProtocolRequestError
>({ name: 'model.command', parseRequest: parseModelCommandProtocolRequest });
