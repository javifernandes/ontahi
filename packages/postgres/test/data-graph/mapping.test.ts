import { field, resolveRelatedRootFields } from '@ontahi/core/data-graph';
import { entity, relation } from '@ontahi/core/entity';
import { describe, expect, it } from 'vitest';

import { inferPostgresMappings } from '../../src/data-graph/mapping.js';

describe('PostgreSQL mapping inference', () => {
  it('derives conventional table and column names from semantic entities', () => {
    const ReadingProgress = entity({
      name: 'ReadingProgress',
      fields: {
        bookId: field.string(),
        userId: field.string(),
        percentage: field.number(),
      },
    });

    expect(inferPostgresMappings([ReadingProgress])).toEqual([
      {
        entity: ReadingProgress,
        table: 'reading_progress',
        columns: {
          bookId: 'book_id',
          userId: 'user_id',
          percentage: 'percentage',
        },
      },
    ]);
  });

  it('allows explicit exceptions without losing conventional defaults', () => {
    const Person = entity({
      name: 'Person',
      fields: {
        id: field.string(),
        displayName: field.string(),
      },
    });

    expect(
      inferPostgresMappings([Person], {
        overrides: {
          Person: {
            table: 'people',
            columns: { displayName: 'name' },
          },
        },
      }),
    ).toEqual([
      {
        entity: Person,
        table: 'people',
        columns: { id: 'id', displayName: 'name' },
      },
    ]);
  });

  it('compiles semantic relations for related-root queries', () => {
    const Book = entity({
      name: 'Book',
      fields: {
        id: field.id(),
        title: field.string(),
      },
      locators: { byId: 'id' },
      identity: 'byId',
    });
    const BookLabel = entity({
      name: 'BookLabel',
      fields: {
        id: field.id(),
        bookId: field.id(),
      },
      relations: {
        book: relation.belongsTo(Book, { via: 'bookId' }),
      },
    });

    inferPostgresMappings([Book, BookLabel]);

    expect(resolveRelatedRootFields(BookLabel, Book, 'book')).toEqual({
      targetField: 'bookId',
      sourceField: 'id',
    });
  });
});
