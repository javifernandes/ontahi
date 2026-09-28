import { Effect, Stream } from 'effect';

import {
  taskInteractionUnavailableFailure,
  taskRunObservationUnavailableFailure,
} from './failures.js';
import type {
  TaskConfig,
  TaskDeclarations,
  TaskDefinition,
  TaskFailure,
  TaskMethods,
  TaskInteractionResponse,
  TaskRunIdentity,
  TaskRuntime,
  TaskStartOptions,
} from './types.js';

const createTaskFailure = (reason: string, message: string): TaskFailure => ({
  reason,
  message,
});

export const startTask = <TInput, TResult>(
  runtime: TaskRuntime,
  task: TaskDefinition<TInput, TResult>,
  input: TInput,
  options?: TaskStartOptions,
) => runtime.start(task, input, options);

export const getTaskSnapshot = (runtime: TaskRuntime, ref: TaskRunIdentity) =>
  runtime.getSnapshot(ref);

export const listRecentTasks = (runtime: TaskRuntime, limit?: number) => runtime.listRecent(limit);

export const respondToTaskInteraction = (
  runtime: TaskRuntime,
  ref: TaskRunIdentity,
  response: TaskInteractionResponse,
) =>
  runtime.respondToInteraction
    ? runtime.respondToInteraction(ref, response)
    : Effect.fail(taskInteractionUnavailableFailure(ref));

export const observeTaskRun = (runtime: TaskRuntime, ref: TaskRunIdentity) =>
  runtime.observe ? runtime.observe(ref) : Stream.fail(taskRunObservationUnavailableFailure(ref));

export const createConfiguredTaskFacade = (config: TaskConfig = {}) => {
  const configuredRuntime =
    config.runtime ??
    (config.executor && config.storage ? config.executor.createRuntime(config.storage) : undefined);
  const getRuntime = (): Effect.Effect<TaskRuntime, TaskFailure> =>
    configuredRuntime
      ? Effect.succeed(configuredRuntime)
      : Effect.fail(
          createTaskFailure(
            'task_runtime_missing',
            'Task execution requires both an executor and storage.',
          ),
        );

  const start = <TInput, TResult>(
    task: TaskDefinition<TInput, TResult>,
    input: TInput,
    options?: TaskStartOptions,
  ) =>
    Effect.gen(function* () {
      const runtime = yield* getRuntime();
      return yield* startTask(runtime, task, input, options);
    });

  return {
    start,
    getSnapshot: (ref: TaskRunIdentity) =>
      Effect.gen(function* () {
        const runtime = yield* getRuntime();
        return yield* getTaskSnapshot(runtime, ref);
      }),
    observe: (ref: TaskRunIdentity) =>
      Stream.unwrap(Effect.map(getRuntime(), runtime => observeTaskRun(runtime, ref))),
    respondToInteraction: (ref: TaskRunIdentity, response: TaskInteractionResponse) =>
      Effect.gen(function* () {
        const runtime = yield* getRuntime();
        return yield* respondToTaskInteraction(runtime, ref, response);
      }),
    listRecent: (limit?: number) =>
      Effect.gen(function* () {
        const runtime = yield* getRuntime();
        return yield* listRecentTasks(runtime, limit);
      }),
    defineForEntity: <TEntity extends object, TTasks extends TaskDeclarations>(
      entity: TEntity,
      tasks: TTasks,
    ): TEntity & TaskMethods<TTasks> & { tasks: TaskMethods<TTasks>; taskDefinitions: TTasks } => {
      const methods = Object.fromEntries(
        Object.entries(tasks).map(([name, task]) => [
          name,
          (input: unknown, options?: TaskStartOptions) => start(task, input, options),
        ]),
      ) as TaskMethods<TTasks>;

      return Object.assign(entity, methods, {
        tasks: methods,
        taskDefinitions: tasks,
      });
    },
  };
};
