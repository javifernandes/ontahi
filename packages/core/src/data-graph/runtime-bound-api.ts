import { Effect } from 'effect';

import type { BoundGraphRead, ExecutableGraphRead, GraphReadExecutor } from './binding.js';
import {
  bindGraphRead,
  createExecutableGraphRead as createExecutableGraphReadBase,
} from './binding.js';
import type { BoundGraphCommand, GraphCommandExecutor } from './command-binding.js';
import { createBoundGraphCommand } from './command-binding.js';
import type { GraphCommandSpec } from './command.js';
import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import {
  bindRuntimeEntityMutationClientFacade,
  type RuntimeBoundEntityMutationClientFacade,
} from './entity-mutation-authoring.js';
import type { EntityMutationCommandExecutionRuntime } from './entity-mutation-command.js';
import { createDataGraphExecutor, type DataGraphExecutor } from './execution.js';
import type { QueryBuilder, QueryOrView } from './query.js';
import type { AnyEntityRef, EntityRefLocator } from './ref/index.js';
import type { DataGraphExecutionRuntime } from './runtime.js';
import {
  createGraphSelectionAssembly,
  type BoundGraphSelection,
  type BoundSelection,
  type BoundSelectionEntityBase,
  type GraphSelectionAssembly,
} from './selection-assembly.js';
import type { Selection } from './selection-value.js';

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
  TCommandError = TError,
> = BoundGraphSelection<TEntity, TResult, TError, TReadOptions, TCommandError, TCommandOptions>;

export type RuntimeBoundSelection<
  TEntity extends AnyEntityDefinition,
  TCardinality extends 'one' | 'many' | undefined = undefined,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TError,
> = BoundSelection<TEntity, TCardinality, TError, TReadOptions, TCommandError, TCommandOptions>;

export type RuntimeBoundSelectionEntity<
  TEntity extends AnyEntityDefinition,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TError,
> = BoundSelectionEntityBase<TEntity, TError, TReadOptions, TCommandError, TCommandOptions>;

type ClientEntityWithDefinition = {
  definition: AnyEntityDefinition;
  ref: (locator: EntityRefLocator) => AnyEntityRef;
};

type ClientEntityDefinitionOf<TClientEntity extends ClientEntityWithDefinition> =
  TClientEntity['definition'];

type RuntimeBoundSelectionEntityApi<
  TEntity extends AnyEntityDefinition,
  TError,
  TReadOptions,
  TCommandOptions,
  TCommandError,
> = Omit<
  RuntimeBoundSelectionEntity<TEntity, TError, TReadOptions, TCommandOptions, TCommandError>,
  keyof TEntity
>;

export type RuntimeBoundClientEntity<
  TClientEntity extends ClientEntityWithDefinition,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TError,
> = Omit<
  RuntimeBoundEntityMutationClientFacade<
    TClientEntity,
    ClientEntityDefinitionOf<TClientEntity>,
    TCommandError,
    TCommandOptions
  >,
  keyof RuntimeBoundSelectionEntityApi<
    ClientEntityDefinitionOf<TClientEntity>,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >
> &
  RuntimeBoundSelectionEntityApi<
    ClientEntityDefinitionOf<TClientEntity>,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >;

export type RuntimeBoundDataGraphApi<
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TError,
> = DataGraphExecutor<TError, TReadOptions, TCommandOptions, TCommandError> & {
  bindGraphRead: <TRead extends QueryOrView<any, any>>(
    read: TRead,
  ) => BoundGraphRead<TRead, TError, TReadOptions>;
  bindClientEntity: <TClientEntity extends ClientEntityWithDefinition>(
    clientEntity: TClientEntity,
  ) => RuntimeBoundClientEntity<
    TClientEntity,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >;
  bindSelectionEntity: <TEntity extends AnyEntityDefinition>(
    entityDefinition: TEntity,
  ) => RuntimeBoundSelectionEntity<TEntity, TError, TReadOptions, TCommandOptions, TCommandError>;
  bindSelection: <
    TEntity extends AnyEntityDefinition,
    TCardinality extends 'one' | 'many' | undefined = undefined,
  >(
    semanticSelection: Selection<TEntity, TCardinality>,
  ) => RuntimeBoundSelection<
    TEntity,
    TCardinality,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >;
  createExecutableGraphRead: <TRead extends QueryOrView<any, any>>(
    read: TRead,
  ) => ExecutableGraphRead<TRead, TError, TReadOptions>;
  createGraphCommand: <TEntity extends AnyEntityDefinition, TPayload = unknown, TResult = void>(
    command: GraphCommandSpec<TEntity, TPayload, TResult>,
  ) => RuntimeBoundGraphCommand<TEntity, TPayload, TResult, TCommandError, TCommandOptions>;
  createGraphSelection: <
    TEntity extends AnyEntityDefinition,
    TResult = InferEntityRecord<TEntity['fields']>,
  >(
    builder: QueryBuilder<TEntity, TResult>,
  ) => RuntimeBoundGraphSelection<
    TEntity,
    TResult,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >;
  namedGraphRead: GraphSelectionAssembly<
    TError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >['namedGraphRead'];
  selectionAssembly: GraphSelectionAssembly<TError, TReadOptions, TCommandError, TCommandOptions>;
};

export const createRuntimeBoundDataGraphApi = <
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TCommandError = TError,
>(
  getRuntime: () => DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions, TCommandError>,
): RuntimeBoundDataGraphApi<TError, TReadOptions, TCommandOptions, TCommandError> => {
  const executor = createDataGraphExecutor<TError, TReadOptions, TCommandOptions, TCommandError>(
    getRuntime,
  );

  const graphReadExecutor: GraphReadExecutor<TError, TReadOptions> = {
    get: (queryOrView, params, options) => executor.getViewEffect(queryOrView, params, options),
    run: (queryOrView, params, options) => executor.runViewEffect(queryOrView, params, options),
    count: (queryOrView, params, options) => executor.countViewEffect(queryOrView, params, options),
    stream: (queryOrView, params, options) =>
      executor.streamViewEffect(queryOrView, params, options),
  };

  const graphCommandExecutor: GraphCommandExecutor<TCommandError, TCommandOptions> = {
    run: (command, options) => executor.runCommandEffect(command, options),
  };
  const entityMutationCommandExecutor: EntityMutationCommandExecutionRuntime<
    TCommandError,
    TCommandOptions
  > = {
    runEntityMutationCommand: (command, options) =>
      Effect.suspend(() => {
        const runtime = getRuntime() as DataGraphExecutionRuntime<
          TError,
          TReadOptions,
          TCommandOptions,
          TCommandError
        > &
          Partial<EntityMutationCommandExecutionRuntime<TCommandError, TCommandOptions>>;
        if (typeof runtime.runEntityMutationCommand !== 'function') {
          throw new TypeError(
            'The current Data Graph runtime does not support Entity Mutation Command execution.',
          );
        }
        return runtime.runEntityMutationCommand(command, options);
      }),
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
  ): RuntimeBoundGraphCommand<TEntity, TPayload, TResult, TCommandError, TCommandOptions> =>
    createBoundGraphCommand<TEntity, TPayload, TResult, TCommandError, TCommandOptions>(
      command,
      graphCommandExecutor,
    );

  const selectionAssembly = createGraphSelectionAssembly<
    TError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >({
    createCommand: createGraphCommand,
    createExecutableGraphRead,
    bindGraphRead: read => bindGraphRead(read, graphReadExecutor),
  });

  const bindClientEntity = <TClientEntity extends ClientEntityWithDefinition>(
    clientEntity: TClientEntity,
  ): RuntimeBoundClientEntity<
    TClientEntity,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  > => {
    const {
      selection,
      all,
      where,
      insert,
      insertReturning,
      insertMany,
      insertManyReturning,
      upsert,
      upsertMany,
      relatedTo,
    } = selectionAssembly.bindSelectionEntity(clientEntity.definition, {});
    const mutationClientEntity = bindRuntimeEntityMutationClientFacade(
      clientEntity,
      clientEntity.definition,
      entityMutationCommandExecutor,
    );
    let boundClientEntity!: RuntimeBoundClientEntity<
      TClientEntity,
      TError,
      TReadOptions,
      TCommandOptions,
      TCommandError
    >;

    boundClientEntity = {
      ...mutationClientEntity,
      selection,
      all,
      where,
      insert,
      insertReturning,
      insertMany,
      insertManyReturning,
      upsert,
      upsertMany,
      relatedTo,
      pipe: <TValue>(fn: (entity: typeof boundClientEntity) => TValue) => fn(boundClientEntity),
    } as unknown as typeof boundClientEntity;

    return boundClientEntity;
  };

  return {
    ...executor,
    bindGraphRead: <TRead extends QueryOrView<any, any>>(
      read: TRead,
    ): BoundGraphRead<TRead, TError, TReadOptions> => bindGraphRead(read, graphReadExecutor),
    bindClientEntity,
    bindSelectionEntity: <TEntity extends AnyEntityDefinition>(
      entityDefinition: TEntity,
    ): RuntimeBoundSelectionEntity<TEntity, TError, TReadOptions, TCommandOptions, TCommandError> =>
      selectionAssembly.bindSelectionEntity(
        entityDefinition,
      ) as unknown as RuntimeBoundSelectionEntity<
        TEntity,
        TError,
        TReadOptions,
        TCommandOptions,
        TCommandError
      >,
    bindSelection: <
      TEntity extends AnyEntityDefinition,
      TCardinality extends 'one' | 'many' | undefined = undefined,
    >(
      semanticSelection: Selection<TEntity, TCardinality>,
    ): RuntimeBoundSelection<
      TEntity,
      TCardinality,
      TError,
      TReadOptions,
      TCommandOptions,
      TCommandError
    > =>
      selectionAssembly.bindSelection(semanticSelection) as RuntimeBoundSelection<
        TEntity,
        TCardinality,
        TError,
        TReadOptions,
        TCommandOptions,
        TCommandError
      >,
    createExecutableGraphRead,
    createGraphCommand,
    createGraphSelection: <
      TEntity extends AnyEntityDefinition,
      TResult = InferEntityRecord<TEntity['fields']>,
    >(
      builder: QueryBuilder<TEntity, TResult>,
    ): RuntimeBoundGraphSelection<
      TEntity,
      TResult,
      TError,
      TReadOptions,
      TCommandOptions,
      TCommandError
    > =>
      selectionAssembly.createGraphSelection(builder) as unknown as RuntimeBoundGraphSelection<
        TEntity,
        TResult,
        TError,
        TReadOptions,
        TCommandOptions,
        TCommandError
      >,
    namedGraphRead: selectionAssembly.namedGraphRead,
    selectionAssembly,
  };
};
