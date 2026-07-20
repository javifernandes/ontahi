import { Effect } from 'effect';
import type { ZodIssue } from 'zod';

import { invalidTaskInputFailure, invalidTaskStepInputFailure } from './failures.js';
import type { TaskDefinition, TaskFailure, TaskStepDefinition } from './types.js';

const formatIssues = (issues: ReadonlyArray<ZodIssue>) =>
  issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

const firstIssueMessage = (issues: ReadonlyArray<ZodIssue>, fallback: string) =>
  issues[0]?.message ?? fallback;

export const validateTaskInput = <TInput, TResult>(
  task: TaskDefinition<TInput, TResult>,
  input: unknown,
): Effect.Effect<TInput, TaskFailure> => {
  if (!task.input) {
    return Effect.succeed(input as TInput);
  }

  const result = task.input.safeParse(input);

  if (result.success) {
    return Effect.succeed(result.data);
  }

  return Effect.fail(
    invalidTaskInputFailure(
      task.id,
      firstIssueMessage(result.error.issues, 'Task input validation failed.'),
      {
        issues: formatIssues(result.error.issues),
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

  const result = step.input.safeParse(input);

  if (result.success) {
    return Effect.succeed(result.data);
  }

  return Effect.fail(
    invalidTaskStepInputFailure(
      taskId,
      step.id,
      firstIssueMessage(result.error.issues, 'Task step input validation failed.'),
      {
        issues: formatIssues(result.error.issues),
      },
    ),
  );
};
