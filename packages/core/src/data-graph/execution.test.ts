import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { runCollectArray } from '../computation/stream.js';

import {
  createDataGraphExecutor,
  createUpdateCommandSpec,
  entity,
  field,
  query,
  type DataGraphExecutionRuntime,
  type DataGraphObservationRuntime,
} from './index.js';

describe('data-graph executor', () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });

  it('defers runtime lookup until effects are executed and delegates every operation', async () => {
    const read = query(Book).where(book => book.slug.eq('progbook'));
    const command = createUpdateCommandSpec(Book, read.build().selection, { title: 'Updated' });
    const runtime = {
      get: vi.fn(() => Effect.succeed({ id: 'book-1', slug: 'progbook', title: 'Progbook' })),
      run: vi.fn(() => Effect.succeed([{ id: 'book-1', slug: 'progbook', title: 'Progbook' }])),
      count: vi.fn(() => Effect.succeed(1)),
      stream: vi.fn(() =>
        Stream.fromIterable([{ id: 'book-1', slug: 'progbook', title: 'Progbook' }]),
      ),
      observe: vi.fn(() => Stream.make([{ id: 'book-1', slug: 'progbook', title: 'Progbook' }])),
      runCommand: vi.fn(() => Effect.succeed({ id: 'book-1' })),
    } as unknown as DataGraphExecutionRuntime<
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    > &
      DataGraphObservationRuntime<never, { authority: 'viewer' }>;
    const getRuntime = vi.fn(() => runtime);
    const executor = createDataGraphExecutor(getRuntime);

    const getEffect = executor.getViewEffect(read, undefined, { authority: 'viewer' });

    expect(getRuntime).not.toHaveBeenCalled();
    await expect(Effect.runPromise(getEffect)).resolves.toEqual({
      id: 'book-1',
      slug: 'progbook',
      title: 'Progbook',
    });
    await expect(
      Effect.runPromise(executor.runViewEffect(read, undefined, { authority: 'viewer' })),
    ).resolves.toEqual([{ id: 'book-1', slug: 'progbook', title: 'Progbook' }]);
    await expect(
      Effect.runPromise(executor.countViewEffect(read, undefined, { authority: 'viewer' })),
    ).resolves.toBe(1);
    await expect(
      Effect.runPromise(
        runCollectArray(executor.streamViewEffect(read, undefined, { authority: 'viewer' })),
      ),
    ).resolves.toEqual([{ id: 'book-1', slug: 'progbook', title: 'Progbook' }]);
    await expect(
      Effect.runPromise(
        runCollectArray(executor.observeViewStream(read, undefined, { authority: 'viewer' })),
      ),
    ).resolves.toEqual([[{ id: 'book-1', slug: 'progbook', title: 'Progbook' }]]);
    await expect(
      Effect.runPromise(executor.runCommandEffect(command, { authority: 'system' })),
    ).resolves.toEqual({ id: 'book-1' });

    expect(runtime.get).toHaveBeenCalledWith(read, undefined, { authority: 'viewer' });
    expect(runtime.run).toHaveBeenCalledWith(read, undefined, { authority: 'viewer' });
    expect(runtime.count).toHaveBeenCalledWith(read, undefined, { authority: 'viewer' });
    expect(runtime.stream).toHaveBeenCalledWith(read, undefined, { authority: 'viewer' });
    expect(runtime.observe).toHaveBeenCalledWith(read, undefined, { authority: 'viewer' });
    expect(runtime.runCommand).toHaveBeenCalledWith(command, { authority: 'system' });
    expect(getRuntime).toHaveBeenCalledTimes(6);
  });

  it('fails explicitly when the current runtime has no Query observation capability', async () => {
    const runtime = {
      get: () => Effect.succeed(null),
      run: () => Effect.succeed([]),
      count: () => Effect.succeed(0),
      stream: () => Stream.empty,
      runCommand: () => Effect.succeed(undefined),
    } as unknown as DataGraphExecutionRuntime<never>;
    const executor = createDataGraphExecutor(() => runtime);

    await expect(
      Effect.runPromise(Stream.runDrain(executor.observeViewStream(query(Book), undefined))),
    ).rejects.toThrow('The current Data Graph runtime does not support Query observation.');
  });
});
