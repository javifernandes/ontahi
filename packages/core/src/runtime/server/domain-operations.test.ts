import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  createEntityRef,
  entity,
  field,
  graphSchema,
  value,
  type EntityRef,
} from '../../data-graph/index.js';

import {
  createDataGraphArchitectureAdapter,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  getCurrentInvocationContext,
  runServerDomainOperationRaw,
  withInvocationContext,
} from './index.js';

describe('server Domain Operation Ref resolution', () => {
  it('materializes existing participants through the authorized Data Graph Query runtime', async () => {
    const Book = entity('QueriedExistingOperationBook', {
      id: field.id(),
      title: field.string(),
    });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        QueriedExistingOperationBook: [{ id: 'book-1', title: 'Programming Book' }],
      },
    });
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      unknown,
      undefined,
      undefined,
      typeof runtime
    >({ createRuntime: () => runtime });
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({ book: graphSchema.existingRef(Book) }),
          concerns: [graph.withRuntime()],
          run: ({ book }) => Effect.succeed({ title: book.title, ref: book.ref }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.existing-ref.query' },
    ).inspect;
    const book = createEntityRef(Book, { id: 'book-1' });

    const result = await runServerDomainOperationRaw(inspect, { book });

    expect(result).toEqual({
      success: true,
      data: { title: 'Programming Book', ref: book },
    });
  });

  it('materializes existing Ref participants once and preserves their portable identity', async () => {
    const Book = entity('ExistingOperationBook', {
      id: field.id(),
      title: field.string(),
    });
    const row = { id: 'book-1', title: 'Programming Book' };
    const load = vi.fn(() => Effect.succeed(row));
    const existingBook = graphSchema.existingRef(Book).resolveWith(load);
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: value('ExistingOperationInput', {
            first: existingBook,
            second: existingBook,
          }),
          run: ({ first, second }) => {
            expectTypeOf(first.id).toEqualTypeOf<string>();
            expectTypeOf(first.title).toEqualTypeOf<string>();
            expectTypeOf(first.ref).toEqualTypeOf<EntityRef<'ExistingOperationBook'>>();
            expectTypeOf(first).not.toHaveProperty('resolve');

            return Effect.succeed({
              firstRef: first.ref,
              firstKeys: Object.keys(first),
              sameResolution: first.title === second.title,
              secondRef: second.ref,
            });
          },
        }),
      },
      { exposure: 'server-only', layer: 'tests.existing-ref.materialization' },
    ).inspect;
    const book = createEntityRef(Book, { id: 'book-1' });

    const result = await runServerDomainOperationRaw(inspect, { first: book, second: book });

    expect(result).toEqual({
      success: true,
      data: {
        firstRef: book,
        firstKeys: ['id', 'title'],
        sameResolution: true,
        secondRef: book,
      },
    });
    expect(load).toHaveBeenCalledOnce();
    expect(row).not.toHaveProperty('ref');
    expect(book).toEqual({
      kind: 'entity-ref',
      entityName: 'ExistingOperationBook',
      locator: { id: 'book-1' },
    });
  });

  it('fails conventionally before the body when an existing Ref is not visible', async () => {
    const Book = entity('MissingExistingOperationBook', { id: field.id() });
    const body = vi.fn(() => Effect.succeed({ reached: true }));
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({
            book: graphSchema.existingRef(Book).resolveWith(() => Effect.succeed(null)),
          }),
          run: body,
        }),
      },
      { exposure: 'server-only', layer: 'tests.existing-ref.missing' },
    ).inspect;

    const result = await runServerDomainOperationRaw(inspect, {
      book: createEntityRef(Book, { id: 'missing' }),
    });

    expect(result).toEqual({
      success: false,
      reason: 'entity_not_found',
      message: 'Referenced MissingExistingOperationBook was not found.',
      entityName: 'MissingExistingOperationBook',
      inputPath: 'book',
      error: 'Referenced MissingExistingOperationBook was not found.',
      errorType: 'entity_not_found',
    });
    expect(body).not.toHaveBeenCalled();
  });

  it('skips absent optional and nullable existing participants', async () => {
    const Book = entity('OptionalExistingOperationBook', { id: field.id() });
    const load = vi.fn(() => Effect.succeed({ id: 'book-1' }));
    const existingBook = graphSchema.existingRef(Book).resolveWith(load);
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({
            nullableBook: graphSchema.nullable(existingBook),
            optionalBook: graphSchema.optional(existingBook),
          }),
          run: ({ nullableBook, optionalBook }) => Effect.succeed({ nullableBook, optionalBook }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.existing-ref.optional' },
    ).inspect;

    const result = await runServerDomainOperationRaw(inspect, { nullableBook: null });

    expect(result).toEqual({ success: true, data: { nullableBook: null } });
    expect(load).not.toHaveBeenCalled();
  });

  it('rejects unsupported nested and durable existing Ref declarations', () => {
    const Book = entity('UnsupportedExistingOperationBook', { id: field.id() });

    expect(() =>
      defineDomainOperation({
        input: graphSchema.object({
          nested: graphSchema.object({ book: graphSchema.existingRef(Book) }),
        }),
        run: () => Effect.void,
      }),
    ).toThrow(
      'Operation input field "nested" nests graphSchema.existingRef(...); only direct top-level fields are supported.',
    );
    expect(() =>
      defineDomainOperation({
        input: graphSchema.object({
          books: graphSchema.array(graphSchema.existingRef(Book)),
        }),
        run: () => Effect.void,
      }),
    ).toThrow(
      'Operation input field "books" nests graphSchema.existingRef(...); only direct top-level fields are supported.',
    );
    expect(() =>
      defineDomainOperation({
        durable: { runtime: 'in-process' },
        input: graphSchema.object({ book: graphSchema.existingRef(Book) }),
        run: () => Effect.void,
      } as never),
    ).toThrow(
      'Durable Domain Operations cannot use graphSchema.existingRef(...) until deferred resolution lifecycle semantics are defined.',
    );
  });

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

  it('hydrates only direct Ref fields declared at the Operation input root', async () => {
    const Book = entity('UnitOfWorkTopLevelBook', {
      id: field.id(),
    });
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({
            books: graphSchema.array(graphSchema.ref(Book)),
            direct: graphSchema.ref(Book),
            nested: graphSchema.object({ book: graphSchema.ref(Book) }),
            payload: graphSchema.json<EntityRef<'UnitOfWorkTopLevelBook', { id: string }>>(),
          }),
          run: ({ books, direct, nested, payload }) => {
            type NestedBook = typeof nested.book;
            type BookItem = (typeof books)[number];

            expectTypeOf(direct).toHaveProperty('resolve');
            expectTypeOf<NestedBook>().not.toHaveProperty('resolve');
            expectTypeOf<BookItem>().not.toHaveProperty('resolve');
            expectTypeOf(payload).not.toHaveProperty('resolve');

            return Effect.succeed({
              arrayMethod: typeof (books[0] as { resolve?: unknown }).resolve,
              directMethod: typeof direct.resolve,
              nestedMethod: typeof (nested.book as { resolve?: unknown }).resolve,
              payloadMethod: typeof (payload as { resolve?: unknown }).resolve,
            });
          },
        }),
      },
      { exposure: 'server-only', layer: 'tests.unit-of-work.top-level-refs' },
    ).inspect;
    const book = createEntityRef(Book, { id: 'book-1' });

    const result = await runServerDomainOperationRaw(inspect, {
      books: [book],
      direct: book,
      nested: { book },
      payload: book,
    });

    expect(result).toEqual({
      success: true,
      data: {
        arrayMethod: 'undefined',
        directMethod: 'function',
        nestedMethod: 'undefined',
        payloadMethod: 'undefined',
      },
    });
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
