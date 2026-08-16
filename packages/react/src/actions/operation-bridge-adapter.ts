'use client';

import type { TaskRunIdentity, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import { useMemo } from 'react';

import {
  attachOperationBridgeActionRuntime,
  createDomainOperationBridgeAction,
  unwrapOperationInvocationValue,
  type AnyOperationBridgeAdapter,
  type BridgedOperationLike,
  type CheckDomainOperationPermissionBridgeAction,
  type OperationBridgeAction,
  type RunDomainOperationBridgeAction,
} from './operation-bridge.js';
import { useServerMutation, useServerQuery } from './react-query.js';

const attachNextActionBridgeRuntime = <TInput, TData>(
  operation: BridgedOperationLike<TInput, TData>,
  action: OperationBridgeAction<TInput, TData>,
) =>
  attachOperationBridgeActionRuntime(operation, action, {
    requiresAuth: operation.authority !== 'server' ? false : operation.exposure !== 'bridge',
  });

const createRuntimeBridgeAction = <TInput, TData>(
  bridgeAction: RunDomainOperationBridgeAction,
  operation: BridgedOperationLike<TInput, TData>,
): OperationBridgeAction<TInput, TData> =>
  attachNextActionBridgeRuntime(
    operation,
    createDomainOperationBridgeAction(bridgeAction, operation) as OperationBridgeAction<
      TInput,
      TData
    >,
  ) as OperationBridgeAction<TInput, TData>;

export const createNextActionOperationBridgeAdapter = (
  bridgeAction: RunDomainOperationBridgeAction,
  options?: {
    checkPermissionAction?: CheckDomainOperationPermissionBridgeAction;
    getTaskSnapshot?: <TResult = unknown>(ref: TaskRunIdentity) => Promise<TaskSnapshot<TResult>>;
  },
): AnyOperationBridgeAdapter => {
  const buildRuntimeAction = <TInput, TData>(operation: BridgedOperationLike<TInput, TData>) =>
    createRuntimeBridgeAction(bridgeAction, operation);

  return {
    name: 'next-action',
    getTaskSnapshot: options?.getTaskSnapshot,
    useBridgeAction: operation =>
      useMemo(
        () => buildRuntimeAction(operation) as OperationBridgeAction<any, any>,
        [operation],
      ) as OperationBridgeAction<any, any>,
    useBridgeMutation: (operation, options) => {
      const action = useMemo(() => buildRuntimeAction(operation), [operation]);

      return useServerMutation(
        action as OperationBridgeAction<unknown, unknown>,
        options as Parameters<typeof useServerMutation<OperationBridgeAction<unknown, unknown>>>[1],
      ) as ReturnType<typeof useServerMutation<OperationBridgeAction<any, any>>>;
    },
    useBridgeQuery: (operation, args) => {
      const action = useMemo(() => buildRuntimeAction(operation), [operation]);

      return useServerQuery({
        action: action as OperationBridgeAction<unknown, unknown>,
        input: args.input as unknown,
        key: args.key,
        select: unwrapOperationInvocationValue,
      }) as any;
    },
    usePermission: (operation, input, args) =>
      useServerQuery({
        enabled: args?.enabled,
        action: async (_input: undefined) => {
          if (!options?.checkPermissionAction) {
            throw new Error('No operation permission bridge action registered.');
          }

          return options.checkPermissionAction({
            operationId: operation.id,
            input,
          });
        },
        input: undefined,
        key: args?.queryKey ?? ['graph-permission', operation.id, input],
      }),
  };
};
