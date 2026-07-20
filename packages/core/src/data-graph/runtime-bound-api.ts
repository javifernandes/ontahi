import type { BoundGraphRead, ExecutableGraphRead, GraphReadExecutor } from './binding.js';
import {
  bindGraphRead,
  createExecutableGraphRead as createExecutableGraphReadBase,
} from './binding.js';
import type { BoundGraphCommand, GraphCommandExecutor } from './command-binding.js';
import { createBoundGraphCommand } from './command-binding.js';
import type { GraphCommandSpec } from './command.js';
import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import { createDataGraphExecutor } from './execution.js';
import type { QueryBuilder, QueryOrView } from './query.js';
import type { DataGraphExecutionRuntime } from './runtime.js';
import {
  createGraphSelectionAssembly,
  type BoundGraphSelection,
  type BoundSelectionEntityBase,
} from './selection-assembly.js';

export type RuntimeBoundGraphCommand<
  TEntity extends AnyEntityDefinition,
  TPayload = unknown,
  TResult = void,
  TError = never,
  TCommandOptions = undefined,
> = BoundGraphCommand<TEntity, TPayload, TResult, TError, TCommandOptions>;

export type RuntimeBoundGraphSelection<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
> = BoundGraphSelection<TEntity, TResult, TError, TReadOptions, TError, TCommandOptions>;

export type RuntimeBoundSelectionEntity<
  TEntity extends AnyEntityDefinition,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
> = BoundSelectionEntityBase<TEntity, TError, TReadOptions, TError, TCommandOptions>;

export const createRuntimeBoundDataGraphApi = <
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
>(
  getRuntime: () => DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions>,
) => {
  const executor = createDataGraphExecutor<TError, TReadOptions, TCommandOptions>(getRuntime);

  const graphReadExecutor: GraphReadExecutor<TError, TReadOptions> = {
    get: (queryOrView, params, options) => executor.getViewEffect(queryOrView, params, options),
    run: (queryOrView, params, options) => executor.runViewEffect(queryOrView, params, options),
    count: (queryOrView, params, options) => executor.countViewEffect(queryOrView, params, options),
    stream: (queryOrView, params, options) =>
      executor.streamViewEffect(queryOrView, params, options),
  };

  const graphCommandExecutor: GraphCommandExecutor<TError, TCommandOptions> = {
    run: (command, options) => executor.runCommandEffect(command, options),
  };

  const createExecutableGraphRead = <TRead extends QueryOrView<any, any>>(
    read: TRead,
  ): ExecutableGraphRead<TRead, TError, TReadOptions> =>
    createExecutableGraphReadBase<TRead, TError, TReadOptions>(read, graphReadExecutor);

  const createGraphCommand = <
    TEntity extends AnyEntityDefinition,
    TPayload = unknown,
    TResult = void,
  >(
    command: GraphCommandSpec<TEntity, TPayload, TResult>,
  ): RuntimeBoundGraphCommand<TEntity, TPayload, TResult, TError, TCommandOptions> =>
    createBoundGraphCommand<TEntity, TPayload, TResult, TError, TCommandOptions>(
      command,
      graphCommandExecutor,
    );

  const selectionAssembly = createGraphSelectionAssembly<
    TError,
    TReadOptions,
    TError,
    TCommandOptions
  >({
    createCommand: createGraphCommand,
    createExecutableGraphRead,
    bindGraphRead: read => bindGraphRead(read, graphReadExecutor),
  });

  return {
    ...executor,
    bindGraphRead: <TRead extends QueryOrView<any, any>>(
      read: TRead,
    ): BoundGraphRead<TRead, TError, TReadOptions> => bindGraphRead(read, graphReadExecutor),
    bindSelectionEntity: <TEntity extends AnyEntityDefinition>(
      entityDefinition: TEntity,
    ): RuntimeBoundSelectionEntity<TEntity, TError, TReadOptions, TCommandOptions> =>
      selectionAssembly.bindSelectionEntity(
        entityDefinition,
      ) as unknown as RuntimeBoundSelectionEntity<TEntity, TError, TReadOptions, TCommandOptions>,
    createExecutableGraphRead,
    createGraphCommand,
    createGraphSelection: <
      TEntity extends AnyEntityDefinition,
      TResult = InferEntityRecord<TEntity['fields']>,
    >(
      builder: QueryBuilder<TEntity, TResult>,
    ): RuntimeBoundGraphSelection<TEntity, TResult, TError, TReadOptions, TCommandOptions> =>
      selectionAssembly.createGraphSelection(builder) as unknown as RuntimeBoundGraphSelection<
        TEntity,
        TResult,
        TError,
        TReadOptions,
        TCommandOptions
      >,
    namedGraphRead: selectionAssembly.namedGraphRead,
    selectionAssembly,
  };
};
