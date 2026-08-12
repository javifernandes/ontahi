import { Effect } from 'effect';

import type {
  TaskConfig,
  TaskDeclarations,
  TaskDefinition,
  TaskFailure,
  TaskMethods,
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
