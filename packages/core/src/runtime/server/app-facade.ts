import type { AnyEntityDefinition } from '../../data-graph/definitions.js';
import {
  queryRef,
  type EntityName,
  type HttpIngressMetadata,
} from '../../data-graph/operations.js';
import { graphOutput } from '../../data-graph/output/index.js';
import {
  bindEntityRefOperationProxy,
  createEntityRef,
  defineEntityRefInput,
  type BoundEntityRefOperationProxy,
  type EntityRefLocatorDeclarations,
  type EntityRef,
  type EntityRefInputPublicInput,
  type EntityRefLocator,
} from '../../data-graph/ref.js';
import { bindEntityRefRelationshipCommands } from '../../data-graph/relationship-command.js';
import { parseGraphSchema, safeParseGraphSchema } from '../../data-graph/schema.js';

import type { ArchitectureDefinition, ArchitectureNamespace } from './architecture-types.js';
import { authenticated, getCurrentPrincipal, requirePrincipal } from './authentication.js';
import {
  contract,
  contractFromGraphSchema,
  contractFromTypia,
  contractFromValidation,
  contractFromZod,
} from './concerns/contract.js';
import { applyLayerConcerns, combineConcerns } from './concerns.js';
import {
  createContextResourceApi,
  createServerRuntimeResources,
  getOrCreateContextResource,
} from './context-resources.js';
import {
  getOperationRuntimeContext,
  getOrCreateServerContextResource,
  getServerContextResources,
  memoizeInServerContext,
  serverContext,
  toContextRecord,
} from './context.js';
import {
  getCurrentDataGraphRuntime,
  getRequiredDataGraphRuntime,
  getRequiredDataGraphRuntimeEffect,
  withDataGraph,
} from './data-graph.js';
import {
  checkServerDomainOperationPermission,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  invokeConfiguredServerDomainOperation,
  invokeConfiguredProjectedDomainOperation,
  inspectProjectedDomainOperationQuery,
  invokeServerDomainOperation,
  type ResolvedDomainOperationDeclaration,
  runConfiguredServerDomainOperationRaw,
  runServerDomainOperationRaw,
} from './domain-operations.js';
import { layer, operation } from './dsl.js';
import {
  createOperationFailure,
  createPersistenceFailedError,
  failOperation,
  reportOperationError,
  reportOperationWarning,
} from './failures.js';
import {
  attempt,
  attemptEvent,
  event,
  executeEffectIntents,
  run,
  tryEffect,
  withEffects,
} from './intents.js';
import { getCurrentInvocationContext, withInvocationContext } from './invocation-context.js';
import {
  ExternalDependencyFailedError,
  PersistenceFailedError,
  type OperationResult,
} from './operation/types.js';
import { toOperationInvocationResult, type OperationInvocationResult } from './operation-result.js';
import { combineRequirements } from './requirements.js';
import { runServerEffect } from './runtime-effect.js';
import {
  createInMemoryTaskStorage,
  createInProcessTaskExecutor,
  createInProcessTaskRuntime,
  createConfiguredTaskFacade,
  defineTask,
  defineTaskStep,
  type TaskDeclarations,
  type TaskFailure,
  type TaskRunRef,
  startTask,
  inProcessTasks,
} from './tasks.js';
import { failIfError, fromNullable, fromValueOrPromise } from './values.js';

type ArchitectureDefinitionKey = keyof ArchitectureDefinition<unknown>;

type NamespaceOverride<TDefinition, TKey extends ArchitectureDefinitionKey> =
  TDefinition extends Record<TKey, infer TNamespace extends ArchitectureNamespace>
    ? TNamespace
    : {};

type NamespaceOverrideObject<TOverride> = TOverride extends ArchitectureNamespace ? TOverride : {};

type MergedNamespace<TBase extends ArchitectureNamespace, TOverride> = Omit<
  TBase,
  keyof NamespaceOverrideObject<TOverride>
> &
  NamespaceOverrideObject<TOverride>;

const mergeNamespace = <TBase extends ArchitectureNamespace, TOverride>(
  base: TBase,
  override: TOverride,
): MergedNamespace<TBase, TOverride> =>
  ({
    ...base,
    ...(override && typeof override === 'object' ? override : {}),
  }) as MergedNamespace<TBase, TOverride>;

const graphFacadeBase = {
  getCurrentRuntime: getCurrentDataGraphRuntime,
  getRequiredRuntime: getRequiredDataGraphRuntime,
  getRequiredRuntimeEffect: getRequiredDataGraphRuntimeEffect,
  output: graphOutput,
  queryRef,
  refInput: defineEntityRefInput,
  withRuntime: withDataGraph,
};

type AnyResolvedDomainOperation = ResolvedDomainOperationDeclaration<any, any, any, any, any>;

type ConfiguredOperationInput<TOperation extends AnyResolvedDomainOperation> =
  TOperation extends ResolvedDomainOperationDeclaration<
    infer TInput,
    any,
    any,
    any,
    infer TInputRefs
  >
    ? EntityRefInputPublicInput<TInput, TInputRefs>
    : never;

type ConfiguredOperationResult<TOperation extends AnyResolvedDomainOperation> =
  TOperation extends ResolvedDomainOperationDeclaration<any, infer TResult, any, any, any>
    ? TResult
    : never;

type ConfiguredOperationFailure<TOperation extends AnyResolvedDomainOperation> =
  TOperation extends ResolvedDomainOperationDeclaration<any, any, infer TFailure, any, any>
    ? TFailure
    : never;

type ConfiguredOperationExecutionResult<TOperation extends AnyResolvedDomainOperation> =
  undefined extends TOperation['durable'] ? ConfiguredOperationResult<TOperation> : TaskRunRef;

type ConfiguredOperationExecutionFailure<TOperation extends AnyResolvedDomainOperation> =
  undefined extends TOperation['durable']
    ? ConfiguredOperationFailure<TOperation>
    : ConfiguredOperationFailure<TOperation> | TaskFailure;

type ConfiguredOperationRawRun = <TOperation extends AnyResolvedDomainOperation>(
  operation: TOperation,
  input: ConfiguredOperationInput<NoInfer<TOperation>>,
) => Promise<
  OperationResult<
    ConfiguredOperationExecutionResult<TOperation>,
    ConfiguredOperationExecutionFailure<TOperation>
  >
>;

type ConfiguredOperationInvoke = <TOperation extends AnyResolvedDomainOperation>(
  operation: TOperation,
  input: ConfiguredOperationInput<NoInfer<TOperation>>,
) => Promise<
  OperationInvocationResult<
    ConfiguredOperationExecutionResult<TOperation>,
    ConfiguredOperationExecutionFailure<TOperation>
  >
>;

type ConfiguredProjectedOperationInvoke = (
  operation: AnyResolvedDomainOperation,
  input: object,
  projection: Parameters<typeof invokeConfiguredProjectedDomainOperation>[2],
) => Promise<OperationInvocationResult>;

type ConfiguredProjectedOperationInspect = (
  operation: AnyResolvedDomainOperation,
  input: object,
  view: Parameters<typeof inspectProjectedDomainOperationQuery>[2],
) => ReturnType<typeof inspectProjectedDomainOperationQuery>;

type GraphEntityRefProvider = <
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends Record<string, unknown>,
  TArgs extends readonly unknown[],
  TLocator extends EntityRefLocator,
>(
  entityOrName: TEntity,
  operations: TOperations,
  toLocator: (...args: TArgs) => TLocator,
) => (
  ...args: TArgs
) => BoundEntityRefOperationProxy<
  EntityRef<EntityName<TEntity>, TLocator>,
  TOperations,
  ConfiguredOperationInvoke
>;

const operationFacadeBase = {
  ExternalDependencyFailedError,
  PersistenceFailedError,
  createFailure: createOperationFailure,
  createOperationFailure,
  createPersistenceFailedError,
  define: defineDomainOperation,
  defineForEntity: defineDomainOperationsForEntity,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  fail: failOperation,
  failIfError,
  failOperation,
  failure: createOperationFailure,
  fromNullable,
  fromValueOrPromise,
  layer,
  operation,
  reportError: reportOperationError,
  reportOperationError,
  reportOperationWarning,
  reportWarning: reportOperationWarning,
  invoke: invokeServerDomainOperation,
  runRaw: runServerDomainOperationRaw,
  checkPermission: checkServerDomainOperationPermission,
  toInvocationResult: toOperationInvocationResult,
  checkServerDomainOperationPermission,
};

const ingressFacadeBase = {
  http: <TPayload, TInput>(
    metadata: Omit<HttpIngressMetadata<TPayload, TInput>, 'kind'>,
  ): HttpIngressMetadata<TPayload, TInput> => ({
    kind: 'http',
    ...metadata,
  }),
};

const requireFacadeBase = {
  authenticated,
  combine: combineRequirements,
  combineRequirements,
};

const concernFacadeBase = {
  apply: applyLayerConcerns,
  combine: combineConcerns,
  applyLayerConcerns,
  combineConcerns,
};

const validationFacadeBase = {
  contract,
  contractFromGraphSchema,
  contractFromTypia,
  contractFromValidation,
  contractFromZod,
  parseGraphSchema,
  safeParseGraphSchema,
};

const cacheFacadeBase = {
  createContextResourceApi,
  createServerRuntimeResources,
  getOrCreateContextResource,
  getOrCreateServerContextResource,
  getServerContextResources,
  memoizeInServerContext,
};

const effectsFacadeBase = {
  attempt,
  attemptEvent,
  event,
  execute: executeEffectIntents,
  executeEffectIntents,
  run,
  tryEffect,
  withEffects,
};

const runtimeFacadeBase = {
  ExternalDependencyFailedError,
  PersistenceFailedError,
  createPersistenceFailedError,
  getOperationRuntimeContext,
  getCurrentInvocationContext,
  layer,
  reportError: reportOperationError,
  reportOperationError,
  reportOperationWarning,
  reportWarning: reportOperationWarning,
  runServerEffect,
  serverContext,
  toContextRecord,
  withInvocationContext,
};

const authFacadeBase = {
  currentPrincipal: getCurrentPrincipal,
  requirePrincipal,
};

const createTaskFacadeBase = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
) => {
  const configured = createConfiguredTaskFacade(definition.task);

  return {
    ...configured,
    createInMemoryTaskStorage,
    createInProcessTaskExecutor,
    createInProcessTaskRuntime,
    inProcessTasks,
    define: defineTask,
    defineTask,
    defineStep: defineTaskStep,
    defineTaskStep,
    startTask,
  };
};

type TaskFacadeBase = ReturnType<typeof createTaskFacadeBase<unknown, ArchitectureDefinition<any>>>;

const createConfiguredOperationRawRun = (
  config: Pick<ArchitectureDefinition<any>, 'task'>,
): ConfiguredOperationRawRun => {
  const configuredTasks = createConfiguredTaskFacade(config.task);

  return ((operation: AnyResolvedDomainOperation, input: object) =>
    runConfiguredServerDomainOperationRaw(operation, input as never, (task, taskInput, options) =>
      configuredTasks.start(task, taskInput, options),
    )) as ConfiguredOperationRawRun;
};

const createConfiguredOperationInvoke = (
  config: Pick<ArchitectureDefinition<any>, 'task'>,
): ConfiguredOperationInvoke => {
  const configuredTasks = createConfiguredTaskFacade(config.task);

  return ((operation: AnyResolvedDomainOperation, input: object) =>
    invokeConfiguredServerDomainOperation(operation, input as never, (task, taskInput, options) =>
      configuredTasks.start(task, taskInput, options),
    )) as ConfiguredOperationInvoke;
};

const createConfiguredProjectedOperationInvoke = (): ConfiguredProjectedOperationInvoke =>
  ((operation, input, projection) =>
    invokeConfiguredProjectedDomainOperation(
      operation,
      input as never,
      projection,
    )) as ConfiguredProjectedOperationInvoke;

type EntityRefTarget = Pick<AnyEntityDefinition, 'name'> | string;

const resolveEntityRefTarget = (
  entityOrName: unknown,
  graphEntity: unknown,
): EntityRefTarget | undefined => {
  if (typeof entityOrName === 'string') {
    return entityOrName;
  }

  if (
    entityOrName &&
    typeof entityOrName === 'object' &&
    'name' in entityOrName &&
    typeof (entityOrName as { name?: unknown }).name === 'string'
  ) {
    return entityOrName as Pick<AnyEntityDefinition, 'name'>;
  }

  if (
    graphEntity &&
    typeof graphEntity === 'object' &&
    'entityName' in graphEntity &&
    typeof (graphEntity as { entityName?: unknown }).entityName === 'string'
  ) {
    return (graphEntity as { entityName: string }).entityName;
  }

  return undefined;
};

const getDomainOperations = (graphEntity: unknown): Record<string, unknown> =>
  graphEntity &&
  typeof graphEntity === 'object' &&
  'domain' in graphEntity &&
  graphEntity.domain &&
  typeof graphEntity.domain === 'object'
    ? (graphEntity.domain as Record<string, unknown>)
    : {};

const attachConfiguredEntityRefLocators = (
  entityOrName: unknown,
  graphEntity: object,
  invokeConfigured: ConfiguredOperationInvoke,
) => {
  const entityRefTarget = resolveEntityRefTarget(entityOrName, graphEntity);
  const domainOperations = getDomainOperations(graphEntity);

  if (!entityRefTarget) {
    return graphEntity;
  }

  const bindRelationships = <TRef extends EntityRef>(ref: TRef) =>
    typeof entityOrName === 'object' && entityOrName !== null && 'relations' in entityOrName
      ? bindEntityRefRelationshipCommands(ref, entityOrName as AnyEntityDefinition)
      : ref;

  const locators = <TLocators extends EntityRefLocatorDeclarations>(
    locatorDeclarations: TLocators,
  ) =>
    Object.assign(
      graphEntity,
      Object.fromEntries(
        Object.entries(locatorDeclarations).map(([name, toLocator]) => [
          name,
          (...args: readonly unknown[]) =>
            bindEntityRefOperationProxy(
              bindRelationships(createEntityRef(entityRefTarget, toLocator(...args))),
              domainOperations,
              {
                run: ({ operation, input }) =>
                  invokeConfigured(
                    operation as Parameters<typeof invokeConfiguredServerDomainOperation>[0],
                    input as never,
                  ),
              },
            ),
        ]),
      ),
    );

  return Object.assign(graphEntity, {
    ref: (locator: EntityRefLocator) =>
      bindEntityRefOperationProxy(
        bindRelationships(createEntityRef(entityRefTarget, locator)),
        domainOperations,
        {
          run: ({ operation, input }) =>
            invokeConfigured(
              operation as Parameters<typeof invokeConfiguredServerDomainOperation>[0],
              input as never,
            ),
        },
      ),
    locators,
  });
};

type GraphFacadeBase = typeof graphFacadeBase & {
  refProvider: GraphEntityRefProvider;
};

type GraphFacade<TDefinition> = MergedNamespace<
  GraphFacadeBase,
  NamespaceOverride<TDefinition, 'graph'>
>;

type ConfiguredOperationFacadeBase = Omit<typeof operationFacadeBase, 'invoke' | 'runRaw'> & {
  invoke: ConfiguredOperationInvoke;
  inspectProjected: ConfiguredProjectedOperationInspect;
  invokeProjected: ConfiguredProjectedOperationInvoke;
  runRaw: ConfiguredOperationRawRun;
};

type OperationFacade<TDefinition> = MergedNamespace<
  ConfiguredOperationFacadeBase,
  NamespaceOverride<TDefinition, 'operation'>
>;

type IngressFacade<TDefinition> = MergedNamespace<
  typeof ingressFacadeBase,
  NamespaceOverride<TDefinition, 'ingress'>
>;

type RequireFacade<TDefinition> = MergedNamespace<
  typeof requireFacadeBase,
  NamespaceOverride<TDefinition, 'require'>
>;

type ConcernFacade<TDefinition> = MergedNamespace<
  typeof concernFacadeBase,
  NamespaceOverride<TDefinition, 'concern'>
>;

type ValidationFacade<TDefinition> = MergedNamespace<
  typeof validationFacadeBase,
  NamespaceOverride<TDefinition, 'validation'>
>;

type CacheFacade<TDefinition> = MergedNamespace<
  typeof cacheFacadeBase,
  NamespaceOverride<TDefinition, 'cache'>
>;

type EffectsFacade<TEvent, TDefinition extends ArchitectureDefinition<TEvent>> = MergedNamespace<
  typeof effectsFacadeBase & {
    effectors: TDefinition['effectors'] extends undefined
      ? {}
      : NonNullable<TDefinition['effectors']>;
  },
  NamespaceOverride<TDefinition, 'effects'>
>;

type RuntimeFacade<TDefinition> = MergedNamespace<
  MergedNamespace<typeof runtimeFacadeBase, NamespaceOverride<TDefinition, 'server'>>,
  NamespaceOverride<TDefinition, 'runtime'>
>;

type AuthFacade<TDefinition> = MergedNamespace<
  typeof authFacadeBase,
  NamespaceOverride<TDefinition, 'auth'>
>;

type TaskFacade<TDefinition> = MergedNamespace<
  TaskFacadeBase,
  NamespaceOverride<TDefinition, 'task'>
>;

const createGraphFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): GraphFacade<TDefinition> => {
  const invokeConfigured = createConfiguredOperationInvoke(definition);
  const refProvider = ((
    entityOrName: EntityRefTarget,
    operations: Record<string, unknown>,
    toLocator: (...args: readonly unknown[]) => EntityRefLocator,
  ) =>
    (...args: readonly unknown[]) =>
      bindEntityRefOperationProxy(
        typeof entityOrName === 'object' && 'relations' in entityOrName
          ? bindEntityRefRelationshipCommands(
              createEntityRef(entityOrName, toLocator(...args)),
              entityOrName as AnyEntityDefinition,
            )
          : createEntityRef(entityOrName, toLocator(...args)),
        operations,
        {
          run: ({ operation, input }) =>
            invokeConfigured(
              operation as Parameters<typeof invokeConfiguredServerDomainOperation>[0],
              input as never,
            ),
        },
      )) as unknown as GraphEntityRefProvider;
  const graphFacade = mergeNamespace(
    {
      ...graphFacadeBase,
      refProvider,
    },
    definition.graph,
  ) as Record<string, unknown>;

  if (typeof graphFacade.defineEntity !== 'function') {
    return graphFacade as unknown as GraphFacade<TDefinition>;
  }

  const configuredTasks = createConfiguredTaskFacade(definition.task);
  const defineEntity = graphFacade.defineEntity as (
    entity: unknown,
    config?: Record<string, unknown> & {
      locators?: EntityRefLocatorDeclarations;
      tasks?: TaskDeclarations;
    },
  ) => object;
  const defineEntityWithTasks = (
    entity: unknown,
    config?: Record<string, unknown> & {
      locators?: EntityRefLocatorDeclarations;
      tasks?: TaskDeclarations;
    },
  ) => {
    const { locators, tasks, ...graphConfig } = config ?? {};
    let graphEntity = attachConfiguredEntityRefLocators(
      entity,
      defineEntity(entity, graphConfig),
      invokeConfigured,
    );
    const entityLocators =
      entity &&
      typeof entity === 'object' &&
      'refLocators' in entity &&
      entity.refLocators &&
      typeof entity.refLocators === 'object'
        ? (entity.refLocators as EntityRefLocatorDeclarations)
        : undefined;

    if (
      entityLocators &&
      Object.keys(entityLocators).length > 0 &&
      'locators' in graphEntity &&
      typeof graphEntity.locators === 'function'
    ) {
      graphEntity = graphEntity.locators(entityLocators) as object;
    }

    if (locators && 'locators' in graphEntity && typeof graphEntity.locators === 'function') {
      graphEntity = graphEntity.locators(locators) as object;
    }

    return tasks ? configuredTasks.defineForEntity(graphEntity, tasks) : graphEntity;
  };

  return {
    ...graphFacade,
    defineEntity: defineEntityWithTasks,
    defineGraphEntity: defineEntityWithTasks,
  } as unknown as GraphFacade<TDefinition>;
};

const createOperationFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): OperationFacade<TDefinition> => {
  const runRaw = createConfiguredOperationRawRun(definition);
  const invoke = createConfiguredOperationInvoke(definition);
  const invokeProjected = createConfiguredProjectedOperationInvoke();
  const configuredOperationFacade = {
    ...operationFacadeBase,
    invoke,
    inspectProjected: inspectProjectedDomainOperationQuery,
    invokeProjected,
    runRaw,
  };

  return mergeNamespace(
    configuredOperationFacade,
    definition.operation,
  ) as unknown as OperationFacade<TDefinition>;
};

const createRequireFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): RequireFacade<TDefinition> =>
  mergeNamespace(requireFacadeBase, definition.require) as unknown as RequireFacade<TDefinition>;

const createIngressFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): IngressFacade<TDefinition> =>
  mergeNamespace(ingressFacadeBase, definition.ingress) as unknown as IngressFacade<TDefinition>;

const createConcernFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): ConcernFacade<TDefinition> =>
  mergeNamespace(concernFacadeBase, definition.concern) as unknown as ConcernFacade<TDefinition>;

const createValidationFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): ValidationFacade<TDefinition> =>
  mergeNamespace(
    validationFacadeBase,
    definition.validation,
  ) as unknown as ValidationFacade<TDefinition>;

const createCacheFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): CacheFacade<TDefinition> =>
  mergeNamespace(cacheFacadeBase, definition.cache) as unknown as CacheFacade<TDefinition>;

const createEffectsFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): EffectsFacade<TEvent, TDefinition> =>
  mergeNamespace(
    {
      ...effectsFacadeBase,
      effectors: definition.effectors ?? {},
    },
    definition.effects,
  ) as unknown as EffectsFacade<TEvent, TDefinition>;

const createRuntimeFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): RuntimeFacade<TDefinition> =>
  mergeNamespace(
    mergeNamespace(runtimeFacadeBase, definition.server),
    definition.runtime,
  ) as unknown as RuntimeFacade<TDefinition>;

const createAuthFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): AuthFacade<TDefinition> =>
  mergeNamespace(authFacadeBase, definition.auth) as unknown as AuthFacade<TDefinition>;

const createTaskFacade = <TEvent, TDefinition extends ArchitectureDefinition<TEvent>>(
  definition: TDefinition,
): TaskFacade<TDefinition> =>
  mergeNamespace(
    createTaskFacadeBase<TEvent, TDefinition>(definition),
    definition.task,
  ) as unknown as TaskFacade<TDefinition>;

export type ArchitectureAppFacade<
  TEvent = unknown,
  TDefinition extends ArchitectureDefinition<TEvent> = ArchitectureDefinition<TEvent>,
> = {
  graph: GraphFacade<TDefinition>;
  operation: OperationFacade<TDefinition>;
  ingress: IngressFacade<TDefinition>;
  require: RequireFacade<TDefinition>;
  concern: ConcernFacade<TDefinition>;
  validation: ValidationFacade<TDefinition>;
  cache: CacheFacade<TDefinition>;
  effects: EffectsFacade<TEvent, TDefinition>;
  runtime: RuntimeFacade<TDefinition>;
  auth: AuthFacade<TDefinition>;
  task: TaskFacade<TDefinition>;
};

export type RegisteredArchitecture<
  TEvent = unknown,
  TDefinition extends ArchitectureDefinition<TEvent> = ArchitectureDefinition<TEvent>,
> = TDefinition & {
  app: ArchitectureAppFacade<TEvent, TDefinition>;
};

export const createArchitectureAppFacade = <
  TEvent = unknown,
  TDefinition extends ArchitectureDefinition<TEvent> = ArchitectureDefinition<TEvent>,
>(
  definition: TDefinition,
): ArchitectureAppFacade<TEvent, TDefinition> => ({
  graph: createGraphFacade<TEvent, TDefinition>(definition),
  operation: createOperationFacade<TEvent, TDefinition>(definition),
  ingress: createIngressFacade<TEvent, TDefinition>(definition),
  require: createRequireFacade<TEvent, TDefinition>(definition),
  concern: createConcernFacade<TEvent, TDefinition>(definition),
  validation: createValidationFacade<TEvent, TDefinition>(definition),
  cache: createCacheFacade<TEvent, TDefinition>(definition),
  effects: createEffectsFacade<TEvent, TDefinition>(definition),
  runtime: createRuntimeFacade<TEvent, TDefinition>(definition),
  auth: createAuthFacade<TEvent, TDefinition>(definition),
  task: createTaskFacade<TEvent, TDefinition>(definition),
});

export type {
  NamespaceOverride as ArchitectureNamespaceOverride,
  MergedNamespace as ArchitectureMergedNamespace,
};
