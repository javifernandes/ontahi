import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  defineEntityRefInput,
  entity,
  field,
  graphSchema,
} from '../../data-graph/index.js';

import {
  defineDomainOperation,
  defineDomainOperationsForEntity,
  getCurrentInvocationContext,
  getRequiredUnitOfWork,
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
    const bookInput = defineEntityRefInput(Book).resolveWith(load);
    const input = graphSchema.object({ book: field.ref(Book) });
    const inner = defineDomainOperationsForEntity(
      Book,
      {
        resolve: defineDomainOperation({
          input,
          inputRefs: { book: bookInput },
          run: ({ refs }) => refs.book.resolve(),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-resolution' },
    ).resolve;
    const operations = defineDomainOperationsForEntity(
      Book,
      {
        resolveNested: defineDomainOperation({
          input,
          inputRefs: { book: bookInput },
          run: ({ refs }) =>
            Effect.gen(function* () {
              const first = yield* refs.book.resolve();
              const nested = yield* Effect.promise(() =>
                runServerDomainOperationRaw(inner, { book: refs.book }),
              );
              if (!nested.success) return yield* Effect.die(new Error(nested.error));
              getRequiredUnitOfWork().refs.invalidate(refs.book);
              const afterInvalidation = yield* refs.book.resolve();
              return { afterInvalidation, first, nested: nested.data };
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
      },
    });
    expect(secondRun).toEqual({
      success: true,
      data: {
        first: { ref: book, sequence: 3 },
        nested: { ref: book, sequence: 3 },
        afterInvalidation: { ref: book, sequence: 4 },
      },
    });
    expect(load).toHaveBeenCalledTimes(4);
    expect(queryCount).toBe(4);
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
            detailBook: field.ref(Book),
            summaryBook: field.ref(Book),
          }),
          inputRefs: {
            detailBook: defineEntityRefInput(Book).resolveWith(loadDetails),
            summaryBook: defineEntityRefInput(Book).resolveWith(loadSummary),
          },
          run: ({ refs }) =>
            Effect.all({
              details: refs.detailBook.resolve(),
              summary: refs.summaryBook.resolve(),
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
    const input = graphSchema.object({ book: field.ref(Book) });
    const bookInput = defineEntityRefInput(Book).resolveWith(load);
    const inner = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input,
          inputRefs: { book: bookInput },
          run: ({ refs }) => refs.book.resolve(),
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.ref-authority' },
    ).inspect;
    const outer = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input,
          inputRefs: { book: bookInput },
          run: ({ refs }) =>
            Effect.gen(function* () {
              const first = yield* refs.book.resolve();
              const nested = yield* Effect.promise(() =>
                withInvocationContext({ principal: { kind: 'user', subject: 'reader-2' } }, () =>
                  runServerDomainOperationRaw(inner, { book: refs.book }),
                ),
              );
              if (!nested.success) return yield* Effect.die(new Error(nested.error));
              const restored = yield* refs.book.resolve();
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
});
