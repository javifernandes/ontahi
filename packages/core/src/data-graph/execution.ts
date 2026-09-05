import { Effect, Stream } from 'effect';

import type { GraphCommandSpec } from './command.js';
import type { QueryOrView } from './query.js';
import type { DataGraphExecutionRuntime, DataGraphObservationRuntime } from './runtime.js';

export const createDataGraphExecutor = <
  TReadError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TReadError,
>(
  getRuntime: () => DataGraphExecutionRuntime<
    TReadError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >,
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
  observeViewStream: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) =>
    Stream.suspend(() => {
      const runtime = getRuntime() as DataGraphExecutionRuntime<
        TReadError,
        TReadOptions,
        TCommandOptions,
        TCommandError
      > &
        Partial<DataGraphObservationRuntime<TReadError, TReadOptions>>;

      return typeof runtime.observe === 'function'
        ? runtime.observe(queryOrView, params, options)
        : Stream.die(
            new TypeError('The current Data Graph runtime does not support Query observation.'),
          );
    }),
  runCommandEffect: <TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TCommandOptions,
  ) => Effect.suspend(() => getRuntime().runCommand(command, options)),
});

export type DataGraphExecutor<
  TReadError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TReadError,
> = ReturnType<
  typeof createDataGraphExecutor<TReadError, TReadOptions, TCommandOptions, TCommandError>
>;
