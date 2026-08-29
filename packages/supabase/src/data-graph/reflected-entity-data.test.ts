import { entity, field, mapEntity, mapRelation, modelExpression } from '@ontahi/core/data-graph';
import { beforeEach, describe, expect, it } from 'vitest';

import { createSupabaseReflectedEntityDataReader } from './index.js';

const supabaseMock = {
  attempts: [] as Array<{
    filters: unknown[];
    orders: unknown[];
    range: { from: number; to: number } | null;
    search: string | null;
    select: string;
    table: string;
  }>,
};

const createSupabaseClient = (
  rowsByTable: Record<string, Array<Record<string, unknown>>> = {},
) => ({
  from: (table: string) => {
    const attempt = {
      filters: [] as unknown[],
      orders: [] as unknown[],
      range: null as { from: number; to: number } | null,
      search: null as string | null,
      select: '',
      table,
    };
    const query = {
      eq: (column: string, value: unknown) => {
        attempt.filters.push({ column, operator: 'eq', value });
        return query;
      },
      ilike: (column: string, value: unknown) => {
        attempt.filters.push({ column, operator: 'ilike', value });
        return query;
      },
      in: (column: string, values: unknown[]) => {
        attempt.filters.push({ column, operator: 'in', values });
        return query;
      },
      is: (column: string, value: null) => {
        attempt.filters.push({ column, operator: 'is', value });
        return query;
      },
      or: (search: string) => {
        attempt.search = search;
        return query;
      },
      order: (column: string, options: { ascending: boolean }) => {
        attempt.orders.push({ column, options });
        return query;
      },
      range: async (from: number, to: number) => {
        attempt.range = { from, to };
        supabaseMock.attempts.push(attempt);

        if (attempt.select.includes('content_hash')) {
          return {
            count: null,
            data: null,
            error: {
              message: 'column content_nodes.content_hash does not exist',
            },
          };
        }

        const configuredRows = rowsByTable[table];
        const rows = configuredRows
          ? configuredRows.filter(row =>
              attempt.filters.every(filter => {
                const candidate = filter as {
                  column: string;
                  operator: string;
                  value?: unknown;
                  values?: unknown[];
                };

                if (candidate.operator === 'in') {
                  return candidate.values?.includes(row[candidate.column]);
                }

                if (candidate.operator === 'eq') {
                  return row[candidate.column] === candidate.value;
                }

                return true;
              }),
            )
          : [
              {
                id: 'node-1',
                title: 'Intro',
              },
            ];

        return {
          count: rows.length,
          data: rows.slice(from, to + 1),
          error: null,
        };
      },
      select: (columns: string) => {
        attempt.select = columns;
        return query;
      },
    };

    return query;
  },
});

describe('Supabase reflected entity data reader', () => {
  beforeEach(() => {
    supabaseMock.attempts = [];
  });

  it('retries without mapped columns missing from the live table', async () => {
    const ContentNode = entity('ContentNode', {
      id: field.id(),
      title: field.string(),
      contentHash: field.nullable(field.string()),
    });
    mapEntity(ContentNode).toTable('content_nodes', {
      contentHash: 'content_hash',
    });
    const reader = createSupabaseReflectedEntityDataReader({
      entities: [ContentNode],
      getClient: createSupabaseClient,
    });

    const result = await reader.readEntityData({
      entityName: 'ContentNode',
      filters: [{ field: 'contentHash', operator: 'contains', value: 'abc' }],
      page: 1,
      pageSize: 25,
      search: 'intro',
      sort: { field: 'contentHash', direction: 'desc' },
    });

    expect(supabaseMock.attempts.map(attempt => attempt.select)).toEqual([
      'id, title, content_hash',
      'id, title',
    ]);
    expect(supabaseMock.attempts[1]?.search).toBe('title.ilike.*intro*');
    expect(supabaseMock.attempts[1]?.filters).toEqual([]);
    expect(supabaseMock.attempts[1]?.orders).toEqual([
      { column: 'id', options: { ascending: true } },
    ]);
    expect(result.columns.map(column => column.field)).toEqual(['id', 'title']);
    expect(result.omittedColumns).toEqual([
      {
        column: 'content_hash',
        field: 'contentHash',
        reason: 'The mapped database column was not found in the live table.',
      },
    ]);
    expect(result.rows).toEqual([
      {
        id: 'node-1',
        title: 'Intro',
      },
    ]);
  });

  it('uses display metadata to constrain free-text search', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      slug: field.string(),
    }).display({
      primary: 'title',
      secondary: ['slug'],
      search: ['title'],
    });
    const reader = createSupabaseReflectedEntityDataReader({
      entities: [Book],
      getClient: createSupabaseClient,
    });

    const result = await reader.readEntityData({
      entityName: 'Book',
      filters: [{ field: 'id', operator: 'contains', value: 'book-1' }],
      page: 1,
      pageSize: 25,
      search: 'book-1',
    });

    expect(supabaseMock.attempts[0]?.search).toBe('title.ilike.*book-1*');
    expect(result.display).toEqual({
      primary: 'title',
      secondary: ['slug'],
      search: ['title'],
    });
    expect(supabaseMock.attempts[0]?.filters).toEqual([
      { column: 'id', operator: 'eq', value: 'book-1' },
    ]);
  });

  it('supports batched reflected relation filters', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    });
    const reader = createSupabaseReflectedEntityDataReader({
      entities: [Book],
      getClient: createSupabaseClient,
    });

    await reader.readEntityData({
      entityName: 'Book',
      filters: [{ field: 'id', operator: 'in', values: ['book-1', 'book-2'] }],
    });

    expect(supabaseMock.attempts[0]?.filters).toEqual([
      { column: 'id', operator: 'in', values: ['book-1', 'book-2'] },
    ]);
  });

  it('reports virtual derived Fields as unsupported before issuing a storage read', async () => {
    const Course = entity('Course', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(modelExpression.field('capacity')),
      ),
    });
    const reader = createSupabaseReflectedEntityDataReader({
      entities: [Course],
      getClient: createSupabaseClient,
    });

    await expect(reader.readEntityData({ entityName: 'Course' })).rejects.toThrow(
      'Supabase reflected reads do not support derived Field Course.availableSeats.',
    );
    expect(supabaseMock.attempts).toEqual([]);
  });

  it('hydrates relation display paths with batched target reads', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    });
    const Profile = entity('Profile', {
      id: field.id(),
      displayName: field.string(),
      email: field.string(),
    });
    const ReadingProgress = entity('ReadingProgress', {
      userId: field.id(),
      bookId: field.id(),
    })
      .display({
        primary: 'book.title',
        secondary: ['reader.displayName', 'reader.email'],
      })
      .belongsTo('book', Book, { via: 'bookId' })
      .belongsTo('reader', Profile, { via: 'userId' });

    mapEntity(Book).toTable('books');
    mapEntity(Profile).toTable('profiles', { displayName: 'display_name' });
    mapEntity(ReadingProgress).toTable('reading_progress', {
      userId: 'user_id',
      bookId: 'book_id',
    });
    mapRelation(ReadingProgress, 'book', {
      type: 'many-to-one',
      from: 'reading_progress.book_id',
      to: 'books.id',
    });
    mapRelation(ReadingProgress, 'reader', {
      type: 'many-to-one',
      from: 'reading_progress.user_id',
      to: 'profiles.id',
    });

    const reader = createSupabaseReflectedEntityDataReader({
      entities: [Book, Profile, ReadingProgress],
      getClient: () =>
        createSupabaseClient({
          books: [{ id: 'book-1', title: 'Programming Book' }],
          profiles: [{ id: 'user-1', display_name: 'Javi', email: 'javi@example.com' }],
          reading_progress: [{ user_id: 'user-1', book_id: 'book-1' }],
        }),
    });

    await expect(
      reader.readEntityData({ entityName: 'ReadingProgress', pageSize: 10 }),
    ).resolves.toMatchObject({
      display: {
        primary: 'book.title',
        secondary: ['reader.displayName', 'reader.email'],
      },
      rows: [
        {
          userId: 'user-1',
          bookId: 'book-1',
          'book.title': 'Programming Book',
          'reader.displayName': 'Javi',
          'reader.email': 'javi@example.com',
        },
      ],
    });
    expect(
      supabaseMock.attempts.filter(attempt =>
        attempt.filters.some(filter => (filter as { operator?: string }).operator === 'in'),
      ),
    ).toHaveLength(2);
  });
});
