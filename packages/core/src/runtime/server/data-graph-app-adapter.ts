import { Effect } from 'effect';

import {
  type AnyEntityDefinition,
  type BoundEntityRefLocators,
  type BoundGraphRead,
  createGraphEntityFactory,
  defineGraphRelation,
  defineEntityRefInput,
  createRuntimeBoundDataGraphApi,
  type DataGraphExecutionRuntime,
  type DomainOperationDefaults,
  type DomainOperationDeclarations,
  type EntityRefLocators,
  type EntityName,
  type EntityRefInputBuilder,
  type EntityRefLocatorDeclarations,
  type GraphEntityExposure,
  type GraphEntityWithOperations,
  type GraphOperationDeclarations,
  type InferEntityRecord,
  type ResolveDomainOperations,
  type RuntimeBoundGraphSelection,
  type RuntimeBoundSelectionEntity,
  type ViewDefinition,
} from '../../data-graph/index.js';

import { getRequiredDataGraphRuntime, withDataGraph } from './data-graph.js';
import type {
  invokeConfiguredServerDomainOperation,
  ResolvedDomainOperationDeclaration,
} from './domain-operations.js';
import type { LayerConcernRuntime } from './layer-types.js';
import type { TaskDeclarations, TaskMethods } from './tasks.js';

type EntityWithTaskMethods<TEntity, TTasks extends TaskDeclarations> = keyof TTasks extends never
  ? TEntity
  : TEntity & TaskMethods<TTasks> & { tasks: TaskMethods<TTasks>; taskDefinitions: TTasks };

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

export type DataGraphArchitectureAdapterOptions<
  TInput,
  TError,
  TReadOptions,
  TCommandOptions,
  TRuntime extends DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions>,
> = {
  createRuntime: (runtime: LayerConcernRuntime<TInput>) => TRuntime;
};

export const createDataGraphArchitectureAdapter = <
  TInput = unknown,
  TError = never,
  TReadOptions = undefined,
  TCommandOptions = TReadOptions,
  TRuntime extends DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions> =
    DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions>,
>({
  createRuntime,
}: DataGraphArchitectureAdapterOptions<
  TInput,
  TError,
  TReadOptions,
  TCommandOptions,
  TRuntime
>) => {
  const boundDataGraph = createRuntimeBoundDataGraphApi<TError, TReadOptions, TCommandOptions>(() =>
    getRequiredDataGraphRuntime<TRuntime>(),
  );
  type AdapterGraphSelection<
    TEntity extends AnyEntityDefinition,
    TResult = InferEntityRecord<TEntity['fields']>,
  > = RuntimeBoundGraphSelection<TEntity, TResult, TError, TReadOptions, TCommandOptions>;
  type AdapterSelectionEntity<TEntity extends AnyEntityDefinition> = RuntimeBoundSelectionEntity<
    TEntity,
    TError,
    TReadOptions,
    TCommandOptions
  >;
  type DefaultEntityRefResolution<TEntity extends AnyEntityDefinition> = ReturnType<
    ReturnType<AdapterSelectionEntity<TEntity>['all']>['get']
  >;

  const unsupportedLocatorEffect = <TEntity extends AnyEntityDefinition>(
    entityDefinition: TEntity,
    unsupportedFields: readonly string[],
  ): DefaultEntityRefResolution<TEntity> =>
    Effect.die(
      new Error(
        `Default ref resolver for ${entityDefinition.name} cannot resolve locator field${
          unsupportedFields.length === 1 ? '' : 's'
        } ${unsupportedFields.join(', ')} because ${
          unsupportedFields.length === 1 ? 'it is not a field' : 'they are not fields'
        } on ${entityDefinition.name}. Use resolveWith(...) for virtual/path locators.`,
      ),
    ) as DefaultEntityRefResolution<TEntity>;
  const emptyLocatorEffect = <TEntity extends AnyEntityDefinition>(
    entityDefinition: TEntity,
  ): DefaultEntityRefResolution<TEntity> =>
    Effect.die(
      new Error(
        `Default ref resolver for ${entityDefinition.name} cannot resolve an empty locator. Pass a locator declared on ${entityDefinition.name} or use resolveWith(...) for custom references.`,
      ),
    ) as DefaultEntityRefResolution<TEntity>;

  const createDefaultEntityRefInputResolver =
    <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) =>
    (ref: { locator: Record<string, unknown> }): DefaultEntityRefResolution<TEntity> => {
      const locatorEntries = Object.entries(ref.locator);
      const unsupportedFields = locatorEntries
        .map(([fieldName]) => fieldName)
        .filter(fieldName => !(fieldName in entityDefinition.fields));

      if (locatorEntries.length === 0) {
        return emptyLocatorEffect(entityDefinition);
      }

      if (unsupportedFields.length > 0) {
        return unsupportedLocatorEffect(entityDefinition, unsupportedFields);
      }

      const entity = boundDataGraph.bindSelectionEntity(entityDefinition);
      const selection = locatorEntries.reduce(
        (currentSelection, [fieldName, value]) =>
          currentSelection.where(root => {
            const fieldRef = (
              root as unknown as Record<string, { eq: (nextValue: unknown) => never }>
            )[fieldName];

            return fieldRef.eq(value);
          }),
        entity.all(),
      );

      return selection.get() as DefaultEntityRefResolution<TEntity>;
    };

  function refInput<TEntity extends AnyEntityDefinition>(
    entityDefinition: TEntity,
  ): EntityRefInputBuilder<EntityName<TEntity>, false, DefaultEntityRefResolution<TEntity>>;
  function refInput<TEntityName extends string>(
    entityName: TEntityName,
  ): EntityRefInputBuilder<TEntityName, false, never>;
  function refInput(entityOrName: AnyEntityDefinition | string) {
    return typeof entityOrName === 'string'
      ? defineEntityRefInput(entityOrName)
      : defineEntityRefInput(entityOrName).resolveWith(
          createDefaultEntityRefInputResolver(entityOrName),
        );
  }

  const defineBoundGraphEntity = createGraphEntityFactory({
    bindSelectionEntity: boundDataGraph.bindSelectionEntity,
  });

  const defineEntity = <
    TEntity extends AnyEntityDefinition,
    TOperations extends GraphOperationDeclarations = {},
    TDomainOperations extends DomainOperationDeclarations = {},
    TLocators extends EntityRefLocatorDeclarations = {},
    TTasks extends TaskDeclarations = {},
  >(
    entityDefinition: TEntity,
    config?: {
      exposure?: GraphEntityExposure;
      domainOperationDefaults?: DomainOperationDefaults;
      operations?: TOperations | ((entity: AdapterSelectionEntity<TEntity>) => TOperations);
      domainOperations?: TDomainOperations;
      locators?: TLocators;
      tasks?: TTasks;
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
        ConfiguredEntityRefOperationInvoke
      >,
    TTasks
  > =>
    defineBoundGraphEntity(entityDefinition, config as never) as unknown as EntityWithTaskMethods<
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
          ConfiguredEntityRefOperationInvoke
        >,
      TTasks
    >;

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
    createRuntime,
    defineEntity,
    defineGraphEntity: defineEntity,
    defineRelation: defineGraphRelation,
    namedGraphRead,
    refInput,
    withRuntime: <TLayerInput = TInput>() =>
      withDataGraph<TLayerInput, TRuntime>({
        createRuntime: createRuntime as unknown as (
          runtime: LayerConcernRuntime<TLayerInput>,
        ) => TRuntime,
      }),
  };
};
