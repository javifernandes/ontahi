import { entity, field, mapEntity } from '@ontahi/core/data-graph';
import { beforeEach, describe, expect, it } from 'vitest';

import { createSupabaseReflectedEntityDataReader } from '../../src/data-graph/index.js';

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

const createSupabaseClient = () => ({
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

        return {
          count: 1,
          data: [
            {
              id: 'node-1',
              title: 'Intro',
            },
          ],
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
});
