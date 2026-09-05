import { Chunk, Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineTask } from './definitions.js';
import { observeTaskRun } from './facade.js';
import { createInProcessTaskRuntime } from './in-process-adapter.js';
import { createInMemoryTaskStorage } from './memory-store.js';
import type { TaskFailure, TaskRuntime } from './types.js';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(innerResolve => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};

describe('TaskRun observation', () => {
  it('emits in-process lifecycle writes through the observable TaskRun projection', async () => {
    const releaseProgress = createDeferred();
    const releaseCompletion = createDeferred();
    const observedInitial = createDeferred();
    const observedProgress = createDeferred();
    const runtime = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      createRunId: () => 'run-1',
    });
    const task = defineTask({
      id: 'TodoItem.completeAll',
      run: (_input: void, context) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => releaseProgress.promise);
          yield* context.progress({ phase: 'todos', percent: 50 });
          yield* Effect.promise(() => releaseCompletion.promise);
          return { completed: 2 };
        }),
    });
    const run = await Effect.runPromise(runtime.start(task, undefined));
    const observation = Effect.runPromise(
      observeTaskRun(runtime, run).pipe(
        Stream.tap(snapshot =>
          Effect.sync(() => {
            observedInitial.resolve();
            if (snapshot.progress?.percent === 50) observedProgress.resolve();
          }),
        ),
        Stream.takeUntil(snapshot => snapshot.status === 'completed'),
        Stream.runCollect,
      ),
    );

    await observedInitial.promise;
    releaseProgress.resolve();
    await observedProgress.promise;
    releaseCompletion.resolve();

    const snapshots = Chunk.toReadonlyArray(await observation);

    expect(snapshots.some(snapshot => snapshot.status === 'running')).toBe(true);
    expect(snapshots.some(snapshot => snapshot.progress?.percent === 50)).toBe(true);
    expect(snapshots.at(-1)).toMatchObject({
      taskId: 'TodoItem.completeAll',
      runId: 'run-1',
      status: 'completed',
      progress: { phase: 'todos', percent: 50 },
      result: { completed: 2 },
    });
  });

  it('emits terminal Task failures from the same observable projection', async () => {
    const releaseFailure = createDeferred();
    const observedInitial = createDeferred();
    const runtime = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      createRunId: () => 'run-failed',
    });
    const task = defineTask({
      id: 'TodoItem.failAll',
      run: () =>
        Effect.gen(function* () {
          yield* Effect.promise(() => releaseFailure.promise);
          return yield* Effect.fail({
            reason: 'todo_failure',
            message: 'Todo processing failed.',
          } satisfies TaskFailure);
        }),
    });
    const run = await Effect.runPromise(runtime.start(task, undefined));
    const observation = Effect.runPromise(
      observeTaskRun(runtime, run).pipe(
        Stream.tap(() => Effect.sync(observedInitial.resolve)),
        Stream.takeUntil(snapshot => snapshot.status === 'failed'),
        Stream.runCollect,
      ),
    );

    await observedInitial.promise;
    releaseFailure.resolve();

    expect(Chunk.toReadonlyArray(await observation).at(-1)).toMatchObject({
      taskId: 'TodoItem.failAll',
      runId: 'run-failed',
      status: 'failed',
      error: {
        code: 'todo_failure',
        message: 'Todo processing failed.',
      },
    });
  });

  it('fails explicitly when a Task runtime has no observation capability', async () => {
    const failure = {
      reason: 'unused',
      message: 'Unused test runtime method.',
    } satisfies TaskFailure;
    const runtime = {
      start: () => Effect.fail(failure),
      getSnapshot: () => Effect.fail(failure),
      listRecent: () => Effect.succeed([]),
    } satisfies TaskRuntime;

    const result = await Effect.runPromise(
      observeTaskRun(runtime, {
        taskId: 'TodoItem.completeAll',
        runId: 'run-1',
      }).pipe(Stream.runDrain, Effect.either),
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'task_run_observation_unavailable',
        message: 'Task run observation is unavailable.',
        taskId: 'TodoItem.completeAll',
        runId: 'run-1',
      },
    });
  });
});
