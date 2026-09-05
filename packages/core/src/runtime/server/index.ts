export { applyLayerConcerns, combineConcerns } from './concerns.js';
export {
  createArchitectureAppFacade,
  type ArchitectureAppFacade,
  type ArchitectureMergedNamespace,
  type ArchitectureNamespaceOverride,
  type RegisteredArchitecture,
} from './app-facade.js';
export {
  defineOntahiApplication,
  type DefineOntahiApplicationFromEntitiesOptions,
  type DefineOntahiApplicationOptions,
  type OntahiApplication,
} from './application.js';
export {
  ontahi,
  type ApplicationGraphReadObserverFactory,
  type ApplicationGraphReadDispatcherFactory,
  type ApplicationGraphCommandDispatcherFactory,
  type OntahiBinderApp,
  type ComposedOntahiApplication,
  type GraphReadableOntahiApplication,
  type GraphObservableOntahiApplication,
  type GraphCommandableOntahiApplication,
  type OntahiApplicationBuilder,
  type OntahiCapabilities,
  type OntahiOptions,
} from './ontahi.js';
export {
  bindOntahiEntity,
  entity,
  entityModule,
  entityModuleWithCapabilities,
  getOntahiSemanticEntities,
  isOntahiEntityDeclaration,
  operationGroup,
  relation,
  relationConstraint,
  relationModule,
  relationModuleWithCapabilities,
  resolveOntahiEntityReferences,
  semanticEntityRef,
  type AnyOntahiEntityDeclaration,
  type BoundOntahiEntity,
  type BoundOntahiEntityDeclaration,
  type OntahiEntityBindingContext,
  type OntahiEntityCommandCatalog,
  type OntahiEntityCommands,
  type OntahiEntityConfig,
  type OntahiEntityContract,
  type OntahiEntityDeclaration,
  type OntahiEntityModule,
  type OntahiEntityOperationContext,
  type OntahiOperationGroup,
  type OntahiOperationGroupContext,
  type OntahiOperationGroupDeclaration,
  type OntahiRelationDeclaration,
  type OntahiRelationModule,
  type OntahiSemanticEntityRef,
  type OntahiSemanticEntityTarget,
} from './entity.js';
export {
  DATA_GRAPH_RUNTIME_RESOURCE_KEY,
  getCurrentDataGraphRuntime,
  getRequiredDataGraphRuntime,
  getRequiredDataGraphRuntimeEffect,
  withDataGraphTransaction,
  withDataGraph,
  type WithDataGraphOptions,
} from './data-graph.js';
export {
  createDataGraphArchitectureAdapter,
  type DataGraphArchitectureAdapterOptions,
} from './data-graph-app-adapter.js';
export {
  collectFeaturesFromGraph,
  collectFeaturesFromGraphOperations,
  deriveFeatureProviderKey,
  type CollectFeaturesFromGraphOptions,
  type Feature,
  type GraphFeatureOperation,
} from './features.js';
export {
  contract,
  contractFromGraphSchema,
  contractFromTypia,
  contractFromZod,
  contractFromValidation,
  createTypiaValidationMessageFormatter,
  typiaFieldMessage,
  type CreateTypiaValidationMessageFormatterOptions,
  type ContractFromGraphSchemaOptions,
  type ContractFromTypiaOptions,
  type ContractFromZodOptions,
  type ContractFromValidationOptions,
  type TypiaRequiredStringMessageOptions,
  type TypiaFieldMessageRule,
  type ValidationResult,
} from './concerns/contract.js';
export type {
  ContractCheckFailure,
  OpaqueOperationContracts,
  ContractPostCheck,
  ContractPreCheck,
} from './concerns/contract-types.js';
export {
  getDefaultDefectLogMessage,
  getDefaultDefectPublicMessage,
  getLayerScope,
} from './scope.js';
export {
  architecture,
  getArchitecture,
  getArchitectureEffectors,
  resolveArchitectureLayerDefaults,
} from './architecture-registry.js';
export {
  deriveArgsInputRecord,
  getServerContextResources,
  getOrCreateServerContextResource,
  memoizeInServerContext,
  getOperationRuntimeContext,
  getRequiredOperationRuntimeContext,
  operationRuntimeContextStorage,
  serverContext,
  toContextRecord,
} from './context.js';
export {
  getCurrentUnitOfWork,
  getRequiredUnitOfWork,
  withChildUnitOfWork,
  type ChildUnitOfWorkOptions,
  type UnitOfWork,
  type UnitOfWorkRefResolutionApi,
  type UnitOfWorkRefResolutionOptions,
} from './unit-of-work.js';
export {
  createContextResourceApi,
  createServerRuntimeResources,
  getOrCreateContextResource,
  type ServerContextResourceApi,
  type ServerRuntimeResourceMap,
} from './context-resources.js';
export {
  authenticated,
  getCurrentPrincipal,
  requirePrincipal,
  type AuthenticatedRequirementOptions,
  type RequirePrincipalOptions,
} from './authentication.js';
export {
  getCurrentInvocationContext,
  withInvocationContext,
  type InvocationContext,
  type InvocationContextInput,
  type Principal,
} from './invocation-context.js';
export type {
  RateLimitResult,
  ServerRuntimeConfig,
  ServerRuntimeDiagnostics,
  ServerRuntimeRateLimitAdapter,
  ServerRuntimeReportingAdapter,
  ServerRuntimeTelemetryAdapter,
  ServerRuntimeTelemetryInput,
} from './config-types.js';
export {
  configureServerRuntime,
  getServerRuntimeConfig,
  resetServerRuntimeForTests,
} from './config.js';
export {
  createServerRuntimeTelemetryAdapter,
  getRuntimeTelemetryAttributes,
  markRuntimeFailure,
  markRuntimeSuccess,
  withRuntimeSpan,
} from './telemetry.js';
export {
  toOperationInvocationResult,
  operationInputInvalid,
  operationRejected,
  readOperationSuccessValue,
  toOperationValidationIssues,
  type OperationErrored,
  type OperationFailed,
  type OperationInputInvalid,
  type OperationInvocationResult,
  type OperationRejected,
  type OperationSuccess,
  type OperationValidationIssue,
} from './operation-result.js';
export {
  createOperationInvocationDispatcher,
  type CreateOperationInvocationDispatcherOptions,
  type OperationInvocationExecutor,
  type OperationInvocationOperation,
  type OperationInvocationResolver,
  type OperationPermissionChecker,
} from './operation-invocation.js';
export { layer, operation, runServerOperation } from './dsl.js';
export {
  defineDomainOperation,
  defineDomainOperationsForEntity,
  checkServerDomainOperationPermission,
  createTaskDefinitionFromDurableDomainOperation,
  invokeConfiguredServerDomainOperation,
  invokeServerDomainOperation,
  runConfiguredServerDomainOperationRaw,
  runServerDomainOperationRaw,
  type DomainOperationBridgeMetadata,
  type DomainOperationCacheMetadata,
  type DomainOperationDeclaration,
  type DomainOperationDeclarations,
  type DomainOperationEffectsMetadata,
  type HydratedOperationInput,
  type HydratedSemanticSelection,
  type DomainOperationRun,
  type DomainOperationSuccess,
  type DomainOperationPermissionResult,
  type ResolvedDomainOperationDeclaration,
} from './domain-operations.js';
export {
  createOperationFailure,
  createPersistenceFailedError,
  failOperation,
  isOperationFailure,
  isOperationRuntimeError,
  reportOperationError,
  reportOperationWarning,
} from './failures.js';
export {
  attempt,
  attemptEvent,
  event,
  executeEffectIntents,
  isEffectSuccessPayload,
  normalizeEffectSuccess,
  run,
  tryEffect,
  withEffects,
} from './intents.js';
export type {
  EffectIntent,
  Effectors,
  EffectSuccessPayload,
  EventEffectIntent,
  RunEffectIntent,
  TryEffectIntent,
  UnwrapEffectSuccess,
} from './effect-intents/types.js';
export {
  reportExpectedFailure,
  serializeExpectedFailure,
  serializeFailure,
} from './operation/result.js';
export {
  ExternalDependencyFailedError,
  PersistenceFailedError,
  type EffectFailureKind,
  type FailureResult,
  type OperationFailure,
  type OperationInfraError,
  type OperationResult,
  type OperationRuntimeError,
  type SuccessResult,
} from './operation/types.js';
export { RateLimitExceededError, byRequester, input, rateLimit } from './concerns/rate-limit.js';
export type { RateLimitPolicy } from './concerns/rate-limit-policy.js';
export {
  buildRateLimitCounterKey,
  createInMemoryRateLimitCounterStore,
  createStoreBackedRateLimitAdapter,
  getRateLimitPolicyId,
  parseRateLimitWindowToSeconds,
  type AcquireRateLimitErrorContext,
  type CreateStoreBackedRateLimitAdapterOptions,
  type RateLimitCounterStore,
  type ReleaseRateLimitErrorContext,
} from './rate-limit-adapter.js';
export { combineRequirements } from './requirements.js';
export { runServerEffect } from './runtime-effect.js';
export {
  createInMemoryTaskStorage,
  createInProcessTaskExecutor,
  createInProcessTaskRuntime,
  createConfiguredTaskFacade,
  defineTask,
  defineTaskStep,
  createSystemTaskTrigger,
  createUserTaskTrigger,
  getTaskSnapshot,
  listRecentTasks,
  observeTaskRun,
  normalizeTaskTrigger,
  inProcessTasks,
  startTask,
  taskTriggerActorMatches,
  validateTaskInput,
  validateTaskStepInput,
  type InProcessTaskExecutorOptions,
  type InProcessTaskRuntimeOptions,
  type InProcessTasksOptions,
  type TaskActor,
  type TaskConfig,
  type TaskContext,
  type TaskDeclarations,
  type TaskDefinition,
  type TaskDefinitionDeclaration,
  type TaskExecutor,
  type TaskFailure,
  type TaskMethod,
  type TaskMethods,
  type TaskRunCreateInput,
  type TaskRunEntity,
  type TaskRunIdentity,
  type TaskRunListItem,
  type TaskRunRef,
  type TaskRunSource,
  type TaskRuntimeRef,
  type TaskSnapshot,
  type TaskStartOptions,
  type TaskStorage,
  type TaskStorageControl,
  type TaskStorageEngine,
  type TaskStatus,
  type TaskStepDeclarations,
  type TaskStepDefinition,
  type TaskStepInput,
  type TaskStepRegistry,
  type TaskStepResult,
  type TaskSubject,
  type TaskTrigger,
  type TaskRuntime,
  TaskRun,
  TaskRunByIdentity,
  createInMemoryTaskRunProjection,
  type TaskRunProjection,
} from './tasks.js';
export { failIfError, fromNullable, fromValueOrPromise } from './values.js';
export type {
  LayerConcern,
  LayerConcernRuntime,
  LayerEffectOptions,
  LayerOptions,
  LayerScopedOptions,
} from './layer-types.js';
export type { ArchitectureDefinition, ArchitectureLayerDefaults } from './architecture-types.js';
export type { OperationRuntimeContext, ServerOperationContext } from './context-types.js';
export type {
  LayerOperationOptions,
  OperationCacheConfig,
  OperationEffectsConfig,
  OperationOptions,
  OperationRunner,
  RunServerOperationOptions,
} from './operation/options-types.js';
export type {
  OperationFeatureRequirement,
  OperationInput,
  OperationRequirement,
  OperationRequirementBindingContext,
} from './operation/requirement-types.js';
export { valueRef } from './operation/value-ref.js';
export type {
  BoundRuntimeValueRefs,
  RuntimeValueRefDeclaration,
  RuntimeValueRefDeclarations,
  ServerRuntimeValueRef,
} from './operation/value-ref.js';
