import { Cause, Effect, Option } from 'effect';

import { toEffect } from '../../../computation/effect.js';
import { getServerRuntimeConfig } from '../config.js';
import type { LayerConcern, LayerConcernRuntime } from '../layer-types.js';

import type { RateLimitPolicy } from './rate-limit-policy.js';

const RATE_LIMIT_EXCEEDED_ERROR = 'Rate limit exceeded. Try again later.';

export class RateLimitExceededError extends Error {
  public readonly remaining: number;

  constructor(options?: { message?: string; remaining?: number }) {
    super(options?.message ?? RATE_LIMIT_EXCEEDED_ERROR);
    this.name = 'RateLimitExceededError';
    this.remaining = options?.remaining ?? 0;
  }
}

export type RateLimitKeyResolver<TInput> = (
  input: TInput,
  runtime: LayerConcernRuntime<TInput>,
) =>
  | RateLimitKeyPartValue
  | PromiseLike<RateLimitKeyPartValue>
  | Effect.Effect<RateLimitKeyPartValue, unknown>;

export type RateLimitKeyPartValue = string | number | boolean | bigint;

export type RateLimitKeyPart<TInput> = RateLimitKeyPartValue | RateLimitKeyResolver<TInput>;

export type RateLimitKey<TInput> = RateLimitKeyPart<TInput> | readonly RateLimitKeyPart<TInput>[];

export type RateLimitRefundPredicate<TInput> = (
  error: unknown,
  runtime: LayerConcernRuntime<TInput>,
) => boolean | Promise<boolean> | Effect.Effect<boolean, unknown>;

export interface RateLimitConcernOptions<TInput> {
  policy: RateLimitPolicy;
  key: RateLimitKey<TInput>;
  refundOn?: RateLimitRefundPredicate<TInput>;
}

const resolveRateLimitError = (cause: Cause.Cause<unknown>) => {
  const failure = Cause.failureOption(cause);
  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
};

const stringifyRateLimitKeyPart = <TInput>(
  value: RateLimitKeyPartValue,
  runtime: LayerConcernRuntime<TInput>,
): string => {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      throw new Error(`Invalid rate-limit key part for scope ${runtime.scope}`);
  }
};

const resolveRateLimitKeyPart = <TInput>(
  part: RateLimitKeyPart<TInput>,
  runtime: LayerConcernRuntime<TInput>,
): Effect.Effect<string, unknown> =>
  toEffect(() => (typeof part === 'function' ? part(runtime.input, runtime) : part)).pipe(
    Effect.map(value => stringifyRateLimitKeyPart(value, runtime)),
  );

const resolveRateLimitKey = <TInput>(
  key: RateLimitKey<TInput>,
  runtime: LayerConcernRuntime<TInput>,
): Effect.Effect<string, unknown> => {
  const keyParts = Array.isArray(key) ? key : [key];

  if (keyParts.length === 0) {
    return Effect.fail(new Error(`Rate-limit key cannot be empty (${runtime.scope})`));
  }

  return Effect.forEach(keyParts, part => resolveRateLimitKeyPart(part, runtime), {
    concurrency: 1,
  }).pipe(Effect.map(parts => parts.join(':')));
};

export const byRequester = <TInput extends { requesterKey?: string }>(input: TInput): string => {
  const requesterKey = input.requesterKey?.trim();
  return requesterKey && requesterKey.length > 0 ? requesterKey : 'anonymous';
};

export const input =
  <TInput extends Record<string, unknown>, TKey extends keyof TInput>(
    key: TKey,
  ): RateLimitKeyResolver<TInput> =>
  (source, runtime) => {
    const value = source[key];

    if (value == null) {
      throw new Error(`Rate-limit input key "${String(key)}" is not available (${runtime.scope})`);
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value;
    }

    throw new Error(
      `Rate-limit input key "${String(key)}" must resolve to a primitive value (${runtime.scope})`,
    );
  };

export const rateLimit = <TInput>(
  options: RateLimitConcernOptions<TInput>,
): LayerConcern<TInput, RateLimitExceededError> => ({
  run: (runtime, next) =>
    Effect.gen(function* () {
      const { rateLimit: adapter } = getServerRuntimeConfig();
      const policy = {
        ...options.policy,
        id: options.policy.id ?? runtime.scope,
      };
      const key = yield* resolveRateLimitKey(options.key, runtime).pipe(Effect.orDie);
      const slot = yield* toEffect(() => adapter.acquireSlot(policy, key)).pipe(Effect.orDie);

      if (!slot.allowed) {
        yield* Effect.fail(
          new RateLimitExceededError({
            message: slot.error ?? RATE_LIMIT_EXCEEDED_ERROR,
            remaining: slot.remaining,
          }),
        );
      }

      return yield* next.pipe(
        Effect.catchAllCause(cause =>
          Effect.gen(function* () {
            if (options.refundOn) {
              const shouldRefund = yield* toEffect(() =>
                options.refundOn?.(resolveRateLimitError(cause), runtime),
              ).pipe(Effect.catchAllCause(() => Effect.succeed(false)));

              if (shouldRefund) {
                yield* toEffect(() => adapter.releaseSlot(policy, key)).pipe(
                  Effect.catchAllCause(() => Effect.void),
                );
              }
            }

            return yield* Effect.failCause(cause);
          }),
        ),
      );
    }),
});
