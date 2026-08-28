'use client';

import {
  resolveOperationExecutionAffordance,
  safeParseUnknownGraphSchema,
  type GraphOperationDeclaration,
  type ReflectedOperationInvocation,
  type ReflectedOperationInvoker,
} from '@ontahi/core/data-graph';
import {
  operationInputInvalid,
  operationRejected,
  toOperationValidationIssues,
  type OperationInvocationResult,
} from '@ontahi/core/runtime/contracts';

import type { CommandLike, ReactGraphExecutor } from './executor.js';

export type ReflectedGraphOperationLike = GraphOperationDeclaration<any, CommandLike<any>> & {
  id: string;
};

export type CreateReflectedOperationInvokerOptions = {
  graphExecutor?: ReactGraphExecutor<any, any>;
  graphOperations?: readonly ReflectedGraphOperationLike[];
  fallback?: ReflectedOperationInvoker;
};

const resolveGraphCommand = (command: CommandLike<unknown>) =>
  'build' in command ? command.build() : command;

const invocationErrored = (error: unknown): OperationInvocationResult => ({
  ok: false,
  kind: 'errored',
  executed: 'unknown',
  message: error instanceof Error ? error.message : 'Graph operation execution failed.',
  ...(error instanceof Error ? { errorType: error.name } : {}),
});

export const createReflectedOperationInvoker = ({
  fallback,
  graphExecutor,
  graphOperations = [],
}: CreateReflectedOperationInvokerOptions): ReflectedOperationInvoker => {
  const graphOperationsById = new Map(graphOperations.map(operation => [operation.id, operation]));

  return {
    canInvokeOperation: operation =>
      (Boolean(graphExecutor) && graphOperationsById.has(operation.id)) ||
      Boolean(fallback && (fallback.canInvokeOperation?.(operation) ?? true)),
    getOperationExecutionAffordance: operation => {
      const fallbackAffordance = fallback?.getOperationExecutionAffordance?.(operation);

      if (Boolean(graphExecutor) && graphOperationsById.has(operation.id)) {
        return resolveOperationExecutionAffordance(operation, {
          local: {
            runtime: 'browser-data-graph',
            capabilities: [],
          },
          ...(fallbackAffordance?.status === 'bridge'
            ? {
                bridge: {
                  authority: fallbackAffordance.authority,
                  bridge: fallbackAffordance.bridge,
                },
              }
            : {}),
        });
      }

      if (fallbackAffordance) return fallbackAffordance;
      if (fallback && (fallback.canInvokeOperation?.(operation) ?? true)) return undefined;
      return resolveOperationExecutionAffordance(operation, {});
    },
    invokeOperation: async <TInput = unknown, TData = unknown>(
      invocation: ReflectedOperationInvocation<TInput>,
    ): Promise<OperationInvocationResult<TData>> => {
      const { input, operation, operationId } = invocation;
      const graphOperation = graphOperationsById.get(operationId);

      if (!graphOperation || !graphExecutor) {
        if (fallback) {
          return fallback.invokeOperation<TInput, TData>(invocation);
        }

        return operationRejected(
          'operation_not_available',
          `No reflected runtime can execute ${operationId}.`,
        );
      }

      try {
        const parsedInput = graphOperation.input
          ? safeParseUnknownGraphSchema(graphOperation.input, input)
          : { success: true as const, data: input };

        if (!parsedInput.success) {
          return operationInputInvalid(
            'Operation input does not match its declared schema.',
            toOperationValidationIssues({ issues: parsedInput.issues }),
          );
        }

        const value = await graphExecutor.runCommand(
          resolveGraphCommand(graphOperation.run(parsedInput.data as never)),
        );

        return { ok: true, kind: 'success', value: value as TData };
      } catch (error) {
        return invocationErrored(error) as OperationInvocationResult<TData>;
      }
    },
  };
};
