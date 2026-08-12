import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { runCollectArray } from '../../src/computation/stream.js';
import {
  bindGraphRead,
  createExecutableGraphRead,
  entity,
  field,
  query,
  type GraphReadExecutor,
} from '../../src/data-graph/index.js';

describe('data-graph read binding', () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
  });

  const createExecutor = (): GraphReadExecutor<never, { authority: 'server' }> =>
    ({
      get: vi.fn((_read, _params, options) =>
        Effect.succeed({ mode: 'get', authority: options?.authority }),
      ),
      run: vi.fn((_read, _params, options) =>
        Effect.succeed([{ mode: 'run', authority: options?.authority }]),
      ),
      count: vi.fn((_read, _params, options) =>
        Effect.succeed(options?.authority === 'server' ? 1 : 0),
      ),
      stream: vi.fn((_read, _params, options) =>
        Stream.fromIterable([{ mode: 'stream', authority: options?.authority }]),
      ),
    }) as unknown as GraphReadExecutor<never, { authority: 'server' }>;

  it('creates executable reads that delegate every operation to the executor', async () => {
    const read = query(Book).where(book => book.slug.eq('progbook'));
    const executor = createExecutor();
    const executable = createExecutableGraphRead(read, executor);

    await expect(
      Effect.runPromise(executable.get(undefined, { authority: 'server' })),
    ).resolves.toEqual({ mode: 'get', authority: 'server' });
    await expect(
      Effect.runPromise(executable.run(undefined, { authority: 'server' })),
    ).resolves.toEqual([{ mode: 'run', authority: 'server' }]);
    await expect(
      Effect.runPromise(executable.count(undefined, { authority: 'server' })),
    ).resolves.toBe(1);
    await expect(
      Effect.runPromise(runCollectArray(executable.stream(undefined, { authority: 'server' }))),
    ).resolves.toEqual([{ mode: 'stream', authority: 'server' }]);
    expect(executable.pipe(value => value)).toBe(executable);
    expect(executor.get).toHaveBeenCalledWith(read, undefined, { authority: 'server' });
    expect(executor.run).toHaveBeenCalledWith(read, undefined, { authority: 'server' });
    expect(executor.count).toHaveBeenCalledWith(read, undefined, { authority: 'server' });
    expect(executor.stream).toHaveBeenCalledWith(read, undefined, { authority: 'server' });
  });

  it('binds executable helpers onto the read object while preserving pipe identity', async () => {
    const read = query(Book).select(book => ({
      slug: book.slug,
    }));
    const executor = createExecutor();
    const bound = bindGraphRead(read, executor);

    expect(bound).toBe(read);
    expect(bound.exec().pipe(value => value)).toBe(bound.exec());
    expect(bound.pipe(value => value)).toBe(bound);
    await expect(Effect.runPromise(bound.get(undefined, { authority: 'server' }))).resolves.toEqual(
      { mode: 'get', authority: 'server' },
    );
  });
});
