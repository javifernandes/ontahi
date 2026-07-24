import { normalizeEntityRefInput } from '../../data-graph/ref.js';
import { safeParseUnknownGraphSchema } from '../../data-graph/schema.js';
import {
  operationInputInvalid,
  operationRejected,
  toOperationValidationIssues,
  type OperationInvocationResult,
} from '../contracts.js';
import {
  operationInvocationProtocolError,
  type OperationInvocationDispatcher,
  type OperationInvocationProtocolResponse,
  type OperationInvocationRequest,
  type OperationPermissionResult,
} from '../operation-invocation.js';

import type { ResolvedDomainOperationDeclaration } from './domain-operations.js';

export type OperationInvocationOperation = ResolvedDomainOperationDeclaration<any, any, any, any>;

export type OperationInvocationResolver = (
  operationId: string,
) => OperationInvocationOperation | undefined;

export type OperationInvocationExecutor = (
  operation: OperationInvocationOperation,
  input: unknown,
) => Promise<OperationInvocationResult>;

export type OperationPermissionChecker = (
  operation: OperationInvocationOperation,
  input: unknown,
) => Promise<OperationPermissionResult>;

export type CreateOperationInvocationDispatcherOptions = {
  resolveOperation: OperationInvocationResolver;
  invokeOperation: OperationInvocationExecutor;
  checkPermission: OperationPermissionChecker;
  reportError?: (error: unknown, request: OperationInvocationRequest) => void;
};

const normalizeOperationInput = (
  operation: OperationInvocationOperation,
  input: unknown,
): unknown => {
  const operationInput = input === undefined ? {} : input;
  return typeof operationInput === 'object' &&
    operationInput !== null &&
    !Array.isArray(operationInput)
    ? normalizeEntityRefInput(operationInput, operation.inputRefs)
    : operationInput;
};

const unknownOperationResponse = (
  request: OperationInvocationRequest,
): OperationInvocationProtocolResponse => {
  const message = `Unknown operation "${request.operationId}".`;

  return request.kind === 'check-permission'
    ? {
        kind: 'permission-result',
        result: {
          allowed: false,
          reason: 'unknown_operation',
          message,
        },
      }
    : {
        kind: 'invocation-result',
        result: operationRejected('unknown_operation', message),
      };
};

const invalidInputResponse = (
  request: OperationInvocationRequest,
  issues: ReturnType<typeof toOperationValidationIssues>,
): OperationInvocationProtocolResponse =>
  request.kind === 'check-permission'
    ? {
        kind: 'permission-result',
        result: {
          allowed: false,
          reason: 'input_invalid',
          message: 'Input does not match the operation schema.',
          issues,
        },
      }
    : {
        kind: 'invocation-result',
        result: operationInputInvalid('Input does not match the operation schema.', issues),
      };

const invocationErrored = (message: string): OperationInvocationResult => ({
  ok: false,
  kind: 'errored',
  executed: 'unknown',
  message,
});

export const createOperationInvocationDispatcher =
  ({
    resolveOperation,
    invokeOperation,
    checkPermission,
    reportError,
  }: CreateOperationInvocationDispatcherOptions): OperationInvocationDispatcher =>
  async request => {
    let operation: OperationInvocationOperation | undefined;

    try {
      operation = resolveOperation(request.operationId);
    } catch (error) {
      reportError?.(error, request);

      return operationInvocationProtocolError(
        'invocation_unavailable',
        'Operation invocation is temporarily unavailable.',
      );
    }

    if (!operation) {
      return unknownOperationResponse(request);
    }

    let validatedInput;

    try {
      const normalizedInput = normalizeOperationInput(operation, request.input);
      validatedInput = safeParseUnknownGraphSchema(operation.input, normalizedInput);
    } catch (error) {
      reportError?.(error, request);

      return operationInvocationProtocolError(
        'invocation_unavailable',
        'Operation input validation is temporarily unavailable.',
      );
    }

    if (!validatedInput.success) {
      return invalidInputResponse(
        request,
        toOperationValidationIssues({ issues: validatedInput.issues }),
      );
    }

    if (request.kind === 'check-permission') {
      try {
        return {
          kind: 'permission-result',
          result: await checkPermission(operation, validatedInput.data),
        };
      } catch (error) {
        reportError?.(error, request);

        return operationInvocationProtocolError(
          'invocation_unavailable',
          'Operation permission check is temporarily unavailable.',
        );
      }
    }

    try {
      return {
        kind: 'invocation-result',
        result: await invokeOperation(operation, validatedInput.data),
      };
    } catch (error) {
      reportError?.(error, request);

      return {
        kind: 'invocation-result',
        result: invocationErrored('Operation execution is temporarily unavailable.'),
      };
    }
  };
