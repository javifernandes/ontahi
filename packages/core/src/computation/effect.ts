import { Effect } from 'effect';

import { isThenable } from './async.js';

export interface RecoverEffectOptions<TValue, TError> {
  onError?: (error: TError) => void;
  returnValue: (error: TError) => TValue;
}

export const isEffectLike = <TValue = unknown, TError = unknown>(
  value: unknown,
): value is Effect.Effect<TValue, TError> =>
  typeof value === 'object' &&
  value !== null &&
  ('_op' in value || ('_id' in value && (value as { _id?: unknown })._id === 'Effect'));

export const toEffect = <TValue>(
  resolve: () => TValue | PromiseLike<TValue> | Effect.Effect<TValue, unknown>,
): Effect.Effect<TValue, unknown> =>
  Effect.suspend(() => {
    const value = resolve();
    if (isEffectLike<TValue>(value)) {
      return value;
    }

    if (isThenable<TValue>(value)) {
      return Effect.promise(() => Promise.resolve(value));
    }

    return Effect.succeed(value);
  });

export function recoverEffect<TValue, TError>(
  options: RecoverEffectOptions<TValue, TError>,
): <TRequirements>(
  self: Effect.Effect<TValue, TError, TRequirements>,
) => Effect.Effect<TValue, never, TRequirements>;
export function recoverEffect<TValue, TError, TRequirements>(
  self: Effect.Effect<TValue, TError, TRequirements>,
  options: RecoverEffectOptions<TValue, TError>,
): Effect.Effect<TValue, never, TRequirements>;
export function recoverEffect<TValue, TError, TRequirements>(
  selfOrOptions:
    | Effect.Effect<TValue, TError, TRequirements>
    | RecoverEffectOptions<TValue, TError>,
  maybeOptions?: RecoverEffectOptions<TValue, TError>,
):
  | Effect.Effect<TValue, never, TRequirements>
  | ((
      self: Effect.Effect<TValue, TError, TRequirements>,
    ) => Effect.Effect<TValue, never, TRequirements>) {
  const applyRecovery = (self: Effect.Effect<TValue, TError, TRequirements>) => {
    const options = maybeOptions ?? (selfOrOptions as RecoverEffectOptions<TValue, TError>);

    return self.pipe(
      Effect.catchAll(error =>
        Effect.sync(() => {
          options.onError?.(error);
          return options.returnValue(error);
        }),
      ),
    );
  };

  return isEffectLike<TValue, TError>(selfOrOptions) ? applyRecovery(selfOrOptions) : applyRecovery;
}
