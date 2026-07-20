import 'server-only';

import {
  validateTaskInput,
  validateTaskStepInput,
  type TaskContext,
  type TaskFailure,
  type TaskRunRef,
  type TaskRunSource,
  type TaskSnapshot,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { sleep as workflowSleep } from 'workflow';

import type {
  VercelTaskStepRunner,
  VercelTaskStepWorkflowInput,
  VercelTaskWorkflowInput,
  VercelWorkflowTaskExecutorOptions,
} from './contracts.js';

export type {
  VercelTaskStepRunner,
  VercelTaskStepWorkflow,
  VercelTaskStepWorkflowInput,
  VercelTaskWorkflow,
  VercelTaskWorkflowInput,
  VercelWorkflowTaskExecutorOptions,
  VercelWorkflowTaskExecutorStore,
} from './contracts.js';

const now = () => new Date().toISOString();

const createTaskWorkflowFailure = (
  reason: string,
  message: string,
  extra?: Record<string, unknown>,
): TaskFailure => ({
  reason,
  message,
  ...(extra ?? {}),
});

const isTaskFailure = (value: unknown): value is TaskFailure =>
  typeof value === 'object' &&
  value !== null &&
  'reason' in value &&
  'message' in value &&
  typeof (value as { reason: unknown }).reason === 'string' &&
  typeof (value as { message: unknown }).message === 'string';

const tryParseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const extractStructuredTaskFailure = (message: string): TaskFailure | null => {
  const direct = tryParseJsonObject(message);
  const firstJsonBrace = message.indexOf('{');
  const lastJsonBrace = message.lastIndexOf('}');
  const embedded =
    direct ??
    (firstJsonBrace >= 0 && lastJsonBrace > firstJsonBrace
      ? tryParseJsonObject(message.slice(firstJsonBrace, lastJsonBrace + 1))
      : null);
  const reason = embedded?.reason;
  const failureMessage = embedded?.message;

  if (embedded && typeof reason === 'string' && typeof failureMessage === 'string') {
    return createTaskWorkflowFailure(reason, failureMessage, {
      ...(typeof embedded.status === 'number' ? { status: embedded.status } : {}),
    });
  }

  return null;
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return undefined;
};

const toTaskFailure = (error: unknown): TaskFailure =>
  isTaskFailure(error)
    ? error
    : ((getErrorMessage(error)
        ? extractStructuredTaskFailure(getErrorMessage(error) as string)
        : null) ??
      createTaskWorkflowFailure('task_failed', 'Task failed.', {
        cause: error instanceof Error ? error.message : String(error),
      }));

const runTaskEffect = async <TValue>(effect: Effect.Effect<TValue, TaskFailure>) => {
  const result = await Effect.runPromise(effect.pipe(Effect.either));

  if (result._tag === 'Left') {
    throw result.left;
  }

  return result.right;
};

export const createVercelWorkflowTaskExecutor = ({
  taskRunStore,
  getTaskDefinition,
  writeProgressEvent,
  writeResultEvent,
}: VercelWorkflowTaskExecutorOptions) => {
  const loadTaskRunSource = (ref: Pick<TaskRunRef, 'taskId' | 'runId'>) =>
    runTaskEffect(taskRunStore.loadSource(ref));

  const updateTaskRun = (
    ref: Pick<TaskRunRef, 'taskId' | 'runId'>,
    patch: Partial<TaskRunSource>,
  ) => runTaskEffect(taskRunStore.update(ref, patch));

  const writeProgress = async (runId: string, progress: NonNullable<TaskSnapshot['progress']>) => {
    if (!writeProgressEvent) {
      return;
    }

    try {
      await writeProgressEvent(runId, progress);
    } catch {
      // The durable task run store is the source of truth; workflow streams are telemetry.
    }
  };

  const writeResult = async (runId: string, result: unknown) => {
    if (!writeResultEvent) {
      return;
    }

    try {
      await writeResultEvent(runId, result);
    } catch {
      // The durable task run store is the source of truth; workflow streams are telemetry.
    }
  };

  const createTaskContext = (source: TaskRunSource, runStep: VercelTaskStepRunner): TaskContext => {
    const ref = {
      taskId: source.taskId,
      runId: source.runId,
    };

    return {
      ...ref,
      ...(source.subject ? { subject: source.subject } : {}),
      trigger: source.trigger,
      createdAt: source.createdAt,
      progress: progress =>
        Effect.tryPromise({
          try: async () => {
            const snapshot = await updateTaskRun(ref, {
              status: 'running',
              progress,
              updatedAt: now(),
            });
            await writeProgress(ref.runId, progress);
            return snapshot;
          },
          catch: toTaskFailure,
        }),
      sleep: milliseconds =>
        Effect.tryPromise({
          try: () => workflowSleep(milliseconds),
          catch: toTaskFailure,
        }),
      step: <TInput, TResult>(stepOrName: string | { id: string }, stepInput: TInput) =>
        Effect.tryPromise({
          try: async () => {
            const stepName = typeof stepOrName === 'string' ? stepOrName : stepOrName.id;

            return (await runStep({
              ...ref,
              stepName,
              input: stepInput,
            })) as TResult;
          },
          catch: toTaskFailure,
        }),
    };
  };

  const runTaskStep = async (input: VercelTaskStepWorkflowInput, runStep: VercelTaskStepRunner) => {
    const task = getTaskDefinition(input.taskId);

    if (!task) {
      throw createTaskWorkflowFailure('task_not_registered', 'Task is not registered.', {
        taskId: input.taskId,
      });
    }

    const step = task.steps?.[input.stepName];

    if (!step) {
      throw createTaskWorkflowFailure('task_step_not_found', 'Task step is not registered.', {
        taskId: input.taskId,
        stepName: input.stepName,
      });
    }

    const source = await loadTaskRunSource(input);
    const context = createTaskContext(source, runStep);
    const parsedInput = await runTaskEffect(validateTaskStepInput(input.taskId, step, input.input));

    return runTaskEffect(step.run(parsedInput, context));
  };

  const runTask = async (input: VercelTaskWorkflowInput, runStep: VercelTaskStepRunner) => {
    const task = getTaskDefinition(input.taskId);

    if (!task) {
      throw createTaskWorkflowFailure('task_not_registered', 'Task is not registered.', {
        taskId: input.taskId,
      });
    }

    const ref = {
      taskId: input.taskId,
      runId: input.runId,
    };
    const startedAt = now();

    await updateTaskRun(ref, {
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    });

    try {
      const source = await loadTaskRunSource(ref);
      const context = createTaskContext(source, runStep);
      const parsedInput = await runTaskEffect(validateTaskInput(task, source.input));
      await updateTaskRun(ref, {
        input: parsedInput,
        updatedAt: now(),
      });
      const result = await runTaskEffect(task.run(parsedInput, context));
      const completedAt = now();

      await updateTaskRun(ref, {
        status: 'completed',
        result,
        completedAt,
        updatedAt: completedAt,
      });
      await writeResult(ref.runId, result);

      return result;
    } catch (error) {
      const failure = toTaskFailure(error);
      const completedAt = now();

      await updateTaskRun(ref, {
        status: 'failed',
        completedAt,
        updatedAt: completedAt,
        error: {
          code: failure.reason,
          message: failure.message,
        },
      }).catch(() => undefined);
      throw failure;
    }
  };

  return {
    runTask,
    runTaskStep,
  };
};
