import { Effect, Stream } from 'effect';

import type { GraphCommandSpec } from './command.js';
import type { QueryOrView } from './query.js';
import type { DataGraphExecutionRuntime } from './runtime.js';

export const createDataGraphExecutor = <
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
>(
  getRuntime: () => DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions>,
) => ({
  getViewEffect: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Effect.suspend(() => getRuntime().get(queryOrView, params, options)),
  runViewEffect: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Effect.suspend(() => getRuntime().run(queryOrView, params, options)),
  countViewEffect: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Effect.suspend(() => getRuntime().count(queryOrView, params, options)),
  streamViewEffect: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => Stream.unwrap(Effect.sync(() => getRuntime().stream(queryOrView, params, options))),
  runCommandEffect: <TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TCommandOptions,
  ) => Effect.suspend(() => getRuntime().runCommand(command, options)),
});

export type DataGraphExecutor<
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
> = ReturnType<typeof createDataGraphExecutor<TError, TReadOptions, TCommandOptions>>;
