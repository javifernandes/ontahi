'use client';

import type {
  ReflectedOperationInvocation,
  ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';
import { resolveOperationExecutionAffordance } from '@ontahi/core/data-graph';
import type {
  OperationInvocationResult,
  TaskRunIdentity,
  TaskSnapshot,
} from '@ontahi/core/runtime/contracts';
import {
  isOperationInvocationProtocolResponse,
  type OperationInvocationRequest,
} from '@ontahi/core/runtime/operation-invocation';
import { useMemo } from 'react';

import {
  attachOperationBridgeActionRuntime,
  toOperationInvocationResult,
  unwrapOperationInvocationValue,
} from './operation-bridge.js';
import type * as OperationBridge from './operation-bridge.js';
import { useServerMutation, useServerQuery } from './react-query.js';
import type { ActionResultLike } from './use-action.js';

export type FetchOperationBridgeOptions = {
  mountPath?: string;
  endpoint?: string;
  taskEndpoint?: string;
};

const DEFAULT_ENDPOINT = '/api/data-graph/domain-operations';

const normalizeMountPath = (value: string) => {
  const path = value.startsWith('/') ? value : `/${value}`;
  return path === '/' ? '' : path.replace(/\/+$/, '');
};

const mountedEndpoint = (mountPath: string, endpoint: string) =>
  `${normalizeMountPath(mountPath)}/${endpoint}`;

const operationEndpoint = (options: FetchOperationBridgeOptions) =>
  options.endpoint ??
  (options.mountPath ? mountedEndpoint(options.mountPath, 'operations') : DEFAULT_ENDPOINT);

const operationTaskEndpoint = (options: FetchOperationBridgeOptions) =>
  options.taskEndpoint ??
  (options.mountPath ? mountedEndpoint(options.mountPath, 'operations/tasks') : undefined);

const fetchTaskSnapshot = async <TResult>(
  endpoint: string,
  ref: TaskRunIdentity,
): Promise<TaskSnapshot<TResult>> => {
  const response = await fetch(
    `${endpoint}/${encodeURIComponent(ref.taskId)}/${encodeURIComponent(ref.runId)}`,
    { credentials: 'same-origin' },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok || typeof payload !== 'object' || payload === null) {
    throw new Error(`Task snapshot request failed with status ${response.status}.`);
  }

  return payload as TaskSnapshot<TResult>;
};

const attachFetchBridgeRuntime = <TInput, TData>(
  operation: OperationBridge.BridgedOperationLike<TInput, TData>,
  action: OperationBridge.OperationBridgeAction<TInput, TData>,
) =>
  attachOperationBridgeActionRuntime(operation, action, {
    requiresAuth: operation.authority !== 'server' ? false : operation.exposure !== 'bridge',
  });

const postBridgeRequest = async <TData>(
  endpoint: string,
  request: OperationInvocationRequest,
): Promise<ActionResultLike & { data?: TData }> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!isOperationInvocationProtocolResponse(payload)) {
    return {
      serverError: response.ok
        ? 'Graph bridge returned an invalid response.'
        : `Graph bridge request failed with status ${response.status}.`,
    };
  }

  if (payload.kind === 'protocol-error') {
    return { serverError: payload.error.message };
  }

  if (request.kind === 'invoke' && payload.kind === 'invocation-result') {
    return { data: payload.result as TData };
  }

  if (request.kind === 'check-permission' && payload.kind === 'permission-result') {
    return { data: payload.result as TData };
  }

  return { serverError: 'Graph bridge returned an invalid response.' };
};

const createFetchBridgeAction = <TInput, TData>(
  endpoint: string,
  operation: OperationBridge.BridgedOperationLike<TInput, TData>,
): OperationBridge.OperationBridgeAction<TInput, TData> =>
  attachFetchBridgeRuntime(operation, (input: TInput) =>
    postBridgeRequest<OperationInvocationResult<TData>>(endpoint, {
      kind: 'invoke',
      operationId: operation.id,
      input,
      ...(operation.view ? { view: operation.view } : {}),
    }),
  ) as OperationBridge.OperationBridgeAction<TInput, TData>;

const createFetchPermissionAction =
  <TInput, TData>(
    endpoint: string,
    operation: OperationBridge.BridgedOperationLike<TInput, TData>,
  ): ((
    input: TInput,
  ) => Promise<OperationBridge.OperationBridgeActionResult<OperationBridge.GraphPermission>>) =>
  (input: TInput) =>
    postBridgeRequest<OperationBridge.GraphPermission>(endpoint, {
      kind: 'check-permission',
      operationId: operation.id,
      input,
    });

export const createFetchReflectedOperationInvoker = (
  options: FetchOperationBridgeOptions = {},
): ReflectedOperationInvoker => {
  const endpoint = operationEndpoint(options);
  const canInvokeOperation: NonNullable<
    ReflectedOperationInvoker['canInvokeOperation']
  > = operation =>
    operation.kind === undefined
      ? operation.exposure === undefined || operation.exposure === 'bridge'
      : operation.kind !== 'graph' && operation.exposure === 'bridge';

  return {
    canInvokeOperation,
    getOperationExecutionAffordance: operation =>
      resolveOperationExecutionAffordance(operation, {
        ...(canInvokeOperation(operation)
          ? {
              bridge: {
                authority: operation.authority ?? 'server',
                bridge: 'fetch',
              },
            }
          : {}),
      }),
    invokeOperation: async <TInput = unknown, TData = unknown>({
      input,
      operationId,
      view,
    }: ReflectedOperationInvocation<TInput>) =>
      toOperationInvocationResult<TData>(
        await postBridgeRequest<OperationInvocationResult<TData>>(endpoint, {
          kind: 'invoke',
          operationId,
          input,
          ...(view ? { view } : {}),
        }),
      ),
  };
};

export const createFetchOperationBridgeAdapter = (
  options: FetchOperationBridgeOptions = {},
): OperationBridge.AnyOperationBridgeAdapter => {
  const endpoint = operationEndpoint(options);
  const taskEndpoint = operationTaskEndpoint(options);
  const buildRuntimeAction = <TInput, TData>(
    operation: OperationBridge.BridgedOperationLike<TInput, TData>,
  ) => createFetchBridgeAction(endpoint, operation);

  return {
    name: 'fetch',
    ...(taskEndpoint
      ? {
          getTaskSnapshot: (ref: TaskRunIdentity) => fetchTaskSnapshot(taskEndpoint, ref),
        }
      : {}),
    useBridgeAction: operation =>
      useMemo(
        () => buildRuntimeAction(operation) as OperationBridge.OperationBridgeAction<any, any>,
        [operation],
      ) as OperationBridge.OperationBridgeAction<any, any>,
    useBridgeMutation: (operation, options) => {
      const action = useMemo(() => buildRuntimeAction(operation), [operation]);

      return useServerMutation(
        action as OperationBridge.OperationBridgeAction<unknown, unknown>,
        options as Parameters<
          typeof useServerMutation<OperationBridge.OperationBridgeAction<unknown, unknown>>
        >[1],
      ) as ReturnType<typeof useServerMutation<OperationBridge.OperationBridgeAction<any, any>>>;
    },
    useBridgeQuery: (operation, args) => {
      const action = useMemo(() => buildRuntimeAction(operation), [operation]);

      return useServerQuery({
        action: action as OperationBridge.OperationBridgeAction<unknown, unknown>,
        input: args.input as unknown,
        key: args.key,
        select: unwrapOperationInvocationValue,
      }) as any;
    },
    usePermission: (operation, input, args) =>
      useServerQuery({
        enabled: args?.enabled,
        action: createFetchPermissionAction(endpoint, operation),
        input,
        key: args?.queryKey ?? ['graph-permission', operation.id, input],
      }),
  };
};
