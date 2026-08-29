import { Effect } from 'effect';

import {
  type AnyEntityDefinition,
  type BoundEntityRefLocators,
  type BoundGraphRead,
  createGraphEntityFactory,
  defineGraphRelation,
  createRuntimeBoundDataGraphApi,
  type DataGraphExecutionRuntime,
  type DataGraphDefaultStorage,
  type DomainOperationDefaults,
  type DomainOperationDeclarations,
  type EntityRefLocators,
  type EntityRefLocatorDeclarations,
  type GraphEntityExposure,
  type GraphEntityWithOperations,
  type GraphOperationDeclarations,
  type InferEntityRecord,
  type ResolveDomainOperations,
  type RuntimeBoundGraphSelection,
  type RuntimeBoundSelectionEntity,
  type RuntimeBoundEntityRefRelationshipCommands,
  type RelationshipCommandExecutor,
  type RelationshipDelta,
  type ViewDefinition,
} from '../../data-graph/index.js';

import {
  createContextualRelationshipCommandExecutor,
  DATA_GRAPH_RELATIONSHIP_COMMAND_EXECUTOR,
  getRequiredDataGraphRuntime,
  withDataGraph,
  withDataGraphTransaction,
} from './data-graph.js';
import type {
  invokeConfiguredServerDomainOperation,
  ResolvedDomainOperationDeclaration,
} from './domain-operations.js';
import type { LayerConcernRuntime } from './layer-types.js';
import {
  bindRuntimeValueRefs,
  type BoundRuntimeValueRefs,
  type RuntimeValueRefDeclarations,
} from './operation/value-ref.js';
import type { TaskDeclarations, TaskMethods } from './tasks.js';

type EntityWithTaskMethods<TEntity, TTasks extends TaskDeclarations> = keyof TTasks extends never
  ? TEntity
  : TEntity & TaskMethods<TTasks> & { tasks: TaskMethods<TTasks>; taskDefinitions: TTasks };

type SiblingDomainOperations = Record<
  string,
  ResolvedDomainOperationDeclaration<any, any, any, any>
>;

type ConfiguredEntityRefOperationInvoke = <
  TOperation extends ResolvedDomainOperationDeclaration<any, any, any, any>,
>(
  operation: TOperation,
  input: TOperation extends ResolvedDomainOperationDeclaration<infer TInput, any, any, any>
    ? TInput
    : never,
) => TOperation extends ResolvedDomainOperationDeclaration<
  infer TInput,
  infer TResult,
  infer TFailure,
  infer TInfraError
>
  ? ReturnType<typeof invokeConfiguredServerDomainOperation<TInput, TResult, TFailure, TInfraError>>
  : never;

type RelationshipCommandExecutorOption<TRuntime, TCommandOptions, TRelationshipResult> = [
  TRelationshipResult,
] extends [RelationshipDelta]
  ? [RelationshipDelta] extends [TRelationshipResult]
    ? {
        relationshipCommandExecutor?: RelationshipCommandExecutor<
          RuntimeCommandError<TRuntime>,
          TCommandOptions,
          TRelationshipResult
        >;
      }
    : {
        relationshipCommandExecutor: RelationshipCommandExecutor<
          RuntimeCommandError<TRuntime>,
          TCommandOptions,
          TRelationshipResult
        >;
      }
  : {
      relationshipCommandExecutor: RelationshipCommandExecutor<
        RuntimeCommandError<TRuntime>,
        TCommandOptions,
        TRelationshipResult
      >;
    };

export type DataGraphArchitectureAdapterOptions<
  TInput,
  TError,
  TReadOptions,
  TCommandOptions,
  TRuntime extends DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions, any>,
  TRelationshipResult = RelationshipDelta,
> = {
  createRuntime?: (runtime: LayerConcernRuntime<TInput>) => TRuntime;
  defaultStorage?: DataGraphDefaultStorage<TRuntime>;
} & RelationshipCommandExecutorOption<TRuntime, TCommandOptions, TRelationshipResult>;

type RuntimeCommandError<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<any, any, any, infer TCommandError>
    ? TCommandError
    : never;

export const createDataGraphArchitectureAdapter = <
  TInput = unknown,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TRuntime extends DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions, any> =
    DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions>,
  TRelationshipResult = RelationshipDelta,
>(
  options: DataGraphArchitectureAdapterOptions<
    TInput,
    TError,
    TReadOptions,
    TCommandOptions,
    TRuntime,
    TRelationshipResult
  >,
) => {
  if (!options.createRuntime && !options.defaultStorage) {
    throw new Error('createDataGraphArchitectureAdapter requires defaultStorage or createRuntime.');
  }

  const createRuntime = (runtime: LayerConcernRuntime<TInput>): TRuntime => {
    if (options.defaultStorage) return options.defaultStorage.createRuntime();
    return options.createRuntime!(runtime);
  };
  type TCommandError = RuntimeCommandError<TRuntime>;
  const boundDataGraph = createRuntimeBoundDataGraphApi<
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >(() => getRequiredDataGraphRuntime<TRuntime>());
  type AdapterGraphSelection<
    TEntity extends AnyEntityDefinition,
    TResult = InferEntityRecord<TEntity['fields']>,
  > = RuntimeBoundGraphSelection<
    TEntity,
    TResult,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >;
  type AdapterSelectionEntity<TEntity extends AnyEntityDefinition> = RuntimeBoundSelectionEntity<
    TEntity,
    TError,
    TReadOptions,
    TCommandOptions,
    TCommandError
  >;
  const relationshipCommandExecutor =
    options.relationshipCommandExecutor ??
    createContextualRelationshipCommandExecutor<TCommandError, TCommandOptions>();
  const defineBoundGraphEntity = createGraphEntityFactory({
    bindSelectionEntity: boundDataGraph.bindSelectionEntity,
    relationshipCommandExecutor,
  });

  const defineEntity = <
    TEntity extends AnyEntityDefinition,
    TOperations extends GraphOperationDeclarations = {},
    TDomainOperations extends DomainOperationDeclarations = {},
    TLocators extends EntityRefLocatorDeclarations = {},
    TTasks extends TaskDeclarations = {},
    TValues extends RuntimeValueRefDeclarations = {},
  >(
    entityDefinition: TEntity,
    config?: {
      exposure?: GraphEntityExposure;
      domainOperationDefaults?: DomainOperationDefaults;
      operations?: TOperations | ((entity: AdapterSelectionEntity<TEntity>) => TOperations);
      domainOperations?:
        | TDomainOperations
        | ((context: {
            values: BoundRuntimeValueRefs<TValues>;
            operations: SiblingDomainOperations;
          }) => TDomainOperations);
      locators?: TLocators;
      tasks?: TTasks;
      values?: TValues;
    },
  ): EntityWithTaskMethods<
    GraphEntityWithOperations<
      TEntity,
      AdapterSelectionEntity<TEntity>,
      TOperations,
      TDomainOperations
    > &
      BoundEntityRefLocators<
        TEntity,
        ResolveDomainOperations<TEntity['name'], TDomainOperations>,
        EntityRefLocators<TEntity> & TLocators,
        ConfiguredEntityRefOperationInvoke,
        {},
        RuntimeBoundEntityRefRelationshipCommands<
          TEntity,
          TCommandError,
          TCommandOptions,
          TRelationshipResult
        >
      > & { values: BoundRuntimeValueRefs<TValues> },
    TTasks
  > => {
    const values = bindRuntimeValueRefs(entityDefinition.name, config?.values ?? ({} as TValues));
    let resolvedDomainOperations:
      | ResolveDomainOperations<TEntity['name'], TDomainOperations>
      | undefined;
    const operations = new Proxy(
      {},
      {
        get: (_target, name) => {
          if (!resolvedDomainOperations) {
            throw new Error(
              `Domain operation ${entityDefinition.name}.${String(name)} cannot be read while ${entityDefinition.name} is still binding.`,
            );
          }
          return resolvedDomainOperations[name as keyof typeof resolvedDomainOperations];
        },
      },
    ) as SiblingDomainOperations;
    const domainOperations =
      typeof config?.domainOperations === 'function'
        ? config.domainOperations({ values, operations })
        : config?.domainOperations;
    const bound = defineBoundGraphEntity(entityDefinition, {
      ...config,
      domainOperations,
    } as never);
    resolvedDomainOperations = bound.domain as unknown as ResolveDomainOperations<
      TEntity['name'],
      TDomainOperations
    >;
    const withValues = Object.assign(bound, { values });
    return withValues as unknown as EntityWithTaskMethods<
      GraphEntityWithOperations<
        TEntity,
        AdapterSelectionEntity<TEntity>,
        TOperations,
        TDomainOperations
      > &
        BoundEntityRefLocators<
          TEntity,
          ResolveDomainOperations<TEntity['name'], TDomainOperations>,
          EntityRefLocators<TEntity> & TLocators,
          ConfiguredEntityRefOperationInvoke,
          {},
          RuntimeBoundEntityRefRelationshipCommands<
            TEntity,
            TCommandError,
            TCommandOptions,
            TRelationshipResult
          >
        > & { values: BoundRuntimeValueRefs<TValues> },
      TTasks
    >;
  };

  function namedGraphRead<TEntity extends AnyEntityDefinition, TResult>(
    name: string,
    selection: AdapterGraphSelection<TEntity, TResult>,
  ): BoundGraphRead<ViewDefinition<undefined, TEntity, TResult>, TError, TReadOptions>;
  function namedGraphRead<TParams, TEntity extends AnyEntityDefinition, TResult>(
    name: string,
    entityDefinition: TEntity,
    build: (params: TParams) => AdapterGraphSelection<TEntity, any>,
  ): BoundGraphRead<ViewDefinition<TParams, TEntity, TResult>, TError, TReadOptions>;
  function namedGraphRead<TParams, TEntity extends AnyEntityDefinition, TResult>(
    name: string,
    selectionOrEntity: AdapterGraphSelection<TEntity, TResult> | TEntity,
    build?: (params: TParams) => AdapterGraphSelection<TEntity, any>,
  ): BoundGraphRead<ViewDefinition<TParams | undefined, TEntity, TResult>, TError, TReadOptions> {
    return boundDataGraph.namedGraphRead(
      name,
      selectionOrEntity as never,
      build as never,
    ) as BoundGraphRead<
      ViewDefinition<TParams | undefined, TEntity, TResult>,
      TError,
      TReadOptions
    >;
  }

  return {
    ...boundDataGraph,
    [DATA_GRAPH_RELATIONSHIP_COMMAND_EXECUTOR]: relationshipCommandExecutor,
    createRuntime,
    ...(options.defaultStorage ? { readEntityData: options.defaultStorage.readEntityData } : {}),
    ...(options.defaultStorage?.readRelatedEntityData
      ? { readRelatedEntityData: options.defaultStorage.readRelatedEntityData }
      : {}),
    defineEntity,
    defineGraphEntity: defineEntity,
    defineRelation: defineGraphRelation,
    namedGraphRead,
    transaction: <TValue, TWorkError = never, TRequirements = never>(
      effect: Effect.Effect<TValue, TWorkError, TRequirements>,
    ) => withDataGraphTransaction<TRuntime, TValue, TWorkError, TRequirements>(effect),
    withRuntime: <TLayerInput = TInput>() =>
      withDataGraph<TLayerInput, TRuntime>({
        createRuntime: createRuntime as unknown as (
          runtime: LayerConcernRuntime<TLayerInput>,
        ) => TRuntime,
      }),
  };
};
