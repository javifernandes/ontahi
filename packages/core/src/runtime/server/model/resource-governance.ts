import { AsyncLocalStorage } from 'node:async_hooks';

import { ModelInterpretationError } from './errors.js';

export type ModelResourceLimits = {
  /** Maximum charged provider attempts in one semantic execution family. */
  readonly maxAttempts?: number;
  /** Maximum generated tokens requested from a provider for each admitted attempt. */
  readonly maxOutputTokens?: number;
};

export type ModelResourceAdmission = {
  readonly attempt: number;
  readonly maxAttempts?: number;
  readonly maxOutputTokens?: number;
};

type ModelResourceState = {
  readonly limits: ModelResourceLimits;
  readonly counter: { attempts: number };
};

const modelResourceStorage = new AsyncLocalStorage<ModelResourceState>();

const positiveInteger = (name: string, value: number | undefined) => {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0))
    throw new RangeError(`${name} must be a positive integer.`);
  return value;
};

const narrowLimit = (parent: number | undefined, child: number | undefined) =>
  parent === undefined ? child : child === undefined ? parent : Math.min(parent, child);

const narrowLimits = (
  parent: ModelResourceLimits | undefined,
  child: ModelResourceLimits,
): ModelResourceLimits => {
  const maxAttempts = narrowLimit(
    positiveInteger('maxAttempts', parent?.maxAttempts),
    positiveInteger('maxAttempts', child.maxAttempts),
  );
  const maxOutputTokens = narrowLimit(
    positiveInteger('maxOutputTokens', parent?.maxOutputTokens),
    positiveInteger('maxOutputTokens', child.maxOutputTokens),
  );
  return {
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  };
};

export const withModelResourceLimits = <TValue>(
  limits: ModelResourceLimits | undefined,
  run: () => TValue,
): TValue => {
  if (!limits) return run();
  const parent = modelResourceStorage.getStore();
  return modelResourceStorage.run(
    {
      limits: narrowLimits(parent?.limits, limits),
      counter: parent?.counter ?? { attempts: 0 },
    },
    run,
  );
};

export const admitModelResourceAttempt = (): ModelResourceAdmission | undefined => {
  const state = modelResourceStorage.getStore();
  if (!state) return undefined;
  const attempt = state.counter.attempts + 1;
  if (state.limits.maxAttempts !== undefined && attempt > state.limits.maxAttempts)
    throw new ModelInterpretationError(
      'model_resource_exhausted',
      `Model generation attempt limit exhausted (${state.limits.maxAttempts}).`,
    );
  state.counter.attempts = attempt;
  return { attempt, ...state.limits };
};
