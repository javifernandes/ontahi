import { AsyncLocalStorage } from 'node:async_hooks';

import { isPlainObject } from '@ontahi/core/value/object';

import {
  createContextResourceApi,
  getOrCreateContextResource,
  type ServerContextResourceApi,
} from './context-resources.js';
import type { OperationRuntimeContext } from './context-types.js';

export const operationRuntimeContextStorage = new AsyncLocalStorage<OperationRuntimeContext>();

export const getOperationRuntimeContext = (): OperationRuntimeContext | undefined =>
  operationRuntimeContextStorage.getStore();

export const getRequiredOperationRuntimeContext = (): OperationRuntimeContext => {
  const context = getOperationRuntimeContext();

  if (!context) {
    throw new Error('Operation runtime context is not available');
  }

  return context;
};

export const getOrCreateServerContextResource = <TValue>(
  key: string,
  factory: () => Promise<TValue> | TValue,
): Promise<TValue> =>
  getOrCreateContextResource(getRequiredOperationRuntimeContext().resources, key, factory);

export const memoizeInServerContext =
  <TInput, TOutput>(options: {
    namespace: string;
    key: (input: TInput) => string;
    run: (input: TInput) => Promise<TOutput> | TOutput;
  }) =>
  (input: TInput): Promise<TOutput> =>
    getOrCreateServerContextResource(`${options.namespace}:${options.key(input)}`, () =>
      options.run(input),
    );

export const getServerContextResources = (): ServerContextResourceApi =>
  createContextResourceApi(getRequiredOperationRuntimeContext().resources);

export const serverContext = {
  current: getOperationRuntimeContext,
  currentOperation: getOperationRuntimeContext,
  required: getRequiredOperationRuntimeContext,
  requiredOperation: getRequiredOperationRuntimeContext,
  run: <TValue>(context: OperationRuntimeContext, fn: () => TValue): TValue =>
    operationRuntimeContextStorage.run(context, fn),
  resources: {
    api: getServerContextResources,
    getOrCreate: getOrCreateServerContextResource,
    memoize: memoizeInServerContext,
  },
};

export const toContextRecord = (value: object | undefined): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  return { ...(value as Record<string, unknown>) };
};

export const deriveArgsInputRecord = (
  args: readonly unknown[],
): Record<string, unknown> | undefined => {
  if (args.length === 0) {
    return undefined;
  }

  if (args.length === 1 && isPlainObject(args[0])) {
    return { ...(args[0] as Record<string, unknown>) };
  }

  return { args: [...args] };
};
