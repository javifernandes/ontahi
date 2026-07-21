import { Effect } from 'effect';

import {
  safeParseUnknownGraphSchema,
  type GraphSchemaValidationIssue,
} from '../../../data-graph/schema.js';

import { invalidTaskInputFailure, invalidTaskStepInputFailure } from './failures.js';
import type { TaskDefinition, TaskFailure, TaskStepDefinition } from './types.js';

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
