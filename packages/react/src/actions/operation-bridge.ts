'use client';

import type { ClientDomainOperationDeclaration, QueryKeySegment } from '@ontahi/core/data-graph';
import { normalizeEntityRefQueryInput } from '@ontahi/core/data-graph';
import {
  attachActionRuntime,
  getActionErrorMessage,
  hasActionError,
  type ActionQueryKey,
} from '@ontahi/core/runtime/actions';
import type {
  OperationInvocationResult,
  TaskRunIdentity,
  TaskSnapshot,
} from '@ontahi/core/runtime/contracts';
import type { QueryKey, UseQueryResult } from '@tanstack/react-query';

import type { ActionResultLike, UseActionOptions, UseActionResult } from './use-action.js';

export type { OperationInvocationResult };

export type OperationBridgeActionResult<TData> = Omit<ActionResultLike, 'data'> & {
  data?: TData;
};

export type OperationBridgeAction<TInput, TData> = (
  input: TInput,
) => Promise<OperationBridgeActionResult<OperationInvocationResult<TData>>>;

export type OperationInvocationFailure<TFailure = unknown> = Exclude<
  OperationInvocationResult<unknown, TFailure>,
  { ok: true }
>;

export class OperationInvocationResultError<TFailure = unknown> extends Error {
  readonly name = 'OperationInvocationResultError';
  declare readonly cause?: unknown;

  constructor(readonly result: OperationInvocationFailure<TFailure>) {
    super(result.message);
    if (result.kind === 'failed') {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: result.failure,
      });
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      ...(this.cause === undefined ? {} : { cause: this.cause }),
      result: this.result,
    };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isOperationInvocationResult = <TData = unknown, TFailure = unknown>(
  value: unknown,
): value is OperationInvocationResult<TData, TFailure> =>
  isRecord(value) && typeof value.ok === 'boolean' && typeof value.kind === 'string';

export const operationBridgeErrored = (message: string): OperationInvocationResult => ({
  ok: false,
  kind: 'errored',
  executed: 'unknown',
  message,
});

export const toOperationInvocationResult = <TData>(
  result: OperationBridgeActionResult<OperationInvocationResult<TData>>,
): OperationInvocationResult<TData> => {
  if (hasActionError(result)) {
    return operationBridgeErrored(
      getActionErrorMessage(result),
    ) as OperationInvocationResult<TData>;
  }

  if (isOperationInvocationResult<TData>(result.data)) {
    return result.data;
  }

  if ('data' in result) {
    return {
      ok: true,
      kind: 'success',
      value: result.data as TData,
    };
  }

  return operationBridgeErrored(
    'Graph operation bridge returned an invalid response.',
  ) as OperationInvocationResult<TData>;
};

export const unwrapOperationInvocationValue = <TData>(
  result: OperationInvocationResult<TData>,
): TData => {
  if (result.ok) {
    return result.value;
  }

  throw new OperationInvocationResultError(result);
};

export type BridgedOperationLike<TInput, TData> = ClientDomainOperationDeclaration<
  TInput,
  TData
> & {
  id: string;
  entityName: string;
  name: string;
};

export type RunDomainOperationBridgeAction = (input: {
  operationId: string;
  input: unknown;
}) => Promise<ActionResultLike>;

export type GraphPermission =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
      message: string;
    };

export type CheckDomainOperationPermissionBridgeAction = (input: {
  operationId: string;
  input: unknown;
}) => Promise<OperationBridgeActionResult<GraphPermission>>;

export type OperationBridgeAdapter<TAdapterName extends string = string> = {
  name: TAdapterName;
  getTaskSnapshot?: <TResult = unknown>(ref: TaskRunIdentity) => Promise<TaskSnapshot<TResult>>;
  useBridgeAction: <TInput, TData>(
    operation: BridgedOperationLike<TInput, TData>,
  ) => OperationBridgeAction<TInput, TData>;
  useBridgeMutation: <TInput, TData>(
    operation: BridgedOperationLike<TInput, TData>,
    options?: UseActionOptions<OperationBridgeAction<TInput, TData>> & {
      invalidateOnSuccess?: boolean;
    },
  ) => UseActionResult<OperationBridgeAction<TInput, TData>>;
  useBridgeQuery: <TInput, TData>(
    operation: BridgedOperationLike<TInput, TData>,
    args: {
      input: TInput;
      key: QueryKey;
    },
  ) => UseQueryResult<TData, Error>;
  usePermission: <TInput, TData>(
    operation: BridgedOperationLike<TInput, TData>,
    input: TInput,
    options?: {
      enabled?: boolean;
      queryKey?: QueryKey;
    },
  ) => UseQueryResult<GraphPermission, Error>;
};

export type AnyOperationBridgeAdapter = OperationBridgeAdapter<string>;

export const resolveOperationBridgeQuerySpec = <TInput, TData>(
  operation: BridgedOperationLike<TInput, TData>,
) => [operation.entityName, operation.name, ...(operation.bridge?.query ?? [])] as const;

const resolveOperationBridgeQueryKeySegment = <TInput, TData>(
  segment: QueryKeySegment<TInput>,
  operation: BridgedOperationLike<TInput, TData>,
  input: TInput,
) =>
  typeof segment === 'function'
    ? segment(input, {
        input,
        operation,
      })
    : segment;

export const resolveOperationBridgeQueryKey = <TInput, TData>(
  operation: BridgedOperationLike<TInput, TData>,
  input: TInput,
): ActionQueryKey => {
  const queryInput = normalizeEntityRefQueryInput(input, operation.inputRefs);

  return [
    operation.entityName,
    operation.name,
    ...(operation.bridge?.query?.map(segment =>
      resolveOperationBridgeQueryKeySegment(segment, operation, queryInput),
    ) ?? []),
  ];
};

export const resolveOperationBridgeInvalidationQueryKeys = <TInput, TData>(
  operation: BridgedOperationLike<TInput, TData>,
  input: TInput,
): ActionQueryKey[] => {
  const queryInput = normalizeEntityRefQueryInput(input, operation.inputRefs);

  return (
    operation.bridge?.invalidate?.map(querySpec =>
      querySpec.map(segment =>
        resolveOperationBridgeQueryKeySegment(segment, operation, queryInput),
      ),
    ) ?? []
  );
};

export const createDomainOperationBridgeAction =
  <TInput, TData>(
    bridgeAction: RunDomainOperationBridgeAction,
    operationId: string,
  ): OperationBridgeAction<TInput, TData> =>
  (input: TInput) =>
    bridgeAction({
      operationId,
      input,
    }) as Promise<OperationBridgeActionResult<OperationInvocationResult<TData>>>;

export const attachOperationBridgeActionRuntime = <TInput, TData>(
  operation: BridgedOperationLike<TInput, TData>,
  action: OperationBridgeAction<TInput, TData>,
  options: {
    requiresAuth: boolean;
  },
) =>
  attachActionRuntime(action, {
    feature: operation.entityName,
    actionName: operation.name,
    requiresAuth: options.requiresAuth,
    queryKeyPrefix: [operation.entityName, operation.name] as const,
    getQueryKey: input => resolveOperationBridgeQueryKey(operation, input as TInput),
    getAffectedQueryKeys: ({ input }) =>
      resolveOperationBridgeInvalidationQueryKeys(operation, input as TInput),
  });
