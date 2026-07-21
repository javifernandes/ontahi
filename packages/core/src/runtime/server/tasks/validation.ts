import { Effect } from 'effect';

import {
  safeParseUnknownGraphSchema,
  type GraphSchemaValidationIssue,
} from '../../../data-graph/schema.js';

import {
  invalidTaskInputFailure,
  invalidTaskOutputFailure,
  invalidTaskProgressFailure,
  invalidTaskStepInputFailure,
  invalidTaskStepOutputFailure,
} from './failures.js';
import type { TaskDefinition, TaskFailure, TaskSnapshot, TaskStepDefinition } from './types.js';

const formatIssues = (issues: ReadonlyArray<GraphSchemaValidationIssue>) =>
  issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

const firstIssueMessage = (issues: ReadonlyArray<GraphSchemaValidationIssue>, fallback: string) =>
  issues[0]?.message ?? fallback;

export const validateTaskInput = <TInput, TResult>(
  task: TaskDefinition<TInput, TResult>,
  input: unknown,
): Effect.Effect<TInput, TaskFailure> => {
  if (!task.input) {
    return Effect.succeed(input as TInput);
  }

  const result = safeParseUnknownGraphSchema(task.input, input);

  if (result.success) {
    return Effect.succeed(result.data as TInput);
  }

  return Effect.fail(
    invalidTaskInputFailure(
      task.id,
      firstIssueMessage(result.issues, 'Task input validation failed.'),
      {
        issues: formatIssues(result.issues),
      },
    ),
  );
};

export const validateTaskStepInput = <TInput, TResult>(
  taskId: string,
  step: TaskStepDefinition<TInput, TResult>,
  input: unknown,
): Effect.Effect<TInput, TaskFailure> => {
  if (!step.input) {
    return Effect.succeed(input as TInput);
  }

  const result = safeParseUnknownGraphSchema(step.input, input);

  if (result.success) {
    return Effect.succeed(result.data as TInput);
  }

  return Effect.fail(
    invalidTaskStepInputFailure(
      taskId,
      step.id,
      firstIssueMessage(result.issues, 'Task step input validation failed.'),
      {
        issues: formatIssues(result.issues),
      },
    ),
  );
};

export const validateTaskProgress = <TInput, TResult>(
  task: TaskDefinition<TInput, TResult>,
  progress: unknown,
): Effect.Effect<NonNullable<TaskSnapshot['progress']>, TaskFailure> => {
  if (!task.progress) {
    return Effect.succeed(progress as NonNullable<TaskSnapshot['progress']>);
  }

  const result = safeParseUnknownGraphSchema(task.progress, progress);

  if (result.success) {
    return Effect.succeed(result.data as NonNullable<TaskSnapshot['progress']>);
  }

  return Effect.fail(
    invalidTaskProgressFailure(
      task.id,
      firstIssueMessage(result.issues, 'Task progress validation failed.'),
      {
        issues: formatIssues(result.issues),
      },
    ),
  );
};

export const validateTaskStepOutput = <TInput, TResult>(
  taskId: string,
  step: TaskStepDefinition<TInput, TResult>,
  output: unknown,
): Effect.Effect<TResult, TaskFailure> => {
  if (!step.output) {
    return Effect.succeed(output as TResult);
  }

  const result = safeParseUnknownGraphSchema(step.output, output);

  if (result.success) {
    return Effect.succeed(result.data as TResult);
  }

  return Effect.fail(
    invalidTaskStepOutputFailure(
      taskId,
      step.id,
      firstIssueMessage(result.issues, 'Task step output validation failed.'),
      {
        issues: formatIssues(result.issues),
      },
    ),
  );
};

export const validateTaskOutput = <TInput, TResult>(
  task: TaskDefinition<TInput, TResult>,
  output: unknown,
): Effect.Effect<TResult, TaskFailure> => {
  if (!task.output) {
    return Effect.succeed(output as TResult);
  }

  const result = safeParseUnknownGraphSchema(task.output, output);

  if (result.success) {
    return Effect.succeed(result.data as TResult);
  }

  return Effect.fail(
    invalidTaskOutputFailure(
      task.id,
      firstIssueMessage(result.issues, 'Task output validation failed.'),
      {
        issues: formatIssues(result.issues),
      },
    ),
  );
};
