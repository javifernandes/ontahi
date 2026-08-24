import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createEntityRef, entity, field, graphSchema } from '../../data-graph/index.js';

import {
  defineDomainOperation,
  defineDomainOperationsForEntity,
  getCurrentInvocationContext,
  runServerDomainOperationRaw,
  withInvocationContext,
} from './index.js';

describe('server Domain Operation Ref resolution', () => {
  it('shares nested resolveWith work through the UnitOfWork and honors invalidation', async () => {
    const Book = entity('UnitOfWorkBook', {
      id: field.id(),
      title: field.string(),
    });
    let queryCount = 0;
    const load = vi.fn(ref => Effect.sync(() => ({ ref, sequence: (queryCount += 1) })));
    const input = graphSchema.object({ book: graphSchema.ref(Book).resolveWith(load) });
    const inner = defineDomainOperationsForEntity(
      Book,
      {
        resolve: defineDomainOperation({
          input,
          run: ({ book }) => book.resolve(),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-resolution' },
    ).resolve;
    const operations = defineDomainOperationsForEntity(
      Book,
      {
        resolveNested: defineDomainOperation({
          input,
          run: ({ book }) =>
            Effect.gen(function* () {
              const first = yield* book.resolve();
              const nested = yield* Effect.promise(() =>
                runServerDomainOperationRaw(inner, { book }),
              );
              if (!nested.success) return yield* Effect.die(new Error(nested.error));
              book.invalidate();
              const afterInvalidation = yield* book.resolve();
              const refreshed = yield* book.refresh();
              return { afterInvalidation, first, nested: nested.data, refreshed };
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-resolution' },
    );
    const book = createEntityRef(Book, { id: 'book-1' });

    const firstRun = await runServerDomainOperationRaw(operations.resolveNested, { book });
    const secondRun = await runServerDomainOperationRaw(operations.resolveNested, { book });

    expect(firstRun).toEqual({
      success: true,
      data: {
        first: { ref: book, sequence: 1 },
        nested: { ref: book, sequence: 1 },
        afterInvalidation: { ref: book, sequence: 2 },
        refreshed: { ref: book, sequence: 3 },
      },
    });
    expect(secondRun).toEqual({
      success: true,
      data: {
        first: { ref: book, sequence: 4 },
        nested: { ref: book, sequence: 4 },
        afterInvalidation: { ref: book, sequence: 5 },
        refreshed: { ref: book, sequence: 6 },
      },
    });
    expect(load).toHaveBeenCalledTimes(6);
    expect(queryCount).toBe(6);
  });

  it('keeps resolver projections isolated for the same Ref', async () => {
    const Book = entity('UnitOfWorkProjectedBook', {
      id: field.id(),
      title: field.string(),
    });
    const loadSummary = vi.fn(() => Effect.succeed({ title: 'Programming Book' }));
    const loadDetails = vi.fn(() => Effect.succeed({ pageCount: 320 }));
    const operations = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({
            detailBook: graphSchema.ref(Book).resolveWith(loadDetails),
            summaryBook: graphSchema.ref(Book).resolveWith(loadSummary),
          }),
          run: ({ detailBook, summaryBook }) =>
            Effect.all({
              details: detailBook.resolve(),
              summary: summaryBook.resolve(),
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-projections' },
    );
    const book = createEntityRef(Book, { id: 'book-1' });

    const result = await runServerDomainOperationRaw(operations.inspect, {
      detailBook: book,
      summaryBook: book,
    });

    expect(result).toEqual({
      success: true,
      data: {
        details: { pageCount: 320 },
        summary: { title: 'Programming Book' },
      },
    });
    expect(loadDetails).toHaveBeenCalledOnce();
    expect(loadSummary).toHaveBeenCalledOnce();
  });

  it('does not reuse a resolution across Principal boundaries in one resource scope', async () => {
    const Book = entity('UnitOfWorkAuthorizedBook', {
      id: field.id(),
      title: field.string(),
    });
    const load = vi.fn(() =>
      Effect.sync(() => ({
        subject: getCurrentInvocationContext()?.principal?.subject ?? 'anonymous',
      })),
    );
    const input = graphSchema.object({ book: graphSchema.ref(Book).resolveWith(load) });
    const inner = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input,
          run: ({ book }) => book.resolve(),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-authority' },
    ).inspect;
    const outer = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input,
          run: ({ book }) =>
            Effect.gen(function* () {
              const first = yield* book.resolve();
              const nested = yield* Effect.promise(() =>
                withInvocationContext({ principal: { kind: 'user', subject: 'reader-2' } }, () =>
                  runServerDomainOperationRaw(inner, { book }),
                ),
              );
              if (!nested.success) return yield* Effect.die(new Error(nested.error));
              const restored = yield* book.resolve();
              return { first, nested: nested.data, restored };
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-authority' },
    ).inspect;
    const book = createEntityRef(Book, { id: 'book-1' });

    const result = await withInvocationContext(
      { principal: { kind: 'user', subject: 'reader-1' } },
      () => runServerDomainOperationRaw(outer, { book }),
    );

    expect(result).toEqual({
      success: true,
      data: {
        first: { subject: 'reader-1' },
        nested: { subject: 'reader-2' },
        restored: { subject: 'reader-1' },
      },
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps runtime Ref methods off the caller value and its portable serialization', async () => {
    const Book = entity('UnitOfWorkPortableBook', {
      id: field.id(),
      title: field.string(),
    });
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({
            book: graphSchema.ref(Book).resolveWith(ref => Effect.succeed({ ref })),
          }),
          run: ({ book }) =>
            Effect.succeed({
              enumerableKeys: Object.keys(book),
              json: JSON.stringify(book),
              methods: [typeof book.resolve, typeof book.invalidate, typeof book.refresh],
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-portability' },
    ).inspect;
    const book = createEntityRef(Book, { id: 'book-1' });

    const result = await runServerDomainOperationRaw(inspect, { book });

    expect(result).toEqual({
      success: true,
      data: {
        enumerableKeys: ['kind', 'entityName', 'locator'],
        json: JSON.stringify(book),
        methods: ['function', 'function', 'function'],
      },
    });
    expect(book).not.toHaveProperty('resolve');
    expect(book).not.toHaveProperty('invalidate');
    expect(book).not.toHaveProperty('refresh');
  });

  it('preserves optional and nullable schema-native Refs', async () => {
    const Book = entity('UnitOfWorkOptionalBook', {
      id: field.id(),
    });
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({
            nullableBook: graphSchema.nullable(graphSchema.ref(Book)),
            optionalBook: graphSchema.optional(graphSchema.ref(Book)),
          }),
          run: input => Effect.succeed(input),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.optional-refs' },
    ).inspect;

    const result = await runServerDomainOperationRaw(inspect, { nullableBook: null });

    expect(result).toEqual({ success: true, data: { nullableBook: null } });
  });
});
