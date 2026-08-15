import { Effect } from 'effect';

import { normalizeGraphSchemaClientInput } from '../../data-graph/client-input.js';
import { GraphCommand } from '../../data-graph/command.js';
import {
  graphSchema,
  type AnyEntityDefinition,
  type GraphSchemaDefinition,
  type GraphSchemaLike,
  type GraphSelectionDefinition,
  type InferGraphSchemaValue,
} from '../../data-graph/definitions.js';
import {
  attachOperationInputSchema,
  type OperationInputSchema,
} from '../../data-graph/operation-input.js';
import {
  resolveDomainOperations,
  type DurableOperationDeclarationMetadata,
  type DomainOperationBridgeMetadata,
  type DomainOperationDefaults,
  type DomainOperationGraphOpsMetadata,
  type DomainOperationMetadata,
  type ResolveDomainOperations,
} from '../../data-graph/operations.js';
import type { GraphOutputDescriptor } from '../../data-graph/output/index.js';
import type { GraphReadSpec } from '../../data-graph/query.js';
import {
  attachEntityRefInputRefs,
  normalizeEntityRefInput,
  type EntityRefInputDeclarations,
  type EntityRefInputPublicInput,
  type EntityRefInputRunInput,
} from '../../data-graph/ref.js';
import { RelationRootSelection } from '../../data-graph/relation-root.js';
import {
  createRuntimeBoundDataGraphApi,
  type RuntimeBoundSelection,
} from '../../data-graph/runtime-bound-api.js';
import type { DataGraphExecutionRuntime } from '../../data-graph/runtime.js';
import type { SemanticSelection } from '../../data-graph/selection-ast.js';
import { Selection } from '../../data-graph/selection-value.js';
import { GraphSelection } from '../../data-graph/selection.js';
import type { RecursiveEntityViewDefinition } from '../../data-graph/view.js';

import type { OperationContracts } from './concerns/contract-types.js';
import {
  getOperationRuntimeContext,
  operationRuntimeContextStorage,
  toContextRecord,
} from './context.js';
import { getRequiredDataGraphRuntime } from './data-graph.js';
import { layer } from './dsl.js';
import type { EffectSuccessPayload } from './effect-intents/types.js';
import { getCurrentInvocationContext } from './invocation-context.js';
import type { LayerConcern } from './layer-types.js';
import type { OperationCacheConfig, OperationEffectsConfig } from './operation/options-types.js';
import type { OperationInput, OperationRequirement } from './operation/requirement-types.js';
import { runServerOperation } from './operation/run.js';
import type {
  OperationRuntimeError,
  OperationResult,
  SuccessResult,
  OperationFailure,
} from './operation/types.js';
import type { ServerRuntimeValueRef } from './operation/value-ref.js';
import { toOperationInvocationResult, type OperationInvocationResult } from './operation-result.js';
import { bindRequirements } from './requirements.js';
import type {
  TaskContext,
  TaskDefinition,
  TaskFailure,
  TaskRunRef,
  TaskStartOptions,
  TaskStepDefinition,
  TaskSubject,
  TaskTrigger,
} from './tasks/types.js';

export type OperationSchema<TValue = unknown> = GraphSchemaLike<TValue>;

type InputSchemaLike<TInput> = OperationSchema<TInput>;
type OutputSchemaLike<TResult = unknown> = OperationSchema<TResult>;
const EmptyInputSchema = graphSchema.object({});

const operationInputDataGraph = createRuntimeBoundDataGraphApi<
  OperationRuntimeError,
  undefined,
  undefined,
  OperationRuntimeError
>(() =>
  getRequiredDataGraphRuntime<
    DataGraphExecutionRuntime<OperationRuntimeError, undefined, undefined, OperationRuntimeError>
  >(),
);

export type DomainOperationSuccess = unknown;

export type HydratedSemanticSelection<
  TEntity extends AnyEntityDefinition,
  TCardinality extends 'one' | 'many' | undefined = 'one' | 'many' | undefined,
> = RuntimeBoundSelection<
  TEntity,
  TCardinality,
  OperationRuntimeError,
  undefined,
  undefined,
  OperationRuntimeError
>;

export type HydratedOperationInput<TInput> =
  TInput extends SemanticSelection<any, infer TEntity, infer TCardinality>
    ? TEntity extends AnyEntityDefinition
      ? HydratedSemanticSelection<TEntity, TCardinality>
      : TInput
    : TInput extends Date
      ? TInput
      : TInput extends (infer TItem)[]
        ? HydratedOperationInput<TItem>[]
        : TInput extends readonly (infer TItem)[]
          ? readonly HydratedOperationInput<TItem>[]
          : TInput extends object
            ? { [TKey in keyof TInput]: HydratedOperationInput<TInput[TKey]> }
            : TInput;

type DomainOperationGraphRead<TResult> = TResult extends readonly (infer TItem)[]
  ? { build: () => GraphReadSpec<any, TItem> }
  : never;

type AnyDomainOperationGraphRead = { build: () => GraphReadSpec<any, any> };

const isDomainOperationGraphRead = (value: unknown): value is AnyDomainOperationGraphRead =>
  value instanceof GraphSelection || value instanceof RelationRootSelection;

export type DomainOperationRun<
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess = DomainOperationSuccess,
  TFailure extends OperationFailure = OperationFailure,
  TInfraError extends OperationRuntimeError = never,
> = (
  input: TInput,
  context?: TaskContext,
) =>
  | Effect.Effect<TResult | EffectSuccessPayload<TResult>, TFailure | TInfraError>
  | GraphCommand<any, any, TResult>
  | DomainOperationGraphRead<TResult>
  | Selection<any, any>;

export type DomainOperationCacheMetadata<TInput extends OperationInput> =
  OperationCacheConfig<TInput>;

export type DomainOperationEffectsMetadata<
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
> = Omit<OperationEffectsConfig<TInput, TResult>, 'affects'> & {
  affects?: (args: {
    input: TInput;
    result: SuccessResult<TResult>;
  }) => ReadonlyArray<ServerRuntimeValueRef>;
};

type ServerDomainOperationMetadata<
  TInput extends OperationInput = OperationInput,
  TResult extends DomainOperationSuccess = DomainOperationSuccess,
> = Omit<
  DomainOperationMetadata<TInput, DomainOperationCacheMetadata<TInput>, TResult>,
  'authority' | 'exposure' | 'durable'
> &
  Partial<
    Pick<
      DomainOperationMetadata<TInput, DomainOperationCacheMetadata<TInput>, TResult>,
      'authority' | 'exposure'
    >
  > & {
    durable?: DurableOperationDeclarationMetadata<TInput, TResult>;
  };

export type DomainOperationDeclaration<
  TInput extends OperationInput = OperationInput,
  TResult extends DomainOperationSuccess = DomainOperationSuccess,
  TFailure extends OperationFailure = OperationFailure,
  TInfraError extends OperationRuntimeError = never,
  TInputRefs extends EntityRefInputDeclarations = {},
> = ServerDomainOperationMetadata<TInput, TResult> & {
  input?: InputSchemaLike<TInput>;
  output?: OutputSchemaLike<TResult>;
  graphOutput?: GraphOutputDescriptor;
  inputRefs?: TInputRefs;
  graphOps?: DomainOperationGraphOpsMetadata;
  layer?: string;
  run: DomainOperationRun<
    EntityRefInputRunInput<HydratedOperationInput<NoInfer<TInput>>, TInputRefs>,
    TResult,
    TFailure,
    TInfraError
  >;
  defectLogMessage?: string;
  defectPublicMessage?: string;
  extra?: (input: TInput) => Record<string, unknown>;
  telemetrySpanName?: string;
  requires?: ReadonlyArray<OperationRequirement<TInput>>;
  concerns?: ReadonlyArray<LayerConcern<TInput, unknown>>;
  contracts?: OperationContracts<TInput, TResult, TFailure>;
  effects?: DomainOperationEffectsMetadata<TInput, TResult>;
  onSuccess?: (args: {
    input: TInput;
    result: OperationResult<TResult, TFailure>;
  }) => Promise<unknown> | unknown;
  onStarted?: (args: {
    input: TInput;
    result: OperationResult<TaskRunRef, TFailure | TaskFailure>;
  }) => Promise<unknown> | unknown;
};

export type DomainOperationDeclarations = Record<
  string,
  DomainOperationDeclaration<any, any, any, any, any>
>;

export type InferOperationSchemaValue<TSchema extends GraphSchemaDefinition> =
  InferGraphSchemaValue<TSchema>;

export type ResolvedDomainOperationDeclaration<
  TInput extends OperationInput = OperationInput,
  TResult extends DomainOperationSuccess = DomainOperationSuccess,
  TFailure extends OperationFailure = OperationFailure,
  TInfraError extends OperationRuntimeError = never,
  TInputRefs extends EntityRefInputDeclarations = {},
> = Omit<DomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>, 'run'> & {
  id: string;
  entityName: string;
  name: string;
  authority: 'server';
  exposure: Exclude<DomainOperationMetadata<TInput>['exposure'], undefined>;
  input: InputSchemaLike<TInput>;
  layer: string;
  run: DomainOperationRun<any, TResult, TFailure, TInfraError>;
};

type DefinedDomainOperation<
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
  TInputRefs extends EntityRefInputDeclarations,
> = DomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs> & {
  authority: 'server';
  input: OperationInputSchema<InputSchemaLike<TInput>, TInput>;
};

type DefineDomainOperation = {
  <
    TInput extends OperationInput,
    TResult extends DomainOperationSuccess,
    TFailure extends OperationFailure = OperationFailure,
    TInfraError extends OperationRuntimeError = never,
    TInputRefs extends EntityRefInputDeclarations = {},
  >(
    operation: Omit<
      DomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>,
      'kind' | 'durable'
    > & {
      durable: DurableOperationDeclarationMetadata<TInput, TResult>;
    },
  ): DefinedDomainOperation<TInput, TResult, TFailure, TInfraError, TInputRefs> & {
    durable: DurableOperationDeclarationMetadata<TInput, TResult>;
  };
  <
    TInput extends OperationInput,
    TResult extends DomainOperationSuccess,
    TFailure extends OperationFailure = OperationFailure,
    TInfraError extends OperationRuntimeError = never,
    TInputRefs extends EntityRefInputDeclarations = {},
  >(
    operation: Omit<
      DomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>,
      'kind'
    >,
  ): DefinedDomainOperation<TInput, TResult, TFailure, TInfraError, TInputRefs>;
};

const defineDomainOperationImplementation = (
  operation: Omit<DomainOperationDeclaration<any, any, any, any, any>, 'kind'>,
) => ({
  kind: 'domain-operation',
  authority: 'server',
  ...operation,
  input: attachOperationInputSchema((operation.input ?? EmptyInputSchema) as InputSchemaLike<any>),
});

export const defineDomainOperation = defineDomainOperationImplementation as DefineDomainOperation;

export const defineDomainOperationsForEntity = <
  TEntity extends { name: string } | string,
  TOperations extends DomainOperationDeclarations,
>(
  entityOrName: TEntity,
  operations: TOperations,
  defaults?: DomainOperationDefaults,
): ResolveDomainOperations<
  TEntity extends string
    ? TEntity
    : TEntity extends { name: infer TName extends string }
      ? TName
      : never,
  TOperations
> =>
  resolveDomainOperations(
    typeof entityOrName === 'string' ? entityOrName : entityOrName.name,
    operations,
    defaults,
  ) as ResolveDomainOperations<
    TEntity extends string
      ? TEntity
      : TEntity extends { name: infer TName extends string }
        ? TName
        : never,
    TOperations
  >;

type DomainOperationRunner<
  TInput extends OperationInput = OperationInput,
  TResult extends DomainOperationSuccess = DomainOperationSuccess,
  TFailure extends OperationFailure = OperationFailure,
  TInputRefs extends EntityRefInputDeclarations = {},
> = (
  input: EntityRefInputPublicInput<TInput, TInputRefs>,
) => Promise<OperationResult<TResult, TFailure>>;

const operationRunnerCache = new WeakMap<object, DomainOperationRunner<any, any, any, any>>();

const normalizeDomainOperationInput = (
  operation: ResolvedDomainOperationDeclaration<any, any, any, any>,
  input: EntityRefInputPublicInput<any, any>,
) =>
  normalizeEntityRefInput(
    normalizeGraphSchemaClientInput(operation.input, input, {
      bindSelection: selection => operationInputDataGraph.bindSelection(selection),
    }) as object,
    operation.inputRefs,
  );

export const inspectProjectedDomainOperationQuery = (
  operation: ResolvedDomainOperationDeclaration<any, any, any, any>,
  input: OperationInput,
  view: RecursiveEntityViewDefinition<any, any, any>,
): GraphReadSpec<any, any> => {
  const normalizedInput = normalizeDomainOperationInput(operation, input);
  const result = operation.run(attachEntityRefInputRefs(normalizedInput, operation.inputRefs));
  const read =
    result instanceof Selection
      ? operationInputDataGraph.bindSelection(result)
      : result instanceof GraphSelection
        ? result
        : undefined;
  if (!read) {
    throw new Error(
      `Projectable operation "${operation.id}" must return a declarative Selection before materialization.`,
    );
  }
  return read.as(view).build();
};

const executeDomainOperationRunResult = <TResult, TFailure, TInfraError>(
  result:
    | Effect.Effect<TResult, TFailure | TInfraError>
    | GraphCommand<any, any, TResult>
    | AnyDomainOperationGraphRead
    | Selection<any, any>,
  selectionExecution?: {
    view?: RecursiveEntityViewDefinition<any, any, any>;
    cardinality: 'one' | 'many';
  },
): Effect.Effect<TResult, TFailure | TInfraError> =>
  result instanceof GraphCommand
    ? Effect.sync(() =>
        getRequiredDataGraphRuntime<
          DataGraphExecutionRuntime<unknown, unknown, unknown, unknown>
        >(),
      ).pipe(
        Effect.flatMap(runtime => runtime.runCommand<TResult>(result.build())),
        Effect.orDie,
      )
    : isDomainOperationGraphRead(result) || result instanceof Selection
      ? (Effect.sync(() =>
          getRequiredDataGraphRuntime<
            DataGraphExecutionRuntime<unknown, unknown, unknown, unknown>
          >(),
        ).pipe(
          Effect.flatMap(runtime => {
            const read =
              result instanceof Selection ? operationInputDataGraph.bindSelection(result) : result;
            const spec = (
              selectionExecution?.view
                ? (read as GraphSelection<any, any>).as(selectionExecution.view).build()
                : read.build()
            ) as GraphReadSpec<any, any>;
            return selectionExecution?.cardinality === 'one'
              ? runtime.get(spec, undefined)
              : runtime.run(spec, undefined);
          }),
          Effect.orDie,
        ) as unknown as Effect.Effect<TResult, TFailure | TInfraError>)
      : result;

const resolveDomainOperationRunner = <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
  TInputRefs extends EntityRefInputDeclarations,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>,
  projection?: {
    view: RecursiveEntityViewDefinition<any, any, any>;
    cardinality: 'one' | 'many';
  },
): DomainOperationRunner<TInput, TResult, TFailure, TInputRefs> => {
  const cached = projection ? undefined : operationRunnerCache.get(operation);

  if (cached) {
    return cached as DomainOperationRunner<TInput, TResult, TFailure, TInputRefs>;
  }

  const normalizeOperationInput = (
    input: EntityRefInputPublicInput<TInput, TInputRefs>,
  ): EntityRefInputPublicInput<TInput, TInputRefs> =>
    normalizeDomainOperationInput(operation, input) as EntityRefInputPublicInput<
      TInput,
      TInputRefs
    >;

  const runOperation = (
    input: EntityRefInputPublicInput<TInput, TInputRefs>,
  ): Effect.Effect<TResult | EffectSuccessPayload<TResult>, TFailure | TInfraError> =>
    executeDomainOperationRunResult(
      operation.run(attachEntityRefInputRefs(input, operation.inputRefs) as never),
      projection ??
        (operation.output?.kind === 'schema.selection'
          ? { cardinality: (operation.output as GraphSelectionDefinition).cardinality }
          : undefined),
    );

  const normalizedRunner = layer(operation.layer).operation(operation.name, runOperation, {
    defectLogMessage: operation.defectLogMessage,
    defectPublicMessage: operation.defectPublicMessage,
    extra: operation.extra,
    telemetrySpanName: operation.telemetrySpanName,
    requires: bindRequirements(operation.requires, {
      operationId: operation.id,
      description: operation.description,
      scope: operation.id,
    }),
    concerns: operation.concerns,
    contracts: operation.contracts,
    cache: operation.cache,
    effects: operation.effects,
  } as never) as DomainOperationRunner<TInput, TResult, TFailure, TInputRefs>;
  const runner = ((input: EntityRefInputPublicInput<TInput, TInputRefs>) =>
    normalizedRunner(normalizeOperationInput(input) as never)) as DomainOperationRunner<
    TInput,
    TResult,
    TFailure,
    TInputRefs
  >;

  if (!projection) operationRunnerCache.set(operation, runner);
  return runner;
};

export const runServerDomainOperationRaw = <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
  TInputRefs extends EntityRefInputDeclarations,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>,
  input: EntityRefInputPublicInput<TInput, TInputRefs>,
) => resolveDomainOperationRunner(operation)(input);

const isDurableOperation = (operation: ResolvedDomainOperationDeclaration<any, any, any, any>) =>
  Boolean(operation.durable);

const runDomainOperationSuccessHook = async <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
  TInputRefs extends EntityRefInputDeclarations,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>,
  input: EntityRefInputPublicInput<TInput, TInputRefs>,
  result: OperationResult<unknown, OperationFailure>,
) => {
  if (!result.success) {
    return;
  }

  if (isDurableOperation(operation)) {
    await operation.onStarted?.({
      input: input as TInput,
      result: result as OperationResult<TaskRunRef, TFailure | TaskFailure>,
    });
  } else if (operation.onSuccess) {
    await operation.onSuccess({
      input: input as TInput,
      result: result as OperationResult<TResult, TFailure>,
    });
  }
};

export const invokeServerDomainOperation = async <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
  TInputRefs extends EntityRefInputDeclarations,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, TFailure, TInfraError, TInputRefs>,
  input: EntityRefInputPublicInput<TInput, TInputRefs>,
): Promise<OperationInvocationResult<TResult, TFailure>> => {
  const result = await runServerDomainOperationRaw(operation, input);

  await runDomainOperationSuccessHook<TInput, TResult, TFailure, TInfraError, TInputRefs>(
    operation,
    input,
    result,
  );

  return toOperationInvocationResult<TResult, TFailure>(result);
};

const resolveDurableOperationTaskId = (
  operation: ResolvedDomainOperationDeclaration<any, any, any, any>,
) => operation.durable?.taskId ?? operation.id;

export const createTaskDefinitionFromDurableDomainOperation = <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, any, any>,
): TaskDefinition<TInput, TResult> => {
  if (!operation.durable) {
    throw new Error(`Domain operation "${operation.id}" is not durable.`);
  }

  return {
    id: resolveDurableOperationTaskId(operation),
    input: operation.input,
    progress: operation.durable.progress,
    output: operation.durable.finalOutput,
    steps: Object.fromEntries(
      (operation.durable.steps ?? []).map(step => [step.id, step as TaskStepDefinition<any, any>]),
    ),
    run: ((input, context) =>
      executeDomainOperationRunResult(
        operation.run(attachEntityRefInputRefs(input, operation.inputRefs) as never, context),
      )) as TaskDefinition<TInput, TResult>['run'],
  };
};

const resolveDurableOperationTrigger = <TInput extends OperationInput>(
  operation: ResolvedDomainOperationDeclaration<TInput, any, any, any>,
  input: TInput,
): TaskTrigger => {
  const durable = operation.durable;
  const trigger =
    typeof durable?.trigger === 'function' ? durable.trigger(input) : durable?.trigger;
  const baseTrigger: TaskTrigger = trigger ?? {
    cause: 'system',
  };

  return durable?.source
    ? {
        ...baseTrigger,
        source: {
          ...baseTrigger.source,
          ...durable.source,
        },
      }
    : baseTrigger;
};

const resolveDurableOperationSubject = <TInput extends OperationInput>(
  operation: ResolvedDomainOperationDeclaration<TInput, any, any, any>,
  input: TInput,
): TaskSubject | undefined => operation.durable?.subject?.(input);

type DurableOperationStart = <TInput extends OperationInput>(
  task: TaskDefinition<TInput, unknown>,
  input: TInput,
  options?: TaskStartOptions,
) => Effect.Effect<TaskRunRef, TaskFailure>;

const durableOperationRunnerCache = new WeakMap<object, DomainOperationRunner<any, any, any>>();

const resolveDurableDomainOperationRunner = <
  TInput extends OperationInput,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
>(
  operation: ResolvedDomainOperationDeclaration<
    TInput,
    DomainOperationSuccess,
    TFailure,
    TInfraError
  >,
  startDurableOperation: DurableOperationStart,
): DomainOperationRunner<TInput, TaskRunRef, TFailure | TaskFailure> => {
  const cached = durableOperationRunnerCache.get(operation);

  if (cached) {
    return cached as DomainOperationRunner<TInput, TaskRunRef, TFailure | TaskFailure>;
  }

  const runner = layer(operation.layer).operation(
    operation.name,
    (input: TInput) =>
      startDurableOperation(createTaskDefinitionFromDurableDomainOperation(operation), input, {
        trigger: resolveDurableOperationTrigger(operation, input),
        subject: resolveDurableOperationSubject(operation, input),
      }),
    {
      defectLogMessage: operation.defectLogMessage,
      defectPublicMessage: operation.defectPublicMessage,
      extra: operation.extra,
      telemetrySpanName: operation.telemetrySpanName,
      requires: bindRequirements(operation.requires, {
        operationId: operation.id,
        description: operation.description,
        scope: operation.id,
      }),
      concerns: operation.concerns,
      contracts: operation.contracts,
      cache: operation.cache,
      effects: operation.effects as never,
    } as never,
  ) as DomainOperationRunner<TInput, TaskRunRef, TFailure | TaskFailure>;

  durableOperationRunnerCache.set(operation, runner);
  return runner;
};

export const runConfiguredServerDomainOperationRaw = <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, TFailure, TInfraError>,
  input: TInput,
  startDurableOperation: DurableOperationStart,
) =>
  isDurableOperation(operation)
    ? resolveDurableDomainOperationRunner(
        operation as ResolvedDomainOperationDeclaration<
          TInput,
          DomainOperationSuccess,
          TFailure,
          TInfraError
        >,
        startDurableOperation,
      )(input as EntityRefInputPublicInput<TInput, {}>)
    : resolveDomainOperationRunner(operation)(input as EntityRefInputPublicInput<TInput, {}>);

export const invokeConfiguredServerDomainOperation = async <
  TInput extends OperationInput,
  TResult extends DomainOperationSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError,
>(
  operation: ResolvedDomainOperationDeclaration<TInput, TResult, TFailure, TInfraError>,
  input: TInput,
  startDurableOperation: DurableOperationStart,
): Promise<OperationInvocationResult<TResult | TaskRunRef, TFailure | TaskFailure>> => {
  const result = await runConfiguredServerDomainOperationRaw(
    operation,
    input,
    startDurableOperation,
  );

  await runDomainOperationSuccessHook<TInput, TResult, TFailure, TInfraError, {}>(
    operation,
    input as EntityRefInputPublicInput<TInput, {}>,
    result,
  );

  return toOperationInvocationResult<TResult | TaskRunRef, TFailure | TaskFailure>(result);
};

export const invokeConfiguredProjectedDomainOperation = async (
  operation: ResolvedDomainOperationDeclaration<any, any, any, any>,
  input: OperationInput,
  projection: {
    view: RecursiveEntityViewDefinition<any, any, any>;
    cardinality: 'one' | 'many';
  },
): Promise<OperationInvocationResult> => {
  if (isDurableOperation(operation)) {
    throw new Error(`Durable operation "${operation.id}" cannot return a projectable Selection.`);
  }
  const result = await resolveDomainOperationRunner(operation, projection)(input);
  await runDomainOperationSuccessHook(operation, input, result);
  return toOperationInvocationResult(result);
};

export type DomainOperationPermissionResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: string;
      message: string;
    };

export const checkServerDomainOperationPermission = async (
  operation: ResolvedDomainOperationDeclaration<any, any, any, any>,
  input: unknown,
): Promise<DomainOperationPermissionResult> => {
  const requirements = bindRequirements(operation.requires, {
    operationId: operation.id,
    description: operation.description,
    scope: operation.id,
  });

  if (!requirements?.length) {
    return {
      allowed: true,
    };
  }

  const inputRecord = toContextRecord(input as OperationInput);
  const parentContext = getOperationRuntimeContext();
  const invocationContext = getCurrentInvocationContext();
  const context = {
    scope: operation.id,
    telemetrySpanName: `${operation.id}.permission`,
    input: inputRecord,
    extra: inputRecord,
    resources:
      parentContext?.resources ?? invocationContext?.resources ?? new Map<string, unknown>(),
  };
  const effect = Effect.forEach(
    requirements,
    requirement => requirement.run(input as OperationInput),
    {
      concurrency: 1,
      discard: true,
    },
  );

  const result = await operationRuntimeContextStorage.run(context, () =>
    runServerOperation(effect, {
      scope: operation.id,
      telemetrySpanName: `${operation.id}.permission`,
      defectLogMessage: `Unexpected failure while checking ${operation.id} permissions`,
      defectPublicMessage: 'Failed to check permissions',
      extra: inputRecord,
    }),
  );

  return result.success
    ? {
        allowed: true,
      }
    : {
        allowed: false,
        reason: result.reason,
        message: result.message,
      };
};

export type { DomainOperationBridgeMetadata };
