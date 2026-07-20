import { Effect } from 'effect';

import type {
  TaskArchitectureConfig,
  TaskDeclarations,
  TaskDefinition,
  TaskFailure,
  TaskMethods,
  TaskRunRef,
  TaskRuntimeAdapter,
  TaskRuntimeAdapterStartOptions,
} from './types.js';

const createTaskFailure = (reason: string, message: string): TaskFailure => ({
  reason,
  message,
});

export const startTask = <TInput, TResult>(
  adapter: TaskRuntimeAdapter,
  task: TaskDefinition<TInput, TResult>,
  input: TInput,
  options?: TaskRuntimeAdapterStartOptions,
) => adapter.start(task, input, options);

export const getTaskSnapshot = (
  adapter: TaskRuntimeAdapter,
  ref: Pick<TaskRunRef, 'taskId' | 'runId'>,
) => adapter.getSnapshot(ref);

export const listRecentTasks = (adapter: TaskRuntimeAdapter, limit?: number) =>
  adapter.listRecent(limit);

export const createConfiguredTaskFacade = (config: TaskArchitectureConfig = {}) => {
  const getAdapter = (): Effect.Effect<TaskRuntimeAdapter, TaskFailure> =>
    config.adapter
      ? Effect.succeed(config.adapter)
      : Effect.fail(
          createTaskFailure(
            'task_adapter_missing',
            'No task runtime adapter is configured for this architecture.',
          ),
        );

  const start = <TInput, TResult>(
    task: TaskDefinition<TInput, TResult>,
    input: TInput,
    options?: TaskRuntimeAdapterStartOptions,
  ) =>
    Effect.gen(function* () {
      const adapter = yield* getAdapter();
      return yield* startTask(adapter, task, input, options);
    });

  return {
    start,
    getSnapshot: (ref: Pick<TaskRunRef, 'taskId' | 'runId'>) =>
      Effect.gen(function* () {
        const adapter = yield* getAdapter();
        return yield* getTaskSnapshot(adapter, ref);
      }),
    listRecent: (limit?: number) =>
      Effect.gen(function* () {
        const adapter = yield* getAdapter();
        return yield* listRecentTasks(adapter, limit);
      }),
    defineForEntity: <TEntity extends object, TTasks extends TaskDeclarations>(
      entity: TEntity,
      tasks: TTasks,
    ): TEntity & TaskMethods<TTasks> & { tasks: TaskMethods<TTasks>; taskDefinitions: TTasks } => {
      const methods = Object.fromEntries(
        Object.entries(tasks).map(([name, task]) => [
          name,
          (input: unknown, options?: TaskRuntimeAdapterStartOptions) => start(task, input, options),
        ]),
      ) as TaskMethods<TTasks>;

      return Object.assign(entity, methods, {
        tasks: methods,
        taskDefinitions: tasks,
      });
    },
  };
};
