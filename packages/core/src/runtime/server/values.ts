import { Effect } from 'effect';

import { toEffect } from '../../computation/effect.js';

export const fromNullable = <TValue, TError>(
  value: TValue | null | undefined,
  onMissing: () => TError,
): Effect.Effect<NonNullable<TValue>, TError> =>
  value == null ? Effect.fail(onMissing()) : Effect.succeed(value as NonNullable<TValue>);

export const fromValueOrPromise = <TValue>(
  resolve: () => TValue | PromiseLike<TValue>,
): Effect.Effect<TValue, never> => toEffect(resolve).pipe(Effect.orDie);

export const failIfError = <
  TResult extends { error: TErrorValue | null | undefined },
  TErrorValue,
  TError,
>(
  result: TResult,
  onError: (error: NonNullable<TErrorValue>) => TError,
): Effect.Effect<TResult, TError> =>
  result.error == null
    ? Effect.succeed(result)
    : Effect.fail(onError(result.error as NonNullable<TErrorValue>));
