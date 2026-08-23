import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { adaptEffectMethods, isEffectLike, recoverEffect, toEffect } from './effect.js';

describe('isEffectLike', () => {
  it('returns true for Effect values', () => {
    expect(isEffectLike(Effect.succeed('ok'))).toBe(true);
  });

  it('returns false for plain objects', () => {
    expect(isEffectLike({ ok: true })).toBe(false);
  });
});

describe('toEffect', () => {
  it('wraps plain values', async () => {
    await expect(Effect.runPromise(toEffect(() => 'ok'))).resolves.toBe('ok');
  });

  it('wraps promises', async () => {
    await expect(Effect.runPromise(toEffect(() => Promise.resolve('ok')))).resolves.toBe('ok');
  });

  it('passes through Effect values', async () => {
    await expect(Effect.runPromise(toEffect(() => Effect.succeed('ok')))).resolves.toBe('ok');
  });
});

describe('adaptEffectMethods', () => {
  type Notifications = {
    record(input: string): Effect.Effect<void>;
    resolve(input: string): Effect.Effect<string>;
  };

  it('accepts synchronous implementations and keeps their execution lazy', async () => {
    const recorded: string[] = [];
    const notifications = adaptEffectMethods<Notifications>({
      record: input => recorded.push(input),
      resolve: input => input.toUpperCase(),
    });

    const recording = notifications.record('todo-list-created');

    expect(recorded).toEqual([]);
    await Effect.runPromise(recording);
    expect(recorded).toEqual(['todo-list-created']);
    await expect(Effect.runPromise(notifications.resolve('inbox'))).resolves.toBe('INBOX');
  });

  it('accepts asynchronous and Effect implementations', async () => {
    const notifications = adaptEffectMethods<Notifications>({
      record: async () => Promise.resolve(),
      resolve: input => Effect.succeed(input.toUpperCase()),
    });

    await expect(Effect.runPromise(notifications.record('todo-list-created'))).resolves.toBe(
      undefined,
    );
    await expect(Effect.runPromise(notifications.resolve('inbox'))).resolves.toBe('INBOX');
  });
});

describe('recoverEffect', () => {
  it('returns the original success value when the effect succeeds', async () => {
    await expect(
      Effect.runPromise(
        recoverEffect(Effect.succeed('ok'), {
          returnValue: () => 'fallback',
        }),
      ),
    ).resolves.toBe('ok');
  });

  it('reports the error and returns the fallback value when the effect fails', async () => {
    const onError = vi.fn();

    await expect(
      Effect.runPromise(
        recoverEffect(Effect.fail(new Error('boom')), {
          onError,
          returnValue: () => 'fallback',
        }),
      ),
    ).resolves.toBe('fallback');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('supports the pipe-friendly higher-order form', async () => {
    const onError = vi.fn();

    await expect(
      Effect.runPromise(
        Effect.fail(new Error('boom')).pipe(
          recoverEffect({
            onError,
            returnValue: () => 'fallback',
          }),
        ),
      ),
    ).resolves.toBe('fallback');

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
