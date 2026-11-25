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

export type TaskEffectLookup<TResult> =
  | { kind: 'found'; result: TResult }
  // The provider contract must exclude a still-pending write for this reference.
  | { kind: 'confirmed-absent' }
  | { kind: 'unknown' };

type PreparedReconcilableEffect<TInput extends JsonValue> = {
  effectId?: string;
  externalReference: string;
  input: TInput;
  inputDigest: string;
};

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

const ambiguous = (message: string): TaskFailure => ({
  reason: 'task_effect_outcome_ambiguous',
  message,
});

/** Persist the prepared checkpoint before running a lookup or sending a write. */
const reconcilable = <TInput extends JsonValue, TResult>({
  id,
  lookup,
  execute,
}: {
  id?: string;
  /** Return found only for a result that matches the reference and expected input. */
  lookup: (
    input: TInput,
    externalReference: string,
  ) => Effect.Effect<TaskEffectLookup<TResult>, TaskFailure>;
  execute: (input: TInput, externalReference: string) => Effect.Effect<TResult, TaskFailure>;
}) => {
  const metadata: DurableExternalEffectMetadata = {
    ...(id === undefined ? {} : { id }),
    replay: 'external-reference-reconciliation',
  };

  return {
    metadata,
    prepare: (
      run: TaskRunIdentity,
      occurrence: string,
      input: TInput,
    ): PreparedReconcilableEffect<TInput> => ({
      ...(id === undefined ? {} : { effectId: id }),
      externalReference: digest(JSON.stringify([run.taskId, run.runId, id, occurrence])),
      input: cloneJson(input),
      inputDigest: digest(stringifyCanonicalJson(input)),
    }),
    run: (prepared: PreparedReconcilableEffect<TInput>): Effect.Effect<TResult, TaskFailure> =>
      Effect.gen(function* () {
        if (
          prepared.effectId !== id ||
          !/^[a-f0-9]{64}$/.test(prepared.externalReference) ||
          !isJsonValue(prepared.input)
        ) {
          return yield* Effect.fail({
            reason: 'task_effect_checkpoint_invalid',
            message: 'Checkpoint does not match the declared effect.',
          });
        }
        const serialized = stringifyCanonicalJson(prepared.input);
        if (prepared.inputDigest !== digest(serialized)) {
          return yield* Effect.fail({
            reason: 'task_effect_checkpoint_invalid',
            message: 'Checkpoint input does not match the prepared effect.',
          });
        }
        const input = () => JSON.parse(serialized) as TInput;
        const reference = prepared.externalReference;
        const find = () =>
          lookup(input(), reference).pipe(
            Effect.mapError(failure =>
              ambiguous(`External reference lookup failed (${failure.reason}): ${failure.message}`),
            ),
          );
        const reconcile = (whenAbsent: () => Effect.Effect<TResult, TaskFailure>) =>
          Effect.flatMap(find(), match => {
            if (match.kind === 'found') return Effect.succeed(match.result);
            if (match.kind === 'confirmed-absent') return whenAbsent();
            return Effect.fail(ambiguous('External reference lookup was inconclusive.'));
          });

        return yield* reconcile(() =>
          execute(input(), reference).pipe(
            Effect.catchAll(() =>
              reconcile(() =>
                execute(input(), reference).pipe(
                  Effect.catchAll(() =>
                    reconcile(() =>
                      Effect.fail(ambiguous('External retry outcome could not be confirmed.')),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
  };
};

export const effect = { reconcilable };
