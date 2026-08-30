import type { EntityViewAst } from '../../data-graph/view.js';
import { cloneJson, isJsonValue, type JsonValue } from '../../value/json.js';
import { isRecord } from '../../value/object.js';
import {
  operationInvocationProtocolError,
  parseOperationInvocationRequest,
  type OperationInvocationProtocolError,
  type OperationInvocationRequest,
} from '../operation-invocation.js';

import { defineRuntimeProtocolFamily } from './registry.js';

export type OperationProtocolInvokeRequestV1 = {
  readonly version: 1;
  readonly kind: 'invoke';
  readonly operationId: string;
  readonly input?: JsonValue;
  readonly view?: EntityViewAst;
};

export type OperationProtocolPermissionRequestV1 = {
  readonly version: 1;
  readonly kind: 'check-permission';
  readonly operationId: string;
  readonly input?: JsonValue;
};

export type OperationProtocolRequestV1 =
  | OperationProtocolInvokeRequestV1
  | OperationProtocolPermissionRequestV1;

export type OperationProtocolRequestParseResult =
  | { readonly success: true; readonly request: OperationProtocolRequestV1 }
  | { readonly success: false; readonly error: OperationInvocationProtocolError };

const operationProtocolRequestKeys = new Set(['version', 'kind', 'operationId', 'input', 'view']);

const hasOnlyOperationProtocolRequestKeys = (value: Record<string, unknown>) =>
  Object.keys(value).every(key => operationProtocolRequestKeys.has(key));

const invalidOperationProtocolRequest = (message: string): OperationProtocolRequestParseResult => ({
  success: false,
  error: operationInvocationProtocolError('invalid_request', message),
});

export const parseOperationProtocolRequest = (
  value: unknown,
): OperationProtocolRequestParseResult => {
  if (!isRecord(value)) {
    return invalidOperationProtocolRequest('Operation protocol request must be an object.');
  }
  if (value.version !== 1) {
    return {
      success: false,
      error: operationInvocationProtocolError(
        'unsupported_version',
        `Unsupported Operation protocol version: ${String(value.version)}.`,
      ),
    };
  }
  if (!hasOnlyOperationProtocolRequestKeys(value)) {
    return invalidOperationProtocolRequest('Operation protocol request contains unknown keys.');
  }
  if (!isJsonValue(value)) {
    return invalidOperationProtocolRequest('Operation protocol request must be JSON-safe.');
  }

  const parsed = parseOperationInvocationRequest(value);
  if (!parsed.success) return parsed;

  const request = {
    version: 1,
    kind: parsed.request.kind,
    operationId: parsed.request.operationId,
    ...(parsed.request.input === undefined
      ? {}
      : { input: cloneJson(parsed.request.input) as JsonValue }),
    ...(parsed.request.kind === 'invoke' && parsed.request.view !== undefined
      ? { view: cloneJson(parsed.request.view) }
      : {}),
  } satisfies OperationProtocolRequestV1;

  return { success: true, request };
};

export const toOperationProtocolRequest = (
  request: OperationInvocationRequest,
): OperationProtocolRequestV1 => {
  const parsed = parseOperationProtocolRequest({
    version: 1,
    kind: request.kind,
    operationId: request.operationId,
    ...(request.input === undefined ? {} : { input: request.input }),
    ...(request.kind === 'invoke' && request.view !== undefined ? { view: request.view } : {}),
  });
  if (!parsed.success) throw new TypeError(parsed.error.error.message);
  return parsed.request;
};

export const operationRuntimeProtocolFamily = defineRuntimeProtocolFamily<
  'operation',
  OperationProtocolRequestV1,
  OperationInvocationProtocolError
>({
  name: 'operation',
  parseRequest: parseOperationProtocolRequest,
});
