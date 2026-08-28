import { Effect } from 'effect';

import {
  createGraphReadDispatcher as createDataGraphReadDispatcher,
  createGraphCommandDispatcher as createDataGraphCommandDispatcher,
  assertMutationReactionConfiguration,
  type RelationshipMutationResult,
  type AnyEntityDefinition,
  type DataGraphDefaultStorage,
  type DataGraphExecutionRuntime,
  type GraphApi,
  type GraphReadDispatcher,
  type GraphReadPolicy,
  type GraphCommandDispatcher,
  type RelationshipCommandPolicy,
  type ManyToManyRelationshipCommandPolicy,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type MutationReaction,
  type PortableOperationConditionRegistry,
  type RelationshipCommandExecutionRuntime,
} from '../../data-graph/index.js';

import type { ArchitectureAppFacade, RegisteredArchitecture } from './app-facade.js';
import { defineOntahiApplication, type OntahiApplication } from './application.js';
import { architecture } from './architecture-registry.js';
import type { ArchitectureDefinition } from './architecture-types.js';
import { createDataGraphArchitectureAdapter } from './data-graph-app-adapter.js';
import {
  bindOntahiEntity,
  getOntahiSemanticEntities,
  isOntahiEntityDeclaration,
  prepareOntahiEntity,
  resolveOntahiEntityReferences,
  type AnyOntahiEntityDeclaration,
  type BoundOntahiEntityDeclaration,
} from './entity.js';
import { createContextualMutationReactionExecutor } from './mutation-reaction.js';
import type { TaskConfig } from './tasks.js';

type AnyDataGraphRuntime = DataGraphExecutionRuntime<any, any, any, any>;
type RuntimeError<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<infer TError, any, any, any> ? TError : never;
type RuntimeReadOptions<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<any, infer TReadOptions, any, any>
    ? TReadOptions
    : never;
type RuntimeCommandOptions<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<any, any, infer TCommandOptions, any>
    ? TCommandOptions
    : never;
type StorageRuntime<TStorage> =
  TStorage extends DataGraphDefaultStorage<infer TRuntime> ? TRuntime : never;

export type ApplicationGraphReadDispatcherFactory = <TAuthority>(
  policies: readonly GraphReadPolicy<any, TAuthority>[],
) => GraphReadDispatcher<TAuthority>;

export type ApplicationGraphCommandDispatcherFactory = <TAuthority>(
  policies: readonly (RelationshipCommandPolicy | ManyToManyRelationshipCommandPolicy)[],
) => GraphCommandDispatcher<TAuthority>;

export type GraphReadableOntahiApplication<TGraph extends GraphApi<any> = GraphApi<any>> =
  OntahiApplication<TGraph> & {
    createGraphReadDispatcher: ApplicationGraphReadDispatcherFactory;
  };

export type GraphCommandableOntahiApplication<TGraph extends GraphApi<any> = GraphApi<any>> =
  OntahiApplication<TGraph> & {
    createGraphCommandDispatcher: ApplicationGraphCommandDispatcherFactory;
  };
type OntahiGraphFacade<TRuntime extends AnyDataGraphRuntime> = ReturnType<
  typeof createDataGraphArchitectureAdapter<
    unknown,
    RuntimeError<TRuntime>,
    RuntimeReadOptions<TRuntime>,
    RuntimeCommandOptions<TRuntime>,
    TRuntime,
    RelationshipMutationResult
  >
>;
type OntahiOwnedRuntimeDefinition<TRuntime extends AnyDataGraphRuntime> = {
  graph: OntahiGraphFacade<TRuntime>;
  task: TaskConfig;
};

export type OntahiCapabilities = Omit<ArchitectureDefinition<any>, 'graph' | 'task'> & {
  graph?: never;
  task?: never;
};

type OntahiCapabilityEvent<TCapabilities> =
  TCapabilities extends ArchitectureDefinition<infer TEvent> ? TEvent : unknown;

type OntahiRuntimeDefinition<
  TCapabilities extends OntahiCapabilities,
  TRuntime extends AnyDataGraphRuntime,
> = Omit<TCapabilities, 'graph' | 'task'> & OntahiOwnedRuntimeDefinition<TRuntime>;

export type OntahiApplicationBuilder<
  TCapabilities extends OntahiCapabilities = {},
  TRuntime extends AnyDataGraphRuntime = AnyDataGraphRuntime,
> = ArchitectureAppFacade<
  OntahiCapabilityEvent<TCapabilities>,
  OntahiRuntimeDefinition<TCapabilities, TRuntime>
>;

export type OntahiBinderApp<
  TCapabilities extends OntahiCapabilities = {},
  TRuntime extends AnyDataGraphRuntime = AnyDataGraphRuntime,
> = OntahiApplicationBuilder<TCapabilities, TRuntime>;

export type OntahiOptions<
  TStorage extends DataGraphDefaultStorage<AnyDataGraphRuntime>,
  TEntities extends Record<string, object> | readonly AnyOntahiEntityDeclaration[],
  TCapabilities extends OntahiCapabilities = {},
> = {
  storage: TStorage;
  tasks?: TaskConfig;
  capabilities?: TCapabilities;
  entities:
    | TEntities
    | ((app: OntahiApplicationBuilder<TCapabilities, StorageRuntime<TStorage>>) => TEntities);
  reactions?: readonly MutationReaction[] | (() => readonly MutationReaction[]);
  operationConditions?: PortableOperationConditionRegistry;
};

type BoundEntityRecord<
  TEntities,
  TRuntime extends AnyDataGraphRuntime,
> = TEntities extends readonly AnyOntahiEntityDeclaration[]
  ? {
      [TEntity in TEntities[number] as TEntity['name']]: BoundOntahiEntityDeclaration<
        TEntity,
        TRuntime,
        RelationshipMutationResult
      >;
    }
  : TEntities extends Record<string, object>
    ? TEntities
    : never;

type BoundEntityRegistrationRecord<
  TEntities extends Record<string, object>,
  TRuntime extends AnyDataGraphRuntime,
> = {
  [TName in keyof TEntities]: TEntities[TName] extends AnyOntahiEntityDeclaration
    ? BoundOntahiEntityDeclaration<TEntities[TName], TRuntime, RelationshipMutationResult>
    : TEntities[TName];
};

export type ComposedOntahiApplication<
  TStorage extends DataGraphDefaultStorage<AnyDataGraphRuntime>,
  TEntities extends Record<string, object> | readonly AnyOntahiEntityDeclaration[],
  TCapabilities extends OntahiCapabilities = {},
> = GraphReadableOntahiApplication<
  GraphApi<BoundEntityRecord<TEntities, StorageRuntime<TStorage>>>
> & {
  architecture: RegisteredArchitecture<
    OntahiCapabilityEvent<TCapabilities>,
    OntahiRuntimeDefinition<TCapabilities, StorageRuntime<TStorage>>
  >;
  storage: TStorage;
  app: OntahiApplicationBuilder<TCapabilities, StorageRuntime<TStorage>>;
  registerEntity: <TDeclaration extends AnyOntahiEntityDeclaration>(
    declaration: TDeclaration,
  ) => BoundOntahiEntityDeclaration<
    TDeclaration,
    StorageRuntime<TStorage>,
    RelationshipMutationResult
  >;
  registerBoundEntity: <TEntity extends AnyEntityDefinition, TBoundEntity extends object>(
    entity: TEntity,
    boundEntity: TBoundEntity,
  ) => TBoundEntity;
  registerBoundEntities: <TBoundEntities extends Record<string, object>>(
    boundEntities: TBoundEntities,
  ) => GraphApi<BoundEntityRegistrationRecord<TBoundEntities, StorageRuntime<TStorage>>>;
};

export const ontahi = <
  TStorage extends DataGraphDefaultStorage<AnyDataGraphRuntime>,
  const TEntities extends Record<string, object> | readonly AnyOntahiEntityDeclaration[],
  const TCapabilities extends OntahiCapabilities = {},
>(
  options: OntahiOptions<TStorage, TEntities, TCapabilities>,
): ComposedOntahiApplication<TStorage, TEntities, TCapabilities> => {
  let registeredForReactions: RegisteredArchitecture<any, any> | undefined;
  let applicationForReactions: OntahiApplication | undefined;
  let registeredReactions: readonly MutationReaction[] = [];
  const relationshipCommandExecutor = createContextualMutationReactionExecutor<any, any>({
    getReactions: () => registeredReactions,
    invokeOperation: request => {
      const operation = applicationForReactions?.resolveOperation(request.operationId);
      if (!operation || !applicationForReactions) {
        throw new Error(`Unknown Operation ${request.operationId}.`);
      }
      return applicationForReactions.invokeOperation(operation, request.input);
    },
    emitEvent: event => {
      const effectors = registeredForReactions?.app.effects.effectors as
        | {
            'emit-event'?: (intent: {
              kind: 'emit-event';
              event: unknown;
            }) => Effect.Effect<void, unknown>;
          }
        | undefined;
      const effector = effectors?.['emit-event'];
      if (!effector) throw new Error('No effector registered for emit-event intents');
      return Effect.runPromise(effector({ kind: 'emit-event', event }));
    },
  });
  const graph = createDataGraphArchitectureAdapter<
    unknown,
    any,
    any,
    any,
    AnyDataGraphRuntime,
    RelationshipMutationResult
  >({
    defaultStorage: options.storage,
    relationshipCommandExecutor,
  });
  const definition = {
    ...options.capabilities,
    graph,
    task: options.tasks ?? {},
  } as OntahiRuntimeDefinition<TCapabilities, StorageRuntime<TStorage>>;
  const registered = architecture(definition);
  registeredForReactions = registered;
  const declaredEntities =
    typeof options.entities === 'function' ? options.entities(registered.app) : options.entities;
  if (Array.isArray(declaredEntities)) {
    declaredEntities.forEach(prepareOntahiEntity);
  }
  const semanticDeclarations = Array.isArray(declaredEntities)
    ? declaredEntities.flatMap(getOntahiSemanticEntities)
    : [];
  const semanticEntitiesByName = new Map<string, AnyEntityDefinition>();
  semanticDeclarations.forEach(entity => {
    const existing = semanticEntitiesByName.get(entity.name);
    if (existing && existing !== entity) {
      throw new Error(`Semantic entity ${entity.name} is declared more than once.`);
    }
    semanticEntitiesByName.set(entity.name, entity);
  });
  if (Array.isArray(declaredEntities)) {
    declaredEntities.forEach(declaration =>
      resolveOntahiEntityReferences(declaration, semanticEntitiesByName),
    );
    options.storage.bindEntities?.(semanticDeclarations);
  }
  const declaredReactions =
    typeof options.reactions === 'function' ? options.reactions() : (options.reactions ?? []);
  assertMutationReactionConfiguration(declaredReactions);
  registeredReactions = declaredReactions.map(declaration => ({
    id: declaration.id,
    delivery: declaration.delivery,
    when: declaration.when,
    react: declaration.react,
  }));
  const entityCommands = Object.fromEntries(
    semanticDeclarations.map(entity => [entity.name, graph.defineEntity(entity)]),
  );
  const bindingContext = {
    entities: entityCommands,
    operationConditions: options.operationConditions,
  };
  const entities = (
    Array.isArray(declaredEntities)
      ? Object.fromEntries(
          declaredEntities.map(declaration => [
            declaration.name,
            bindOntahiEntity(
              declaration,
              registered.app as unknown as OntahiApplicationBuilder,
              bindingContext,
            ),
          ]),
        )
      : declaredEntities
  ) as BoundEntityRecord<TEntities, StorageRuntime<TStorage>>;
  const entityRegistry = entities as Record<string, object>;
  const semanticEntities: AnyEntityDefinition[] = semanticDeclarations;
  const application = defineOntahiApplication({
    entities,
    runtime: registered.app,
  });
  applicationForReactions = application;

  const registerEntity = <TDeclaration extends AnyOntahiEntityDeclaration>(
    declaration: TDeclaration,
  ): BoundOntahiEntityDeclaration<
    TDeclaration,
    StorageRuntime<TStorage>,
    RelationshipMutationResult
  > => {
    if (entityRegistry[declaration.name]) {
      throw new Error(`Entity ${declaration.name} is already registered.`);
    }
    prepareOntahiEntity(declaration);
    const nextSemanticEntities = getOntahiSemanticEntities(declaration);
    nextSemanticEntities.forEach(entity => {
      const existing = semanticEntitiesByName.get(entity.name);
      if (existing && existing !== entity) {
        throw new Error(`Semantic entity ${entity.name} is declared more than once.`);
      }
      semanticEntitiesByName.set(entity.name, entity);
    });
    resolveOntahiEntityReferences(declaration, semanticEntitiesByName);
    semanticEntities.push(...nextSemanticEntities);
    options.storage.bindEntities?.(semanticEntities);
    getOntahiSemanticEntities(declaration).forEach(entity => {
      entityCommands[entity.name] = graph.defineEntity(entity);
    });
    const bound = bindOntahiEntity(
      declaration,
      registered.app as unknown as OntahiApplicationBuilder,
      bindingContext,
    );
    entityRegistry[declaration.name] = bound;
    return bound as unknown as BoundOntahiEntityDeclaration<
      TDeclaration,
      StorageRuntime<TStorage>,
      RelationshipMutationResult
    >;
  };
  const registerBoundEntity = <TEntity extends AnyEntityDefinition, TBoundEntity extends object>(
    entity: TEntity,
    boundEntity: TBoundEntity,
  ): TBoundEntity => {
    if (entityRegistry[entity.name]) {
      throw new Error(`Entity ${entity.name} is already registered.`);
    }
    semanticEntities.push(entity);
    options.storage.bindEntities?.(semanticEntities);
    entityRegistry[entity.name] = boundEntity;
    return boundEntity;
  };
  const registerBoundEntities = <TBoundEntities extends Record<string, object>>(
    boundEntities: TBoundEntities,
  ): GraphApi<BoundEntityRegistrationRecord<TBoundEntities, StorageRuntime<TStorage>>> => {
    const nextSemanticEntities: AnyEntityDefinition[] = [];

    Object.entries(boundEntities).forEach(([registryName, boundEntity]) => {
      const existing = entityRegistry[registryName];
      if (existing) {
        if (isOntahiEntityDeclaration(boundEntity) && boundEntity.name === registryName) {
          return;
        }
        if (existing !== boundEntity) {
          throw new Error(`Entity registration ${registryName} already exists.`);
        }
        return;
      }

      entityRegistry[registryName] = boundEntity;
      if (
        'name' in boundEntity &&
        typeof boundEntity.name === 'string' &&
        'fields' in boundEntity
      ) {
        nextSemanticEntities.push(boundEntity as AnyEntityDefinition);
      }
    });

    if (nextSemanticEntities.length > 0) {
      semanticEntities.push(...nextSemanticEntities);
      options.storage.bindEntities?.(semanticEntities);
    }

    return application.graph as unknown as GraphApi<
      BoundEntityRegistrationRecord<TBoundEntities, StorageRuntime<TStorage>>
    >;
  };

  const createGraphReadDispatcher: ApplicationGraphReadDispatcherFactory = policies => {
    return createDataGraphReadDispatcher({
      policies,
      execute: (read, mode) => {
        const runtime = options.storage.createRuntime();
        if (mode === 'get') return Effect.runPromise(runtime.get(read, undefined));
        if (mode === 'count') return Effect.runPromise(runtime.count(read, undefined));
        return Effect.runPromise(runtime.run(read, undefined));
      },
    });
  };

  const createGraphCommandDispatcher: ApplicationGraphCommandDispatcherFactory = policies =>
    createDataGraphCommandDispatcher({
      policies,
      execute: command => {
        const runtime = options.storage.createRuntime();
        if (!('runRelationshipCommand' in runtime)) {
          throw new Error('Storage runtime does not support Relationship Commands.');
        }
        return Effect.runPromise(
          (
            runtime as unknown as RelationshipCommandExecutionRuntime<unknown>
          ).runRelationshipCommand(command),
        );
      },
      executeManyToMany: command => {
        const runtime = options.storage.createRuntime();
        if (!('runManyToManyRelationshipCommand' in runtime)) {
          throw new Error('Storage runtime does not support many-to-many Relationship Commands.');
        }
        return Effect.runPromise(
          (
            runtime as unknown as ManyToManyRelationshipCommandExecutionRuntime<unknown>
          ).runManyToManyRelationshipCommand(command),
        );
      },
    });

  return Object.assign(application, {
    app: registered.app,
    architecture: registered,
    registerBoundEntities,
    registerBoundEntity,
    registerEntity,
    createGraphReadDispatcher,
    createGraphCommandDispatcher,
    storage: options.storage,
  });
};
