import {
  compileSelectionExpression,
  createEntityRef,
  entity,
  field,
  mapEntity,
  selectionNot,
  selectionOr,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  applySupabaseOrderBy,
  applySupabasePredicates,
  applySupabaseSelection,
  compileSupabaseSelection,
  hasEmptySupabaseInPredicate,
  mapEntityPayloadToSupabaseColumns,
  mapSupabaseRowToEntityFields,
} from './index.js';

describe('data-graph supabase adapter helpers', () => {
  it('compiles recursive selections to sanitized PostgREST logic', () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });
    mapEntity(Book).toTable('books', { ownerId: 'owner_id' });

    const selection = compileSupabaseSelection(
      compileSelectionExpression(
        Book,
        selectionOr(
          { kind: 'predicate', operator: 'eq', fieldName: 'ownerId', value: 'owner,1' },
          selectionNot({
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'title',
            value: 'A "quoted" title',
          }),
        ),
      ),
    );
    const operations: Array<{ method: string; args: unknown[] }> = [];
    const query = {
      eq: () => query,
      in: () => query,
      is: () => query,
      lte: () => query,
      lt: () => query,
      gte: () => query,
      gt: () => query,
      or: (filter: string) => {
        operations.push({ method: 'or', args: [filter] });
        return query;
      },
    };

    applySupabaseSelection(query, selection);

    expect(operations).toEqual([
      {
        method: 'or',
        args: ['owner_id.eq."owner,1",not.title.eq."A \\"quoted\\" title"'],
      },
    ]);
  });

  it('maps payloads and rows through entity column mappings', () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    expect(
      mapEntityPayloadToSupabaseColumns(Book, {
        ownerId: 'owner-1',
        title: 'Book',
      }),
    ).toEqual({
      owner_id: 'owner-1',
      title: 'Book',
    });

    expect(
      mapSupabaseRowToEntityFields(Book, {
        id: 'book-1',
        owner_id: 'owner-1',
        title: 'Book',
      }),
    ).toEqual({
      id: 'book-1',
      ownerId: 'owner-1',
      title: 'Book',
    });
  });

  it('lowers reference fields at the Supabase boundary and lifts them on reads', () => {
    const Profile = entity('Profile', { id: field.id(), name: field.string() });
    const Book = entity('Book', {
      id: field.id(),
      owner: field.ref(Profile),
      title: field.string(),
    });
    const owner = createEntityRef(Profile, { id: 'profile-1' });

    mapEntity(Book).toTable('books', { owner: 'owner_id' });

    expect(mapEntityPayloadToSupabaseColumns(Book, { owner, title: 'Book' })).toEqual({
      owner_id: 'profile-1',
      title: 'Book',
    });
    expect(
      mapSupabaseRowToEntityFields(Book, {
        id: 'book-1',
        owner_id: 'profile-1',
        title: 'Book',
      }),
    ).toEqual({ id: 'book-1', owner, title: 'Book' });
  });

  it('applies predicates and orderBy using resolved columns', () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
      createdAt: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
      createdAt: 'created_at',
    });

    const operations: Array<{ method: string; args: unknown[] }> = [];
    const query = {
      eq: (column: string, value: unknown) => {
        operations.push({ method: 'eq', args: [column, value] });
        return query;
      },
      in: (column: string, values: readonly unknown[]) => {
        operations.push({ method: 'in', args: [column, values] });
        return query;
      },
      is: (column: string, value: null) => {
        operations.push({ method: 'is', args: [column, value] });
        return query;
      },
      lte: (column: string, value: unknown) => {
        operations.push({ method: 'lte', args: [column, value] });
        return query;
      },
      lt: (column: string, value: unknown) => {
        operations.push({ method: 'lt', args: [column, value] });
        return query;
      },
      gte: (column: string, value: unknown) => {
        operations.push({ method: 'gte', args: [column, value] });
        return query;
      },
      gt: (column: string, value: unknown) => {
        operations.push({ method: 'gt', args: [column, value] });
        return query;
      },
      order: (column: string, options: { ascending: boolean }) => {
        operations.push({ method: 'order', args: [column, options] });
        return query;
      },
      limit: (_value: number) => query,
    };

    applySupabaseOrderBy(
      Book,
      applySupabasePredicates(Book, query, [
        { operator: 'eq', fieldName: 'ownerId', value: 'owner-1' },
        { operator: 'lt', fieldName: 'createdAt', value: '2025-01-01' },
        { operator: 'gte', fieldName: 'createdAt', value: '2024-01-01' },
        { operator: 'gt', fieldName: 'createdAt', value: '2023-01-01' },
      ]),
      [{ fieldName: 'createdAt', direction: 'desc' }],
    );

    expect(operations).toEqual([
      { method: 'eq', args: ['owner_id', 'owner-1'] },
      { method: 'lt', args: ['created_at', '2025-01-01'] },
      { method: 'gte', args: ['created_at', '2024-01-01'] },
      { method: 'gt', args: ['created_at', '2023-01-01'] },
      { method: 'order', args: ['created_at', { ascending: false }] },
    ]);
  });

  it('skips empty in predicates and detects them explicitly', () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const operations: Array<{ method: string; args: unknown[] }> = [];
    const query = {
      eq: (_column: string, _value: unknown) => query,
      in: (column: string, values: readonly unknown[]) => {
        operations.push({ method: 'in', args: [column, values] });
        return query;
      },
      is: (_column: string, _value: null) => query,
      lte: (_column: string, _value: unknown) => query,
      lt: (_column: string, _value: unknown) => query,
      gte: (_column: string, _value: unknown) => query,
      gt: (_column: string, _value: unknown) => query,
      order: (_column: string, _options: { ascending: boolean }) => query,
      limit: (_value: number) => query,
    };

    applySupabasePredicates(Book, query, [{ operator: 'in', fieldName: 'ownerId', values: [] }]);

    expect(operations).toEqual([]);
    expect(
      hasEmptySupabaseInPredicate([{ operator: 'in', fieldName: 'ownerId', values: [] }]),
    ).toBe(true);
    expect(
      hasEmptySupabaseInPredicate([{ operator: 'in', fieldName: 'ownerId', values: ['owner-1'] }]),
    ).toBe(false);
  });
});
