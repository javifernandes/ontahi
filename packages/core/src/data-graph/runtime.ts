import type { GraphCommandSpec } from './command.js';
import type { QueryOrView } from './query.js';

export interface DataGraphRuntime<TError = never, TOptions = undefined> {
  get<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): import('effect').Effect.Effect<TResult | null, TError>;
  run<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): import('effect').Effect.Effect<TResult[], TError>;
  stream<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): import('effect').Stream.Stream<TResult, TError>;
}

export interface DataGraphExecutionRuntime<
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
> extends DataGraphRuntime<TError, TReadOptions> {
  count<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): import('effect').Effect.Effect<number, TError>;
  runCommand<TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TCommandOptions,
  ): import('effect').Effect.Effect<TResult, TError>;
}
