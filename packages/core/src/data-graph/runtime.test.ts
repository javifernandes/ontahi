import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  createInMemoryDataGraphStorage,
  createUpdateCommandSpec,
  entity,
  field,
  mapEntity,
  query,
} from './index.js';

describe('data-graph runtime contract', () => {
  it('allows the in-memory runtime to satisfy the shared runtime interface', async () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });

    mapEntity(Book).toTable('books');

    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [{ id: 'book-1', slug: 'progbook' }],
      },
    });

    const result = await Effect.runPromise(
      runtime.get(
        query(Book).where(book => book.slug.eq('progbook')),
        undefined,
      ),
    );

    expect(result).toEqual({
      id: 'book-1',
      slug: 'progbook',
    });
  });

  it('observes complete Query results as successful commands change membership and order', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      published: field.boolean(),
    });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [
          { id: 'book-1', title: 'Beta', published: true },
          { id: 'book-2', title: 'Alpha', published: false },
        ],
      },
    });
    const publishedBooks = query(Book)
      .where(book => book.published.eq(true))
      .select(book => ({ id: book.id, title: book.title }))
      .orderBy(book => book.title.asc());
    const observations: Array<Array<{ id: string; title: string }>> = [];
    const observationFiber = Effect.runFork(
      runtime.observe(publishedBooks, undefined).pipe(
        Stream.take(3),
        Stream.runForEach(value => Effect.sync(() => observations.push(value))),
      ),
    );

    await vi.waitFor(() => expect(observations).toEqual([[{ id: 'book-1', title: 'Beta' }]]));

    await Effect.runPromise(
      runtime.runCommand(
        createUpdateCommandSpec(
          Book,
          query(Book)
            .where(book => book.id.eq('book-2'))
            .build().selection,
          { published: true },
        ),
      ),
    );
    await vi.waitFor(() =>
      expect(observations).toEqual([
        [{ id: 'book-1', title: 'Beta' }],
        [
          { id: 'book-2', title: 'Alpha' },
          { id: 'book-1', title: 'Beta' },
        ],
      ]),
    );

    await Effect.runPromise(
      runtime.runCommand(
        createUpdateCommandSpec(
          Book,
          query(Book)
            .where(book => book.id.eq('book-1'))
            .build().selection,
          { published: false },
        ),
      ),
    );
    await Effect.runPromise(Fiber.join(observationFiber));

    expect(observations).toEqual([
      [{ id: 'book-1', title: 'Beta' }],
      [
        { id: 'book-2', title: 'Alpha' },
        { id: 'book-1', title: 'Beta' },
      ],
      [{ id: 'book-2', title: 'Alpha' }],
    ]);
  });

  it('shares observations across storage runtimes and publishes only committed transactions', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      published: field.boolean(),
    });
    const storage = createInMemoryDataGraphStorage({
      entities: [Book],
      dataset: {
        Book: [{ id: 'book-1', title: 'Initial', published: false }],
      },
    });
    const observingRuntime = storage.createRuntime();
    const mutatingRuntime = storage.createRuntime();
    const books = query(Book).select(book => ({
      id: book.id,
      title: book.title,
      published: book.published,
    }));
    const observations: Array<Array<{ id: string; title: string; published: boolean }>> = [];
    const observationFiber = Effect.runFork(
      observingRuntime.observe(books, undefined).pipe(
        Stream.take(2),
        Stream.runForEach(value => Effect.sync(() => observations.push(value))),
      ),
    );
    const selectBook = query(Book)
      .where(book => book.id.eq('book-1'))
      .build().selection;

    await vi.waitFor(() => expect(observations).toHaveLength(1));

    const failedTransaction = mutatingRuntime.transaction(transactionRuntime =>
      transactionRuntime
        .runCommand(createUpdateCommandSpec(Book, selectBook, { published: true }))
        .pipe(Effect.zipRight(Effect.fail('rollback'))),
    );
    const failedResult = await Effect.runPromise(Effect.either(failedTransaction));
    expect(failedResult._tag).toBe('Left');
    if (failedResult._tag === 'Left') expect(failedResult.left).toBe('rollback');
    expect(observations).toHaveLength(1);

    await Effect.runPromise(
      mutatingRuntime.transaction(transactionRuntime =>
        transactionRuntime.runCommand(
          createUpdateCommandSpec(Book, selectBook, { title: 'Committed' }),
        ),
      ),
    );
    await Effect.runPromise(Fiber.join(observationFiber));

    expect(observations).toEqual([
      [{ id: 'book-1', title: 'Initial', published: false }],
      [{ id: 'book-1', title: 'Committed', published: false }],
    ]);
  });
});
