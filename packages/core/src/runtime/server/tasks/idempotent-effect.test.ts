import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { defineIdempotentTaskEffect } from './idempotent-effect.js';

it('reuses prepared input and key, distinguishes occurrences and stops after expiry', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(100);
  try {
    const execute = vi.fn((input: { name: string; region: string }, key: string) =>
      Effect.succeed({ input, key }),
    );
    const effect = defineIdempotentTaskEffect({ id: 'create', retryWindowMs: 50, execute });
    const run = { taskId: 'CreateCustomer', runId: 'run-1' };
    const input = { region: 'eu', name: 'Ada' };
    const prepared = effect.prepare(run, 'first', input);
    expect(effect.prepare(run, 'second', input).providerKey).not.toBe(prepared.providerKey);
    input.name = 'changed';
    const first = await Effect.runPromise(effect.run(prepared));
    const reloaded = JSON.parse(JSON.stringify(prepared)) as typeof prepared;
    const replay = await Effect.runPromise(
      effect.run({ ...reloaded, input: { name: 'Ada', region: 'eu' } }),
    );
    expect(replay).toEqual(first);
    expect(Object.keys(first.input)).toEqual(['name', 'region']);

    await expect(
      Effect.runPromise(
        Effect.flip(effect.run({ ...prepared, input: { name: 'changed', region: 'eu' } })),
      ),
    ).resolves.toMatchObject({ reason: 'task_effect_checkpoint_invalid' });

    now.mockReturnValue(150);
    await expect(Effect.runPromise(Effect.flip(effect.run(prepared)))).resolves.toMatchObject({
      reason: 'task_effect_outcome_ambiguous',
    });
    expect(execute).toHaveBeenCalledTimes(2);
  } finally {
    now.mockRestore();
  }
});
