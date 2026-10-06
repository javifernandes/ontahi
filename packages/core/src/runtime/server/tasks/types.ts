import type { Effect, Stream } from 'effect';

import type { GraphSchemaLike } from '../../../data-graph/definitions.js';
import type { JsonValue } from '../../../value/json.js';
import type {
  TaskActor,
  TaskApprovalInteractionResponse,
  TaskApprovalProposal,
  TaskExecutionCheckpoint,
  TaskInteractionResponse,
  TaskInteractionResponseContext,
  TaskRunListItem,
  TaskRunIdentity,
  TaskRunRef,
  TaskRunSource,
  TaskRuntimeRef,
  TaskSnapshot,
  TaskSubject,
  TaskTrigger,
} from '../../contracts.js';
import type { OperationRuntimeContext } from '../context-types.js';
import type { OperationFailure } from '../operation/types.js';

export type {
  TaskActor,
  TaskApprovalInteractionResponse,
  TaskApprovalProposal,
  TaskChoiceInteractionOption,
  TaskChoiceInteractionResponse,
  TaskInputInteractionResponse,
  TaskInteractionResponse,
  TaskInteractionResponseContext,
  TaskExecutionCheckpoint,
  TaskPendingChoiceInteraction,
  TaskPendingInputInteraction,
  TaskPendingApprovalInteraction,
  TaskPendingInteraction,
  TaskRunListItem,
  TaskRunIdentity,
  TaskRunRef,
  TaskRunSource,
  TaskRuntimeRef,
  TaskSnapshot,
  TaskStatus,
  TaskSubject,
  TaskTrigger,
} from '../../contracts.js';

export type TaskFailure = OperationFailure<string, Record<string, unknown>>;

export type TaskChoiceInteractionRequest<TValue> = {
  id?: string;
  prompt: string;
  options: ReadonlyArray<{
    id: string;
    label: string;
    value: TValue;
  }>;
};

export type TaskInputInteractionRequest = {
  id?: string;
  prompt: string;
  input: { type: 'string' };
};

export type TaskApprovalInteractionRequest = {
  id?: string;
  prompt: string;
  proposal: TaskApprovalProposal;
};

export type TaskApprovalDecision = Omit<TaskApprovalInteractionResponse, 'interactionId'>;

export type TaskInteractionContext = {
  choice<TValue>(request: TaskChoiceInteractionRequest<TValue>): Effect.Effect<TValue, TaskFailure>;
  input(request: TaskInputInteractionRequest): Effect.Effect<string, TaskFailure>;
  approval(
    request: TaskApprovalInteractionRequest,
  ): Effect.Effect<TaskApprovalDecision, TaskFailure>;
};

export type TaskExecutionState = { readonly step: string };

export type TaskExecutionInteractionRequest =
  | TaskChoiceInteractionRequest<JsonValue>
  | TaskInputInteractionRequest
  | TaskApprovalInteractionRequest;

export type TaskExecutionTransition<TState extends TaskExecutionState, TResult> =
  | { readonly kind: 'continue'; readonly state: TState }
  | {
      readonly kind: 'interaction';
      readonly state: TState;
      readonly interaction: TaskExecutionInteractionRequest;
    }
  | { readonly kind: 'complete'; readonly result: TResult };

export type TaskExecutionStepContext = Omit<TaskContext, 'interact' | 'step'>;

export type TaskExecutionStepDefinition<TInput, TState extends TaskExecutionState, TResult> = {
  run(args: {
    readonly input: TInput;
    readonly state: TState;
    readonly response?: TaskInteractionResponse;
    readonly context: TaskExecutionStepContext;
  }): Effect.Effect<TaskExecutionTransition<TState, TResult>, TaskFailure>;
};

export type TaskExecutionDefinition<TInput, TState extends TaskExecutionState, TResult> = {
  initial(input: TInput): TState;
  steps: Readonly<Record<string, TaskExecutionStepDefinition<TInput, TState, TResult>>>;
};

export type TaskSchema<TValue = unknown> = GraphSchemaLike<TValue>;

export type TaskRunCreateInput = TaskRunIdentity & {
  input?: unknown;
  trigger?: TaskTrigger;
  subject?: TaskSubject;
  runtime?: TaskRuntimeRef;
};

export type TaskStorageControl = {
  create(input: TaskRunCreateInput): Effect.Effect<TaskRunSource, TaskFailure>;
  getSnapshot(ref: TaskRunIdentity): Effect.Effect<TaskSnapshot, TaskFailure>;
  listRecent(limit?: number): Effect.Effect<TaskRunListItem[], TaskFailure>;
  listRecentForActor(
    actor: TaskActor,
    limit?: number,
  ): Effect.Effect<TaskRunListItem[], TaskFailure>;
};

export type TaskStorageEngine = {
  loadSource(ref: TaskRunIdentity): Effect.Effect<TaskRunSource, TaskFailure>;
  attachRuntimeRef(
    ref: TaskRunIdentity,
    runtime: TaskRuntimeRef,
  ): Effect.Effect<TaskSnapshot, TaskFailure>;
  update(
    ref: TaskRunIdentity,
    patch: Partial<TaskRunSource>,
  ): Effect.Effect<TaskSnapshot, TaskFailure>;
  claimInteraction(
    ref: TaskRunIdentity,
    interactionId: string,
    checkpoint: TaskExecutionCheckpoint,
  ): Effect.Effect<TaskSnapshot | undefined, TaskFailure>;
};

export type TaskStorage = TaskStorageControl &
  TaskStorageEngine & {
    get(ref: TaskRunIdentity): Effect.Effect<TaskSnapshot, TaskFailure>;
  };

export type TaskContext = TaskRunIdentity &
  Pick<TaskRunRef, 'subject'> & {
    trigger: TaskTrigger;
    createdAt?: string;
    interact: TaskInteractionContext;
    progress(
      progress: NonNullable<TaskSnapshot['progress']>,
    ): Effect.Effect<TaskSnapshot, TaskFailure>;
    sleep(milliseconds: number): Effect.Effect<void, TaskFailure>;
    step<TStep extends TaskStepDefinition<any, any>>(
      step: TStep,
      input: TaskStepInput<TStep>,
    ): Effect.Effect<TaskStepResult<TStep>, TaskFailure>;
    step<TInput, TResult>(name: string, input: TInput): Effect.Effect<TResult, TaskFailure>;
  };

export type TaskStepDefinition<TInput, TResult> = {
  id: string;
  input?: TaskSchema<TInput>;
  output?: TaskSchema<TResult>;
  run(input: TInput, context: TaskContext): Effect.Effect<TResult, TaskFailure>;
};

export type TaskStepInput<TStep> =
  TStep extends TaskStepDefinition<infer TInput, any> ? TInput : never;

export type TaskStepResult<TStep> =
  TStep extends TaskStepDefinition<any, infer TResult> ? TResult : never;

export type TaskStepRegistry = Record<string, TaskStepDefinition<any, any>>;

export type TaskStepDeclarations = TaskStepRegistry | ReadonlyArray<TaskStepDefinition<any, any>>;

export type TaskDefinition<TInput, TResult> = {
  id: string;
  input?: TaskSchema<TInput>;
  progress?: TaskSchema<NonNullable<TaskSnapshot['progress']>>;
  output?: TaskSchema<TResult>;
  steps?: TaskStepRegistry;
  execution?: TaskExecutionDefinition<TInput, TaskExecutionState, TResult>;
  run(input: TInput, context: TaskContext): Effect.Effect<TResult, TaskFailure>;
};

export type TaskDefinitionDeclaration<TInput, TResult> = Omit<
  TaskDefinition<TInput, TResult>,
  'steps'
> & {
  steps?: TaskStepDeclarations;
};

export type TaskDeclarations = Record<string, TaskDefinition<any, any>>;

export type TaskStartOptions = {
  runId?: string;
  trigger?: TaskTrigger;
  subject?: TaskSubject;
};

export type TaskMethod<TTask> =
  TTask extends TaskDefinition<infer TInput, any>
    ? (input: TInput, options?: TaskStartOptions) => Effect.Effect<TaskRunRef, TaskFailure>
    : never;

export type TaskMethods<TTasks extends TaskDeclarations> = {
  [TName in keyof TTasks]: TaskMethod<TTasks[TName]>;
};

export type TaskRuntime = {
  register?<TInput, TResult>(task: TaskDefinition<TInput, TResult>): void;
  start<TInput, TResult>(
    task: TaskDefinition<TInput, TResult>,
    input: TInput,
    options?: TaskStartOptions,
  ): Effect.Effect<TaskRunRef, TaskFailure>;
  getSnapshot(ref: TaskRunIdentity): Effect.Effect<TaskSnapshot, TaskFailure>;
  listRecent(limit?: number): Effect.Effect<TaskRunListItem[], TaskFailure>;
  respondToInteraction?(
    ref: TaskRunIdentity,
    response: TaskInteractionResponse,
    context: TaskInteractionResponseContext,
  ): Effect.Effect<TaskSnapshot, TaskFailure>;
  observe?(ref: TaskRunIdentity): Stream.Stream<TaskSnapshot, TaskFailure>;
};

export type TaskExecutor = {
  createRuntime(storage: TaskStorage, options?: TaskRuntimeHostOptions): TaskRuntime;
};

export type TaskRuntimeHostOptions = {
  createExecutionContext?: (source: TaskRunSource) => OperationRuntimeContext | undefined;
};

export type TaskConfig = {
  executor?: TaskExecutor;
  storage?: TaskStorage;
  runtime?: TaskRuntime;
  host?: TaskRuntimeHostOptions;
};

export type InProcessTaskExecutorOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  createRunId?: () => string;
  onBackgroundError?: (error: unknown) => void;
};

export type InProcessTasksOptions = InProcessTaskExecutorOptions &
  TaskRuntimeHostOptions & {
    storage?: TaskStorage;
  };

export type InProcessTaskRuntimeOptions = InProcessTaskExecutorOptions &
  TaskRuntimeHostOptions & {
    storage: TaskStorage;
  };
