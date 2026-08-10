import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { booleanComputation, nothing } from '../../src/computation/conditional.js';

describe('boolean computation', () => {
  it('selects one lazy computation branch', async () => {
    const whenTrue = vi.fn(() => Effect.succeed('yes'));
    const whenFalse = vi.fn(() => Effect.succeed('no'));

    await expect(
      Effect.runPromise(booleanComputation(Effect.succeed(true)).thenIf(whenTrue, whenFalse)),
    ).resolves.toBe('yes');
    expect(whenTrue).toHaveBeenCalledOnce();
    expect(whenFalse).not.toHaveBeenCalled();
  });

  it('defaults the false branch to nothing', async () => {
    await expect(
      Effect.runPromise(booleanComputation(Effect.succeed(false)).thenIf(Effect.fail('unused'))),
    ).resolves.toBeUndefined();
    await expect(Effect.runPromise(nothing)).resolves.toBeUndefined();
  });
});
