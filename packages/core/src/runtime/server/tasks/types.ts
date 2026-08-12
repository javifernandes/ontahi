import type { Effect } from 'effect';

import type { GraphSchemaLike } from '../../../data-graph/definitions.js';
import type {
  TaskActor,
  TaskRunListItem,
  TaskRunIdentity,
  TaskRunRef,
  TaskRunSource,
  TaskRuntimeRef,
  TaskSnapshot,
  TaskSubject,
  TaskTrigger,
} from '../../contracts.js';
import type { OperationFailure } from '../operation/types.js';

export type {
  TaskActor,
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
};

export type TaskStorage = TaskStorageControl &
  TaskStorageEngine & {
    get(ref: TaskRunIdentity): Effect.Effect<TaskSnapshot, TaskFailure>;
  };

export type TaskContext = TaskRunIdentity &
  Pick<TaskRunRef, 'subject'> & {
    trigger: TaskTrigger;
    createdAt?: string;
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
  start<TInput, TResult>(
    task: TaskDefinition<TInput, TResult>,
    input: TInput,
    options?: TaskStartOptions,
  ): Effect.Effect<TaskRunRef, TaskFailure>;
  getSnapshot(ref: TaskRunIdentity): Effect.Effect<TaskSnapshot, TaskFailure>;
  listRecent(limit?: number): Effect.Effect<TaskRunListItem[], TaskFailure>;
};

export type TaskExecutor = {
  createRuntime(storage: TaskStorage): TaskRuntime;
};

export type TaskConfig = {
  executor?: TaskExecutor;
  storage?: TaskStorage;
  runtime?: TaskRuntime;
};

export type InProcessTaskExecutorOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  createRunId?: () => string;
  onBackgroundError?: (error: unknown) => void;
};

export type InProcessTasksOptions = InProcessTaskExecutorOptions & {
  storage?: TaskStorage;
};

export type InProcessTaskRuntimeOptions = InProcessTaskExecutorOptions & {
  storage: TaskStorage;
};
