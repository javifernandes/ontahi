import { Effect } from 'effect';

import { missingTaskStepFailure, toTaskFailure } from './failures.js';
import type {
  InProcessTaskExecutorOptions,
  InProcessTaskRuntimeOptions,
  TaskExecutor,
  TaskContext,
  TaskRunRef,
  TaskRuntime,
  TaskSnapshot,
} from './types.js';
import {
  validateTaskInput,
  validateTaskOutput,
  validateTaskProgress,
  validateTaskStepInput,
  validateTaskStepOutput,
} from './validation.js';

const now = () => new Date().toISOString();

let fallbackRunIdSequence = 0;

const createRunId = () =>
  globalThis.crypto?.randomUUID() ?? `task-${Date.now()}-${++fallbackRunIdSequence}`;

const toTaskRunRef = (snapshot: TaskSnapshot): TaskRunRef => ({
  taskId: snapshot.taskId,
  runId: snapshot.runId,
  status: snapshot.status,
  ...(snapshot.subject ? { subject: snapshot.subject } : {}),
});

export const createInProcessTaskRuntime = ({
  storage,
  sleep = milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
  createRunId: createConfiguredRunId = createRunId,
  onBackgroundError,
}: InProcessTaskRuntimeOptions): TaskRuntime => ({
  start: (task, input, options) =>
    Effect.gen(function* () {
      const parsedInput = yield* validateTaskInput(task, input);
      const runId = options?.runId ?? createConfiguredRunId();
      const ref = { taskId: task.id, runId };
      const snapshot = yield* storage.create({
        ...ref,
        input: parsedInput,
        trigger: options?.trigger,
        subject: options?.subject,
      });
      const source = yield* storage.loadSource(ref);
      const context: TaskContext = {
        ...ref,
        ...(source.subject ? { subject: source.subject } : {}),
        trigger: source.trigger,
        createdAt: source.createdAt,
        progress: progress =>
          Effect.flatMap(validateTaskProgress(task, progress), parsedProgress =>
            storage.update(ref, { progress: parsedProgress }),
          ),
        sleep: milliseconds =>
          Effect.tryPromise({
            try: () => sleep(milliseconds),
            catch: toTaskFailure,
          }),
        step: (stepOrName: string | { id: string }, input: unknown) => {
          const name = typeof stepOrName === 'string' ? stepOrName : stepOrName.id;
          const step = task.steps?.[name];

          return step
            ? Effect.flatMap(validateTaskStepInput(task.id, step, input), parsedInput =>
                Effect.flatMap(step.run(parsedInput, context), output =>
                  validateTaskStepOutput(task.id, step, output),
                ),
              )
            : Effect.fail(missingTaskStepFailure(task.id, name));
        },
      };
      const background = Effect.gen(function* () {
        yield* storage.update(ref, {
          status: 'running',
          startedAt: now(),
        });
        const result = yield* task.run(parsedInput, context);
        const parsedResult = yield* validateTaskOutput(task, result);
        yield* storage.update(ref, {
          status: 'completed',
          completedAt: now(),
          result: parsedResult,
        });
      }).pipe(
        Effect.catchAll(error =>
          storage.update(ref, {
            status: 'failed',
            completedAt: now(),
            error: {
              code: error.reason,
              message: error.message,
            },
          }),
        ),
      );

      void Effect.runPromise(background).catch(error => onBackgroundError?.(error));
      return toTaskRunRef(snapshot);
    }),
  getSnapshot: ref => storage.getSnapshot(ref),
  listRecent: limit => storage.listRecent(limit),
});

export const createInProcessTaskExecutor = (
  options: InProcessTaskExecutorOptions = {},
): TaskExecutor => ({
  createRuntime: storage =>
    createInProcessTaskRuntime({
      ...options,
      storage,
    }),
});
