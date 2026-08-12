import { Effect } from 'effect';

import type { UnwrapEffectSuccess } from './effect-intents/types.js';
import type { OperationOptions, OperationRunner } from './operation/options-types.js';
import type { OperationInput } from './operation/requirement-types.js';
import { runServerOperation } from './operation/run.js';
import { createOperationRunner } from './operation/runner.js';
import type { OperationFailure, OperationRuntimeError } from './operation/types.js';

export function operation<
  TInput extends OperationInput,
  TRawSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError = never,
>(
  effect: (input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>,
  options: OperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
): OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError> {
  return createOperationRunner<TInput, TRawSuccess, TFailure, TInfraError>(
    effect,
    options,
    runServerOperation,
  );
}

export { layer } from './layer.js';
export { runServerOperation };
