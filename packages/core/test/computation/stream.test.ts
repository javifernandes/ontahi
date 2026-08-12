import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { Stream, grouped, runCollectArray } from '../../src/computation/stream.js';

describe('runCollectArray', () => {
  it('collects a stream into a plain readonly array', async () => {
    await expect(
      runCollectArray(Stream.fromIterable([1, 2, 3])).pipe(Effect.runPromise),
    ).resolves.toEqual([1, 2, 3]);
  });
});

describe('grouped', () => {
  it('keeps grouped chunks as a stream-level batching primitive', async () => {
    const result = await Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
      grouped(2),
      runCollectArray,
      Effect.runPromise,
    );

    expect(result.map(chunk => Array.from(chunk))).toEqual([[1, 2], [3, 4], [5]]);
  });
});
