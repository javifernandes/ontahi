import { createEntityRef, entity, field, mutateEntity } from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { executePostgresEntityMutationCommand } from './command-runtime.js';
import { postgresMapping } from './mapping.js';

const Author = entity('Author', { id: field.id(), name: field.string() });
const Book = entity('Book', {
  id: field.id(),
  title: field.string(),
  author: field.ref(Author),
});
const bookMapping = postgresMapping({
  entity: Book,
  table: 'books',
  columns: { id: 'book_id', title: 'book_title', author: 'author_id' },
});

describe('PostgreSQL Entity Mutation Commands', () => {
  it('lowers reference payloads and materializes an exact created fact', async () => {
    const author = createEntityRef(Author, { id: 'author-1' });
    const command = mutateEntity(Book).create({ id: 'book-1', title: 'Ontahi', author });
    const executeQuery = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ id: 'book-1', title: 'Ontahi', author: 'author-1' }],
    });

    await expect(
      Effect.runPromise(
        executePostgresEntityMutationCommand({ command, mapping: bookMapping, executeQuery }),
      ),
    ).resolves.toEqual({
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
    expect(executeQuery.mock.calls[0]?.[0]).toMatchObject({
      text: expect.stringContaining('INSERT INTO "books"'),
      values: expect.arrayContaining(['book-1', 'Ontahi', 'author-1']),
    });
  });

  it.each([
    {
      action: 'update',
      command: mutateEntity(Book).update(createEntityRef(Book, { id: 'book-1' }), {
        title: 'Revised',
      }),
      row: { id: 'book-1', title: 'Revised', author: 'author-1' },
      bucket: 'updated',
      statement: 'UPDATE "books"',
    },
    {
      action: 'delete',
      command: mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' })),
      row: { id: 'book-1', title: 'Ontahi', author: 'author-1' },
      bucket: 'deleted',
      statement: 'DELETE FROM "books"',
    },
  ])(
    'executes exact-identity $action with the matching delta bucket',
    async ({ command, row, bucket, statement }) => {
      const executeQuery = vi.fn().mockResolvedValue({ rowCount: 1, rows: [row] });
      const delta = await Effect.runPromise(
        executePostgresEntityMutationCommand({ command, mapping: bookMapping, executeQuery }),
      );

      expect(delta[bucket as 'updated' | 'deleted']).toEqual([
        {
          entityName: 'Book',
          ref: createEntityRef(Book, { id: 'book-1' }),
          values: {
            ...row,
            author: createEntityRef(Author, { id: 'author-1' }),
          },
        },
      ]);
      expect(executeQuery.mock.calls[0]?.[0]).toMatchObject({
        text: expect.stringContaining(statement),
        values: expect.arrayContaining(['book-1']),
      });
    },
  );

  it('fails exact identity mutations when no row is affected', async () => {
    const command = mutateEntity(Book).delete(createEntityRef(Book, { id: 'missing' }));
    const result = await Effect.runPromise(
      executePostgresEntityMutationCommand({
        command,
        mapping: bookMapping,
        executeQuery: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      }).pipe(Effect.either),
    );

    expect(result).toMatchObject({ _tag: 'Left', left: { reason: 'cardinality_mismatch' } });
  });

  it('compiles a conditional update as one atomic SQL statement', async () => {
    const command = mutateEntity(Book).update(
      createEntityRef(Book, { id: 'book-1' }),
      { title: 'Revised' },
      { if: { title: 'Draft', author: createEntityRef(Author, { id: 'author-1' }) } },
    );
    const executeQuery = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });

    const result = await Effect.runPromise(
      executePostgresEntityMutationCommand({ command, mapping: bookMapping, executeQuery }).pipe(
        Effect.either,
      ),
    );

    expect(executeQuery).toHaveBeenCalledOnce();
    expect(executeQuery.mock.calls[0]?.[0]).toEqual({
      text: expect.stringMatching(
        /UPDATE "books" SET "book_title" = \$4 WHERE \("book_id" = \$1 AND "book_title" = \$2 AND "author_id" = \$3\)/,
      ),
      values: ['book-1', 'Draft', 'author-1', 'Revised'],
    });
    expect(result).toMatchObject({
      _tag: 'Left',
      left: { reason: 'entity_mutation_condition_not_met' },
    });
  });

  it('compiles a conditional delete as one atomic SQL statement', async () => {
    const command = mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' }), {
      if: { title: 'Draft' },
    });
    const executeQuery = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ id: 'book-1', title: 'Draft', author: 'author-1' }],
    });

    await expect(
      Effect.runPromise(
        executePostgresEntityMutationCommand({ command, mapping: bookMapping, executeQuery }),
      ),
    ).resolves.toMatchObject({ deleted: [{ values: { title: 'Draft' } }] });
    expect(executeQuery).toHaveBeenCalledOnce();
    expect(executeQuery.mock.calls[0]?.[0]).toEqual({
      text: expect.stringMatching(
        /DELETE FROM "books" WHERE \("book_id" = \$1 AND "book_title" = \$2\)/,
      ),
      values: ['book-1', 'Draft'],
    });
  });

  it('does not collapse a multi-row conditional mutation into condition-not-met', async () => {
    const command = mutateEntity(Book).delete(createEntityRef(Book, { id: 'book-1' }), {
      if: { title: 'Draft' },
    });
    const executeQuery = vi.fn().mockResolvedValue({ rowCount: 2, rows: [] });

    await expect(
      Effect.runPromise(
        executePostgresEntityMutationCommand({ command, mapping: bookMapping, executeQuery }).pipe(
          Effect.either,
        ),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
  });
});
