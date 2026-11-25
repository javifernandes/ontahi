import { createHash } from 'node:crypto';

import { Effect } from 'effect';

import type { DurableExternalEffectMetadata } from '../../../model/operation/definition.js';
import {
  cloneJson,
  isJsonValue,
  stringifyCanonicalJson,
  type JsonValue,
} from '../../../value/json.js';

import type { TaskFailure, TaskRunIdentity } from './types.js';

type PreparedIdempotentTaskEffect<TInput extends JsonValue> = {
  effectId: string;
  providerKey: string;
  input: TInput;
  inputDigest: string;
  retryUntil: number;
};

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Defines a provider-idempotent external effect for explicit Task execution.
 * Persist the prepared value in a checkpoint before calling run.
 */
export const defineIdempotentTaskEffect = <TInput extends JsonValue, TResult>(definition: {
  id: string;
  /** Conservative interval during which the provider guarantees key reuse. */
  retryWindowMs: number;
  /** True only when the adapter can establish that the external write did not occur. */
  isDefinitiveFailure?: (failure: TaskFailure) => boolean;
  execute: (input: TInput, providerKey: string) => Effect.Effect<TResult, TaskFailure>;
}) => {
  if (!Number.isSafeInteger(definition.retryWindowMs) || definition.retryWindowMs <= 0) {
    throw new RangeError('Effect retry window must be a positive integer in milliseconds.');
  }

  const metadata: DurableExternalEffectMetadata = {
    id: definition.id,
    replay: 'provider-idempotency',
    retryWindowMs: definition.retryWindowMs,
  };
  return {
    metadata,
    prepare: (
      run: TaskRunIdentity,
      occurrence: string,
      input: TInput,
    ): PreparedIdempotentTaskEffect<TInput> => ({
      effectId: definition.id,
      providerKey: digest(JSON.stringify([run.taskId, run.runId, definition.id, occurrence])),
      input: cloneJson(input),
      inputDigest: digest(stringifyCanonicalJson(input)),
      retryUntil: Date.now() + definition.retryWindowMs,
    }),
    run: (prepared: PreparedIdempotentTaskEffect<TInput>): Effect.Effect<TResult, TaskFailure> =>
      Effect.suspend(() => {
        if (
          prepared.effectId !== definition.id ||
          !/^[a-f0-9]{64}$/.test(prepared.providerKey) ||
          !Number.isFinite(prepared.retryUntil) ||
          !isJsonValue(prepared.input) ||
          prepared.inputDigest !== digest(stringifyCanonicalJson(prepared.input))
        ) {
          return Effect.fail({
            reason: 'task_effect_checkpoint_invalid',
            message: 'Checkpoint does not match the declared effect.',
          });
        }
        if (Date.now() >= prepared.retryUntil) {
          return Effect.fail({
            reason: 'task_effect_outcome_ambiguous',
            message: 'Provider idempotency window expired. Reconcile the effect before retrying.',
          });
        }
        const input = JSON.parse(stringifyCanonicalJson(prepared.input)) as TInput;
        return definition.execute(input, prepared.providerKey).pipe(
          Effect.mapError(failure =>
            definition.isDefinitiveFailure?.(failure)
              ? failure
              : {
                  reason: 'task_effect_outcome_ambiguous',
                  message: `External write outcome could not be confirmed (${failure.reason}): ${failure.message}`,
                },
          ),
        );
      }),
  };
};
