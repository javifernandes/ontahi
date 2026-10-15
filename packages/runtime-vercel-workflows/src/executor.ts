import 'server-only';

import { serverContext } from '@ontahi/core/runtime/server';
import {
  invalidTaskDefinitionFailure,
  isTaskExecutionState,
  materializeTaskExecutionInteraction,
  missingTaskStepFailure,
  validateTaskInput,
  validateTaskInteractionResponse,
  validateTaskOutput,
  validateTaskProgress,
  validateTaskStepInput,
  validateTaskStepOutput,
  taskInteractionUnavailableFailure,
  type TaskContext,
  type TaskDefinition,
  type TaskFailure,
  type TaskExecutionState,
  type TaskInteractionResponse,
  type TaskRunIdentity,
  type TaskRunSource,
  type TaskSnapshot,
} from '@ontahi/core/runtime/server/tasks';
import { cloneJson } from '@ontahi/core/value/json';
import { Effect } from 'effect';
import { createHook, sleep as workflowSleep } from 'workflow';

import type {
  VercelTaskStepRunner,
  VercelTaskStepWorkflowInput,
  VercelTaskWorkflowInput,
  VercelWorkflowTaskExecutorOptions,
} from './contracts.js';
import { vercelInteractionHookToken, vercelInteractionId } from './interactions.js';

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
  createExecutionContext,
  writeProgressEvent,
  writeResultEvent,
}: VercelWorkflowTaskExecutorOptions) => {
  const loadTaskRunSource = (ref: TaskRunIdentity) => runTaskEffect(taskRunStore.loadSource(ref));

  const updateTaskRun = (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) =>
    runTaskEffect(taskRunStore.update(ref, patch));

  const withExecutionContext = async <TValue>(
    ref: TaskRunIdentity,
    execute: () => Promise<TValue>,
  ) => {
    if (!createExecutionContext) return execute();
    const source = await loadTaskRunSource(ref);
    const context = createExecutionContext(source);
    return context ? serverContext.run(context, execute) : execute();
  };

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

  const createTaskContext = (
    source: TaskRunSource,
    task: TaskDefinition<unknown, unknown>,
    runStep: VercelTaskStepRunner,
  ): TaskContext => {
    const ref = {
      taskId: source.taskId,
      runId: source.runId,
    };

    return {
      ...ref,
      ...(source.subject ? { subject: source.subject } : {}),
      trigger: source.trigger,
      createdAt: source.createdAt,
      interact: {
        choice: () => Effect.fail(taskInteractionUnavailableFailure(ref)),
        input: () => Effect.fail(taskInteractionUnavailableFailure(ref)),
        approval: () => Effect.fail(taskInteractionUnavailableFailure(ref)),
      },
      progress: progress =>
        Effect.flatMap(validateTaskProgress(task, progress), parsedProgress =>
          Effect.tryPromise({
            try: async () => {
              const snapshot = await updateTaskRun(ref, {
                status: 'running',
                progress: parsedProgress,
                updatedAt: now(),
              });
              await writeProgress(ref.runId, parsedProgress);
              return snapshot;
            },
            catch: toTaskFailure,
          }),
        ),
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

  const runTaskStepInContext = async (
    input: VercelTaskStepWorkflowInput,
    runStep: VercelTaskStepRunner,
  ) => {
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
    const context = createTaskContext(source, task, runStep);
    const parsedInput = await runTaskEffect(validateTaskStepInput(input.taskId, step, input.input));
    const output = await runTaskEffect(step.run(parsedInput, context));

    return runTaskEffect(validateTaskStepOutput(input.taskId, step, output));
  };

  const runTaskInContext = async (
    input: VercelTaskWorkflowInput,
    runStep: VercelTaskStepRunner,
  ) => {
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
      if (task.execution) {
        const source = await loadTaskRunSource(ref);
        const context = createTaskContext(source, task, runStep);
        const parsedInput = await runTaskEffect(validateTaskInput(task, source.input));
        await updateTaskRun(ref, { input: parsedInput, updatedAt: now() });
        const initialState = source.checkpoint?.state ?? task.execution.initial(parsedInput);
        if (!isTaskExecutionState(initialState)) {
          throw invalidTaskDefinitionFailure(
            task.id,
            'Explicit execution initial state must be a JSON-safe object with a step.',
            {},
          );
        }
        let state = cloneJson(initialState) as TaskExecutionState;
        let response: TaskInteractionResponse | undefined;

        while (true) {
          const step = task.execution.steps[state.step];
          if (!step) throw missingTaskStepFailure(task.id, state.step);
          const transition = await runTaskEffect(
            step.run({
              input: parsedInput,
              state,
              ...(response ? { response } : {}),
              context,
            }),
          );
          response = undefined;

          if (transition.kind === 'complete') {
            const parsedResult = await runTaskEffect(validateTaskOutput(task, transition.result));
            const completedAt = now();
            await updateTaskRun(ref, {
              status: 'completed',
              result: parsedResult,
              checkpoint: undefined,
              completedAt,
              updatedAt: completedAt,
            });
            await writeResult(ref.runId, parsedResult);
            return parsedResult;
          }
          if (!isTaskExecutionState(transition.state)) {
            throw invalidTaskDefinitionFailure(
              task.id,
              'Explicit execution step returned an invalid JSON-safe state.',
              { stepId: state.step },
            );
          }
          state = cloneJson(transition.state) as TaskExecutionState;
          if (transition.kind === 'event') {
            throw invalidTaskDefinitionFailure(
              task.id,
              'Vercel Workflow Task Runtime does not support durable Event waits.',
              { eventId: transition.event.declaration.id },
            );
          }
          if (transition.kind === 'continue') {
            await updateTaskRun(ref, {
              status: 'running',
              checkpoint: { version: 1, state },
              updatedAt: now(),
            });
            continue;
          }

          const persisted = await loadTaskRunSource(ref);
          const interactionId = vercelInteractionId(ref, state, transition.interaction);
          const existing = persisted.checkpoint?.interaction;
          const interaction =
            existing?.id === interactionId
              ? existing
              : await runTaskEffect(
                  materializeTaskExecutionInteraction(ref, transition.interaction, {
                    id: interactionId,
                  }),
                );
          const hook = createHook<TaskInteractionResponse>({
            token: vercelInteractionHookToken(ref, interaction.id),
          });
          try {
            const conflict = await hook.getConflict();
            if (conflict) {
              throw invalidTaskDefinitionFailure(
                task.id,
                'Vercel Workflow interaction hook is owned by another workflow run.',
                { interactionId: interaction.id, workflowRunId: conflict.runId },
              );
            }
            if (persisted.checkpoint?.response?.interactionId !== interaction.id) {
              await updateTaskRun(ref, {
                status: 'waiting',
                checkpoint: { version: 1, state, interaction },
                updatedAt: now(),
              });
            }
            response = cloneJson(await hook);
            await runTaskEffect(validateTaskInteractionResponse(ref, interaction, response));
          } finally {
            hook.dispose();
          }
        }
      }
      const source = await loadTaskRunSource(ref);
      const context = createTaskContext(source, task, runStep);
      const parsedInput = await runTaskEffect(validateTaskInput(task, source.input));
      await updateTaskRun(ref, {
        input: parsedInput,
        updatedAt: now(),
      });
      const result = await runTaskEffect(task.run(parsedInput, context));
      const parsedResult = await runTaskEffect(validateTaskOutput(task, result));
      const completedAt = now();

      await updateTaskRun(ref, {
        status: 'completed',
        result: parsedResult,
        completedAt,
        updatedAt: completedAt,
      });
      await writeResult(ref.runId, parsedResult);

      return parsedResult;
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

  const runTaskStep = (input: VercelTaskStepWorkflowInput, runStep: VercelTaskStepRunner) =>
    withExecutionContext(input, () => runTaskStepInContext(input, runStep));

  const runTask = (input: VercelTaskWorkflowInput, runStep: VercelTaskStepRunner) =>
    withExecutionContext(input, () => runTaskInContext(input, runStep));

  return {
    runTask,
    runTaskStep,
  };
};
