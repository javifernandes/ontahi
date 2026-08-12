import type { Effect, Stream } from 'effect';

import type { QueryBuilder, QueryOrView, QuerySpec, ViewDefinition } from './query.js';
import type { RelatedRootReadSpec } from './relation-root.js';

type ReadParams<TRead> =
  TRead extends ViewDefinition<infer TParams, any, any>
    ? TParams
    : TRead extends QueryBuilder<any, any> | QuerySpec<any, any> | RelatedRootReadSpec
      ? undefined
      : never;

type ReadResult<TRead> =
  TRead extends ViewDefinition<any, any, infer TResult>
    ? TResult
    : TRead extends QueryBuilder<any, infer TResult>
      ? TResult
      : TRead extends QuerySpec<any, infer TResult>
        ? TResult
        : TRead extends RelatedRootReadSpec<any, any, any, any, any>
          ? NonNullable<TRead['__result']>
          : never;

type RuntimeArgs<TParams, TOptions> = [TParams] extends [undefined]
  ? [params?: TParams, options?: TOptions]
  : [params: TParams, options?: TOptions];

export type GraphReadExecutor<TError = never, TOptions = undefined> = {
  get<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): Effect.Effect<TResult | null, TError>;
  run<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): Effect.Effect<TResult[], TError>;
  count<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): Effect.Effect<number, TError>;
  stream<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): Stream.Stream<TResult, TError>;
};

export type BoundGraphRead<
  TRead extends QueryOrView<any, any>,
  TError = never,
  TOptions = undefined,
> = TRead & {
  exec: () => ExecutableGraphRead<TRead, TError, TOptions>;
  get: (
    ...args: RuntimeArgs<ReadParams<TRead>, TOptions>
  ) => Effect.Effect<ReadResult<TRead> | null, TError>;
  run: (
    ...args: RuntimeArgs<ReadParams<TRead>, TOptions>
  ) => Effect.Effect<ReadResult<TRead>[], TError>;
  count: (...args: RuntimeArgs<ReadParams<TRead>, TOptions>) => Effect.Effect<number, TError>;
  stream: (
    ...args: RuntimeArgs<ReadParams<TRead>, TOptions>
  ) => Stream.Stream<ReadResult<TRead>, TError>;
  pipe: <TValue>(fn: (read: BoundGraphRead<TRead, TError, TOptions>) => TValue) => TValue;
};

export type ExecutableGraphRead<
  TRead extends QueryOrView<any, any>,
  TError = never,
  TOptions = undefined,
> = {
  get: (
    ...args: RuntimeArgs<ReadParams<TRead>, TOptions>
  ) => Effect.Effect<ReadResult<TRead> | null, TError>;
  run: (
    ...args: RuntimeArgs<ReadParams<TRead>, TOptions>
  ) => Effect.Effect<ReadResult<TRead>[], TError>;
  count: (...args: RuntimeArgs<ReadParams<TRead>, TOptions>) => Effect.Effect<number, TError>;
  stream: (
    ...args: RuntimeArgs<ReadParams<TRead>, TOptions>
  ) => Stream.Stream<ReadResult<TRead>, TError>;
  pipe: <TValue>(
    fn: (executable: ExecutableGraphRead<TRead, TError, TOptions>) => TValue,
  ) => TValue;
};

const toRuntimeArgs = <TParams, TOptions>(args: RuntimeArgs<TParams, TOptions>) => ({
  params: args[0] as TParams,
  options: args[1],
});

export const createExecutableGraphRead = <
  TRead extends QueryOrView<any, any>,
  TError = never,
  TOptions = undefined,
>(
  read: TRead,
  executor: GraphReadExecutor<TError, TOptions>,
): ExecutableGraphRead<TRead, TError, TOptions> => {
  const executable: ExecutableGraphRead<TRead, TError, TOptions> = {
    get: (...args: RuntimeArgs<ReadParams<TRead>, TOptions>) => {
      const { params, options } = toRuntimeArgs(args);
      return executor.get(read, params as ReadParams<TRead>, options);
    },
    run: (...args: RuntimeArgs<ReadParams<TRead>, TOptions>) => {
      const { params, options } = toRuntimeArgs(args);
      return executor.run(read, params as ReadParams<TRead>, options);
    },
    count: (...args: RuntimeArgs<ReadParams<TRead>, TOptions>) => {
      const { params, options } = toRuntimeArgs(args);
      return executor.count(read, params as ReadParams<TRead>, options);
    },
    stream: (...args: RuntimeArgs<ReadParams<TRead>, TOptions>) => {
      const { params, options } = toRuntimeArgs(args);
      return executor.stream(read, params as ReadParams<TRead>, options);
    },
    pipe: fn => fn(executable),
  };

  return executable;
};

export const bindGraphRead = <
  TRead extends QueryOrView<any, any>,
  TError = never,
  TOptions = undefined,
>(
  read: TRead,
  executor: GraphReadExecutor<TError, TOptions>,
): BoundGraphRead<TRead, TError, TOptions> => {
  const executable = createExecutableGraphRead(read, executor);
  let bound!: BoundGraphRead<TRead, TError, TOptions>;

  bound = Object.assign(read, {
    exec: () => executable,
    get: executable.get,
    run: executable.run,
    count: executable.count,
    stream: executable.stream,
    pipe: <TValue>(fn: (value: BoundGraphRead<TRead, TError, TOptions>) => TValue) => fn(bound),
  });

  return bound;
};
