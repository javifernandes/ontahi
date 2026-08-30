import {
  createEntityRef,
  entity,
  entityMutationCommandDiagnosticFromError,
  field,
  mapEntity,
  mutateEntity,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseDataGraphRuntime } from './runtime.js';

type QueryOperation = { method: string; args: unknown[] };
type QueryResult = { data: unknown[] | null; error: { message: string } | null };

const createSupabaseDouble = (result: QueryResult) => {
  const operations: QueryOperation[] = [];
  const builder: Record<string, any> = {};
  for (const method of ['insert', 'update', 'delete', 'select', 'eq', 'in', 'is', 'or']) {
    builder[method] = (...args: unknown[]) => {
      operations.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve);
  const from = vi.fn(() => builder);
  return { client: { from }, from, operations };
};

const createStructuredError = (input: { message: string; logMessage: string; cause: unknown }) =>
  input;

const Author = entity('Author', { id: field.id(), name: field.string() });
const Book = entity('Book', {
  id: field.id(),
  title: field.string(),
  author: field.ref(Author),
});
mapEntity(Author).toTable('authors', { id: 'author_id' });
mapEntity(Book).toTable('books', {
  id: 'book_id',
  title: 'book_title',
  author: 'author_id',
});

const createRuntime = (supabase: ReturnType<typeof createSupabaseDouble>['client']) =>
  createSupabaseDataGraphRuntime({
    getReadClient: () => Effect.succeed(supabase),
    getCommandClient: () => Effect.succeed(supabase),
    createError: createStructuredError,
    entities: [Author, Book],
  });

describe('Supabase Entity Mutation Commands', () => {
  it('lowers reference payloads and materializes an exact created fact', async () => {
    const author = createEntityRef(Author, { id: 'author-1' });
    const supabase = createSupabaseDouble({
      data: [{ book_id: 'book-1', book_title: 'Ontahi', author_id: 'author-1' }],
      error: null,
    });

    const delta = await Effect.runPromise(
      createRuntime(supabase.client).runEntityMutationCommand(
        mutateEntity(Book).create({ id: 'book-1', title: 'Ontahi', author }),
      ),
    );

    expect(delta).toEqual({
      created: [
        {
          entityName: 'Book',
          ref: createEntityRef(Book, { id: 'book-1' }),
          values: { id: 'book-1', title: 'Ontahi', author },
        },
      ],
      updated: [],
      deleted: [],
    });
    expect(supabase.from).toHaveBeenCalledWith('books');
    expect(supabase.operations).toEqual([
      {
        method: 'insert',
        args: [{ book_id: 'book-1', book_title: 'Ontahi', author_id: 'author-1' }],
      },
      { method: 'select', args: ['book_id, book_title, author_id'] },
    ]);
  });

  it.each([
    {
      action: 'update',
      command: mutateEntity(Book).update(createEntityRef(Book, { id: 'book-1' }), {
        title: 'Revised',
      }),
      row: { book_id: 'book-1', book_title: 'Revised', author_id: 'author-1' },
      bucket: 'updated' as const,
      mutation: { method: 'update', args: [{ book_title: 'Revised' }] },
    },
    {
      action: 'delete',
      command: mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' })),
      row: { book_id: 'book-1', book_title: 'Ontahi', author_id: 'author-1' },
      bucket: 'deleted' as const,
      mutation: { method: 'delete', args: [] },
    },
  ])(
    'executes exact-identity $action with the matching delta bucket',
    async ({ command, row, bucket, mutation }) => {
      const supabase = createSupabaseDouble({ data: [row], error: null });

      const delta = await Effect.runPromise(
        createRuntime(supabase.client).runEntityMutationCommand(command),
      );

      expect(delta[bucket]).toEqual([
        {
          entityName: 'Book',
          ref: createEntityRef(Book, { id: 'book-1' }),
          values: {
            id: 'book-1',
            title: row.book_title,
            author: createEntityRef(Author, { id: 'author-1' }),
          },
        },
      ]);
      expect(supabase.operations).toEqual([
        mutation,
        { method: 'select', args: ['book_id, book_title, author_id'] },
        { method: 'eq', args: ['book_id', 'book-1'] },
      ]);
    },
  );

  it('preserves cardinality evidence when an exact target is missing', async () => {
    const command = mutateEntity(Book).delete(createEntityRef(Book, { id: 'missing' }));
    const supabase = createSupabaseDouble({ data: [], error: null });

    const result = await Effect.runPromise(
      createRuntime(supabase.client).runEntityMutationCommand(command).pipe(Effect.either),
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: { cause: { reason: 'cardinality_mismatch', actualAffectedRows: 0 } },
    });
    expect(
      result._tag === 'Left'
        ? entityMutationCommandDiagnosticFromError(result.left, command)
        : undefined,
    ).toMatchObject({
      reason: 'entity_mutation_cardinality_mismatch',
      rejection: { parameters: { entityName: 'Book', action: 'delete' } },
    });
  });

  it('applies a conditional mutation through one filtered provider request', async () => {
    const command = mutateEntity(Book).update(
      createEntityRef(Book, { id: 'book-1' }),
      { title: 'Revised' },
      { if: { title: 'Draft', author: createEntityRef(Author, { id: 'author-1' }) } },
    );
    const supabase = createSupabaseDouble({ data: [], error: null });

    const result = await Effect.runPromise(
      createRuntime(supabase.client).runEntityMutationCommand(command).pipe(Effect.either),
    );

    expect(supabase.from).toHaveBeenCalledOnce();
    expect(supabase.operations).toEqual([
      { method: 'update', args: [{ book_title: 'Revised' }] },
      { method: 'select', args: ['book_id, book_title, author_id'] },
      { method: 'eq', args: ['book_id', 'book-1'] },
      { method: 'eq', args: ['book_title', 'Draft'] },
      { method: 'eq', args: ['author_id', 'author-1'] },
    ]);
    expect(result).toMatchObject({
      _tag: 'Left',
      left: { cause: { reason: 'entity_mutation_condition_not_met', actualAffectedRows: 0 } },
    });
    expect(
      result._tag === 'Left'
        ? entityMutationCommandDiagnosticFromError(result.left, command)
        : undefined,
    ).toMatchObject({ reason: 'entity_mutation_condition_not_met' });
  });

  it('applies a conditional delete through one filtered provider request', async () => {
    const command = mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' }), {
      if: { title: 'Draft' },
    });
    const supabase = createSupabaseDouble({
      data: [{ book_id: 'book-1', book_title: 'Draft', author_id: 'author-1' }],
      error: null,
    });

    await expect(
      Effect.runPromise(createRuntime(supabase.client).runEntityMutationCommand(command)),
    ).resolves.toMatchObject({ deleted: [{ values: { title: 'Draft' } }] });
    expect(supabase.from).toHaveBeenCalledOnce();
    expect(supabase.operations).toEqual([
      { method: 'delete', args: [] },
      { method: 'select', args: ['book_id, book_title, author_id'] },
      { method: 'eq', args: ['book_id', 'book-1'] },
      { method: 'eq', args: ['book_title', 'Draft'] },
    ]);
  });

  it('does not collapse a multi-row conditional mutation into condition-not-met', async () => {
    const command = mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' }), {
      if: { title: 'Draft' },
    });
    const row = { book_id: 'book-1', book_title: 'Draft', author_id: 'author-1' };
    const supabase = createSupabaseDouble({ data: [row, row], error: null });

    await expect(
      Effect.runPromise(
        createRuntime(supabase.client).runEntityMutationCommand(command).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { cause: { reason: 'cardinality_mismatch', actualAffectedRows: 2 } },
    });
  });

  it('rejects unregistered Entities before acquiring a Supabase client', async () => {
    const Missing = entity('Missing', { id: field.id() });
    mapEntity(Missing).toTable('missing');
    const supabase = createSupabaseDouble({ data: [], error: null });
    const getCommandClient = vi.fn(() => Effect.succeed(supabase.client));
    const runtime = createSupabaseDataGraphRuntime({
      getReadClient: () => Effect.succeed(supabase.client),
      getCommandClient,
      createError: createStructuredError,
      entities: [Author, Book],
    });

    const result = await Effect.runPromise(
      runtime
        .runEntityMutationCommand(
          mutateEntity(Missing).delete(createEntityRef(Missing, { id: '1' })),
        )
        .pipe(Effect.either),
    );

    expect(result).toMatchObject({
      _tag: 'Left',
      left: {
        message: 'Supabase Entity Mutation Command is invalid.',
        cause: expect.objectContaining({ message: expect.stringContaining('unregistered Entity') }),
      },
    });
    expect(getCommandClient).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
