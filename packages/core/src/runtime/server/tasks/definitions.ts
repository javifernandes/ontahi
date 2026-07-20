import { invalidTaskDefinitionFailure } from './failures.js';
import type {
  TaskDefinition,
  TaskDefinitionDeclaration,
  TaskStepDefinition,
  TaskStepRegistry,
} from './types.js';

const normalizeTaskSteps = (
  taskId: string,
  steps: TaskDefinitionDeclaration<any, any>['steps'],
): TaskStepRegistry | undefined => {
  if (!steps) {
    return undefined;
  }

  if (!Array.isArray(steps)) {
    return steps as TaskStepRegistry;
  }

  const registry: TaskStepRegistry = {};

  for (const step of steps) {
    if (registry[step.id]) {
      throw invalidTaskDefinitionFailure(taskId, `Task step id "${step.id}" is duplicated.`, {
        stepId: step.id,
      });
    }

    registry[step.id] = step;
  }

  return registry;
};

export const assertTaskStepKeysMatchIds = (task: TaskDefinition<any, any>) => {
  for (const [stepName, step] of Object.entries(task.steps ?? {})) {
    if (step.id !== stepName) {
      throw invalidTaskDefinitionFailure(
        task.id,
        `Task step key "${stepName}" must match step id "${step.id}".`,
        {
          stepName,
          stepId: step.id,
        },
      );
    }
  }
};

export const defineTask = <TInput, TResult>(
  definition: TaskDefinitionDeclaration<TInput, TResult>,
): TaskDefinition<TInput, TResult> => {
  const task = {
    ...definition,
    steps: normalizeTaskSteps(definition.id, definition.steps),
  };

  assertTaskStepKeysMatchIds(task);
  return task;
};

export const defineTaskStep = <TInput, TResult>(
  definition: TaskStepDefinition<TInput, TResult>,
): TaskStepDefinition<TInput, TResult> => definition;
