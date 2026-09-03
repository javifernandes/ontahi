'use client';

import type {
  ReflectedOperationInvocation,
  ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';
import { resolveOperationExecutionAffordance } from '@ontahi/core/data-graph';
import type { OperationInvocationResult } from '@ontahi/core/runtime/contracts';
import {
  isOperationInvocationProtocolResponse,
  type OperationInvocationRequest,
} from '@ontahi/core/runtime/operation-invocation';
import {
  createRuntimeProtocolExchange,
  toOperationProtocolRequest,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { useMemo } from 'react';

import { createFetchRuntimeTransport } from '../graph/fetch-runtime-transport.js';

import {
  attachOperationBridgeActionRuntime,
  toOperationInvocationResult,
  unwrapOperationInvocationValue,
} from './operation-bridge.js';
import type * as OperationBridge from './operation-bridge.js';
import { useServerMutation, useServerQuery } from './react-query.js';
import type { ActionResultLike } from './use-action.js';

export type FetchOperationBridgeOptions<TTransportOptions = undefined> = {
  /** @deprecated Select the legacy Operation route through createFetchGraphClient compatibility. */
  mountPath?: string;
  /** @deprecated Select the legacy Operation route through createFetchGraphClient compatibility. */
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  requestInit?: (options?: TTransportOptions) => Omit<RequestInit, 'body' | 'method'>;
  runtimeTransport?: RuntimeTransport<TTransportOptions>;
  requestId?: () => string;
};

const normalizeMountPath = (value: string) => {
  const path = value.startsWith('/') ? value : `/${value}`;
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) end -= 1;
  return path.slice(0, end);
};

const mountedEndpoint = (mountPath: string, endpoint: string) =>
  `${normalizeMountPath(mountPath)}/${endpoint}`;

const operationEndpoint = <TTransportOptions>(
  options: FetchOperationBridgeOptions<TTransportOptions>,
) =>
  options.endpoint ??
  (options.mountPath ? mountedEndpoint(options.mountPath, 'operations') : undefined);

const attachFetchBridgeRuntime = <TInput, TData>(
  operation: OperationBridge.BridgedOperationLike<TInput, TData>,
  action: OperationBridge.OperationBridgeAction<TInput, TData>,
) =>
  attachOperationBridgeActionRuntime(operation, action, {
    requiresAuth: operation.authority !== 'server' ? false : operation.exposure !== 'bridge',
  });

type OperationRequest = (request: OperationInvocationRequest) => Promise<unknown>;

const postLegacyBridgeRequest = async <TTransportOptions>(
  endpoint: string,
  request: OperationInvocationRequest,
  fetchRequest: typeof globalThis.fetch,
  requestInit: ((options?: TTransportOptions) => Omit<RequestInit, 'body' | 'method'>) | undefined,
): Promise<unknown> => {
  const init = requestInit?.() ?? {};
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetchRequest(endpoint, {
    ...init,
    method: 'POST',
    headers,
    credentials: init.credentials ?? 'same-origin',
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok && !isOperationInvocationProtocolResponse(payload)) {
    throw new Error(`Graph bridge request failed with status ${response.status}.`);
  }
  return payload;
};

const createOperationRequest = <TTransportOptions>(
  options: FetchOperationBridgeOptions<TTransportOptions>,
): OperationRequest => {
  const endpoint = operationEndpoint(options);
  if (endpoint) {
    return request =>
      postLegacyBridgeRequest(
        endpoint,
        request,
        options.fetch ?? globalThis.fetch,
        options.requestInit,
      );
  }

  const exchange = createRuntimeProtocolExchange({
    transport:
      options.runtimeTransport ??
      createFetchRuntimeTransport<TTransportOptions>({
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.requestInit ? { requestInit: options.requestInit } : {}),
      }),
    requestId: options.requestId,
  });
  return request =>
    exchange({
      family: 'operation',
      body: toOperationProtocolRequest(request),
    });
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Graph bridge request failed.';

const postBridgeRequest = async <TData>(
  requestOperation: OperationRequest,
  request: OperationInvocationRequest,
): Promise<ActionResultLike & { data?: TData }> => {
  let payload: unknown;
  try {
    payload = await requestOperation(request);
  } catch (error) {
    return { serverError: errorMessage(error) };
  }

  if (!isOperationInvocationProtocolResponse(payload)) {
    return { serverError: 'Graph bridge returned an invalid response.' };
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
  requestOperation: OperationRequest,
  operation: OperationBridge.BridgedOperationLike<TInput, TData>,
): OperationBridge.OperationBridgeAction<TInput, TData> =>
  attachFetchBridgeRuntime(operation, (input: TInput) =>
    postBridgeRequest<OperationInvocationResult<TData>>(requestOperation, {
      kind: 'invoke',
      operationId: operation.id,
      input,
      ...(operation.view ? { view: operation.view } : {}),
    }),
  ) as OperationBridge.OperationBridgeAction<TInput, TData>;

const createFetchPermissionAction =
  <TInput, TData>(
    requestOperation: OperationRequest,
    operation: OperationBridge.BridgedOperationLike<TInput, TData>,
  ): ((
    input: TInput,
  ) => Promise<OperationBridge.OperationBridgeActionResult<OperationBridge.GraphPermission>>) =>
  (input: TInput) =>
    postBridgeRequest<OperationBridge.GraphPermission>(requestOperation, {
      kind: 'check-permission',
      operationId: operation.id,
      input,
    });

export const createFetchReflectedOperationInvoker = <TTransportOptions = undefined>(
  options: FetchOperationBridgeOptions<TTransportOptions> = {},
): ReflectedOperationInvoker => {
  const requestOperation = createOperationRequest(options);
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
        await postBridgeRequest<OperationInvocationResult<TData>>(requestOperation, {
          kind: 'invoke',
          operationId,
          input,
          ...(view ? { view } : {}),
        }),
      ),
  };
};

export const createFetchOperationBridgeAdapter = <TTransportOptions = undefined>(
  options: FetchOperationBridgeOptions<TTransportOptions> = {},
): OperationBridge.AnyOperationBridgeAdapter => {
  const requestOperation = createOperationRequest(options);
  const buildRuntimeAction = <TInput, TData>(
    operation: OperationBridge.BridgedOperationLike<TInput, TData>,
  ) => createFetchBridgeAction(requestOperation, operation);

  return {
    name: 'fetch',
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
        action: createFetchPermissionAction(requestOperation, operation),
        input,
        key: args?.queryKey ?? ['graph-permission', operation.id, input],
      }),
  };
};
