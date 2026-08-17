import type { EntityViewAst } from '../data-graph/view.js';
import { isRecord } from '../value/object.js';

import type { OperationInvocationResult, OperationValidationIssue } from './contracts.js';

export type OperationInvokeRequest = {
  kind: 'invoke';
  operationId: string;
  input?: unknown;
  view?: EntityViewAst;
};

export type OperationPermissionRequest = {
  kind: 'check-permission';
  operationId: string;
  input?: unknown;
};

export type OperationInvocationRequest = OperationInvokeRequest | OperationPermissionRequest;

export type OperationPermissionResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
      message: string;
      issues?: OperationValidationIssue[];
    };

export type OperationInvocationResponse = {
  kind: 'invocation-result';
  result: OperationInvocationResult;
};

export type OperationPermissionResponse = {
  kind: 'permission-result';
  result: OperationPermissionResult;
};

export type OperationInvocationProtocolErrorCode =
  | 'invalid_request'
  | 'invalid_response'
  | 'invocation_unavailable';

export type OperationInvocationProtocolError = {
  kind: 'protocol-error';
  error: {
    code: OperationInvocationProtocolErrorCode;
    message: string;
  };
};

export type OperationInvocationProtocolResponse =
  | OperationInvocationResponse
  | OperationPermissionResponse
  | OperationInvocationProtocolError;

export type OperationInvocationDispatcher = (
  request: OperationInvocationRequest,
) => Promise<OperationInvocationProtocolResponse>;

export type OperationInvocationRequestParseResult =
  | {
      success: true;
      request: OperationInvocationRequest;
    }
  | {
      success: false;
      error: OperationInvocationProtocolError;
    };

export const operationInvocationProtocolError = (
  code: OperationInvocationProtocolErrorCode,
  message: string,
): OperationInvocationProtocolError => ({
  kind: 'protocol-error',
  error: {
    code,
    message,
  },
});

export const parseOperationInvocationRequest = (
  value: unknown,
): OperationInvocationRequestParseResult => {
  if (!isRecord(value)) {
    return {
      success: false,
      error: operationInvocationProtocolError(
        'invalid_request',
        'Operation invocation request must be an object.',
      ),
    };
  }

  const kind = value.kind;
  const operationId = value.operationId;

  if (kind !== 'invoke' && kind !== 'check-permission') {
    return {
      success: false,
      error: operationInvocationProtocolError(
        'invalid_request',
        'Operation invocation kind must be "invoke" or "check-permission".',
      ),
    };
  }

  if (typeof operationId !== 'string' || operationId.length === 0) {
    return {
      success: false,
      error: operationInvocationProtocolError(
        'invalid_request',
        'Operation invocation operationId must be a non-empty string.',
      ),
    };
  }

  if (value.view !== undefined && (kind !== 'invoke' || !isRecord(value.view))) {
    return {
      success: false,
      error: operationInvocationProtocolError(
        'invalid_request',
        'Operation invocation view must be an object on an invoke request.',
      ),
    };
  }

  return {
    success: true,
    request: {
      kind,
      operationId,
      input: value.input,
      ...(kind === 'invoke' && value.view !== undefined
        ? { view: value.view as EntityViewAst }
        : {}),
    },
  };
};

export const isOperationInvocationProtocolResponse = (
  value: unknown,
): value is OperationInvocationProtocolResponse => {
  if (!isRecord(value)) {
    return false;
  }

  if (value.kind === 'protocol-error') {
    return isRecord(value.error) && typeof value.error.message === 'string';
  }

  if (value.kind === 'invocation-result') {
    return isRecord(value.result) && typeof value.result.ok === 'boolean';
  }

  if (value.kind === 'permission-result') {
    return isRecord(value.result) && typeof value.result.allowed === 'boolean';
  }

  return false;
};
