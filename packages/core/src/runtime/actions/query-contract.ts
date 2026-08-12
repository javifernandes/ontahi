import { isRecord } from '@ontahi/core/value/object';

export type ActionQueryKey = readonly unknown[];
export type ActionQuerySpecSegment<TInput = unknown> = unknown | ((input: TInput) => unknown);
export type ActionQuerySpec<TInput = unknown> = unknown | readonly ActionQuerySpecSegment<TInput>[];

type AsyncAction = (...args: any[]) => Promise<unknown>;

export interface FeatureAllQueryTarget {
  kind: 'feature-all';
  feature: string;
  queryKeyPrefix: ActionQueryKey;
}

export interface ActionRuntimeMetadata<TInput = unknown, TData = unknown> {
  feature: string;
  actionName: string;
  requiresAuth: boolean;
  queryKeyPrefix: ActionQueryKey;
  querySpec?: ActionQuerySpec<TInput>;
  invalidationQueryKeyPrefix?: ActionQueryKey;
  getQueryKey?: (input: TInput) => ActionQueryKey;
  getAffectedQueryKeys?: (args: { input: TInput; data: TData }) => ActionQueryKey[];
}

export type ActionWithRuntime<TInput = unknown, TResult = unknown, TData = unknown> = ((
  input: TInput,
) => Promise<TResult>) & {
  __actionRuntime?: ActionRuntimeMetadata<TInput, TData>;
};

export type ActionInvalidationTarget =
  | ActionWithRuntime<any, any, any>
  | FeatureAllQueryTarget
  | ActionQueryKey;

export const createFeatureAllQueryTarget = (feature: string): FeatureAllQueryTarget =>
  Object.freeze({
    kind: 'feature-all' as const,
    feature,
    queryKeyPrefix: [feature] as const,
  });

export const attachActionRuntime = <
  TInput,
  TData = unknown,
  TAction extends AsyncAction = AsyncAction,
>(
  action: TAction,
  runtime: ActionRuntimeMetadata<TInput, TData>,
): ((input: TInput) => ReturnType<TAction>) & {
  __actionRuntime: ActionRuntimeMetadata<TInput, TData>;
} => {
  Object.defineProperty(action, '__actionRuntime', {
    configurable: true,
    enumerable: false,
    value: runtime,
    writable: false,
  });

  return action as unknown as ((input: TInput) => ReturnType<TAction>) & {
    __actionRuntime: ActionRuntimeMetadata<TInput, TData>;
  };
};

export const getActionRuntime = <TInput = unknown, TData = unknown>(action: unknown) => {
  if (typeof action !== 'function') {
    return undefined;
  }

  const runtime = (action as ActionWithRuntime<TInput, unknown, TData>).__actionRuntime;
  return isRecord(runtime) ? (runtime as ActionRuntimeMetadata<TInput, TData>) : undefined;
};

export const resolveActionQuerySpec = <TInput>(
  spec: ActionQuerySpec<TInput>,
  input: TInput,
): ActionQueryKey =>
  Array.isArray(spec)
    ? (spec.map(segment =>
        typeof segment === 'function' ? (segment as (input: TInput) => unknown)(input) : segment,
      ) as ActionQueryKey)
    : ([spec] as const);

const ensureActionQueryKey = (value: unknown, context: string): ActionQueryKey => {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must resolve to an array query key.`);
  }

  return value as ActionQueryKey;
};

export const getActionQueryKeyPrefixFromSpec = <TInput>(
  spec: ActionQuerySpec<TInput>,
): ActionQueryKey | undefined => {
  if (!Array.isArray(spec)) {
    return [spec] as const;
  }

  const prefix: unknown[] = [];
  for (const segment of spec) {
    if (typeof segment === 'function') {
      break;
    }

    prefix.push(segment);
  }

  return prefix.length > 0 ? (prefix as ActionQueryKey) : undefined;
};

export const getActionQueryKey = <TInput = unknown>(
  action: unknown,
  input: TInput,
): ActionQueryKey | undefined => {
  const runtime = getActionRuntime<TInput>(action);

  if (!runtime) {
    return undefined;
  }

  if (runtime.querySpec !== undefined) {
    return resolveActionQuerySpec(runtime.querySpec, input);
  }

  if (runtime.getQueryKey) {
    return ensureActionQueryKey(
      runtime.getQueryKey(input),
      `${runtime.feature}.${runtime.actionName} getQueryKey`,
    );
  }

  return typeof input === 'undefined'
    ? runtime.queryKeyPrefix
    : ([...runtime.queryKeyPrefix, input] as const);
};

export const getActionInvalidationQueryKeyPrefix = (
  action: unknown,
): ActionQueryKey | undefined => {
  const runtime = getActionRuntime(action);
  return runtime?.invalidationQueryKeyPrefix ?? runtime?.queryKeyPrefix;
};

const isFeatureAllQueryTarget = (target: unknown): target is FeatureAllQueryTarget =>
  isRecord(target) &&
  target.kind === 'feature-all' &&
  typeof target.feature === 'string' &&
  Array.isArray(target.queryKeyPrefix);

export const resolveInvalidationTarget = (target: ActionInvalidationTarget): ActionQueryKey[] => {
  if (Array.isArray(target)) {
    return [target];
  }

  if (isFeatureAllQueryTarget(target)) {
    return [target.queryKeyPrefix];
  }

  const queryKeyPrefix = getActionInvalidationQueryKeyPrefix(target);
  return queryKeyPrefix ? [queryKeyPrefix] : [];
};

export const getActionInvalidationQueryKeys = <TInput = unknown, TData = unknown>(
  action: unknown,
  args: {
    input: TInput;
    data: TData;
  },
) => {
  const runtime = getActionRuntime<TInput, TData>(action);
  return runtime?.getAffectedQueryKeys?.(args) ?? [];
};
