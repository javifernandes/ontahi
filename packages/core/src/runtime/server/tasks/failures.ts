import type { TaskFailure, TaskRunIdentity } from './types.js';

const createTaskFailure = (
  reason: string,
  message: string,
  extra?: Record<string, unknown>,
): TaskFailure => ({
  reason,
  message,
  ...(extra ?? {}),
});

export const missingTaskRunFailure = (ref: TaskRunIdentity): TaskFailure =>
  createTaskFailure('task_run_not_found', 'Task run not found.', ref);

export const duplicateTaskRunFailure = (ref: TaskRunIdentity): TaskFailure =>
  createTaskFailure('task_run_already_exists', 'Task run already exists.', ref);

export const missingTaskStepFailure = (taskId: string, stepName: string): TaskFailure =>
  createTaskFailure('task_step_not_found', 'Task step is not registered.', {
    taskId,
    stepName,
  });

export const invalidTaskDefinitionFailure = (
  taskId: string,
  message: string,
  context: Record<string, unknown>,
): TaskFailure => createTaskFailure('task_definition_invalid', message, { taskId, ...context });

export const invalidTaskInputFailure = (
  taskId: string,
  message: string,
  context?: Record<string, unknown>,
): TaskFailure => createTaskFailure('invalid_task_input', message, { taskId, ...context });

export const invalidTaskStepInputFailure = (
  taskId: string,
  stepId: string,
  message: string,
  context?: Record<string, unknown>,
): TaskFailure =>
  createTaskFailure('invalid_task_step_input', message, { taskId, stepId, ...context });

export const invalidTaskProgressFailure = (
  taskId: string,
  message: string,
  context?: Record<string, unknown>,
): TaskFailure => createTaskFailure('invalid_task_progress', message, { taskId, ...context });

export const invalidTaskStepOutputFailure = (
  taskId: string,
  stepId: string,
  message: string,
  context?: Record<string, unknown>,
): TaskFailure =>
  createTaskFailure('invalid_task_step_output', message, { taskId, stepId, ...context });

export const invalidTaskOutputFailure = (
  taskId: string,
  message: string,
  context?: Record<string, unknown>,
): TaskFailure => createTaskFailure('invalid_task_output', message, { taskId, ...context });

export const toTaskFailure = (error: unknown): TaskFailure =>
  typeof error === 'object' &&
  error !== null &&
  'reason' in error &&
  'message' in error &&
  typeof (error as { reason: unknown }).reason === 'string' &&
  typeof (error as { message: unknown }).message === 'string'
    ? (error as TaskFailure)
    : createTaskFailure('task_failed', 'Task failed.', {
        cause: error instanceof Error ? error.message : String(error),
      });
