import { entity, field, getEntityMapping } from '@ontahi/core/data-graph';
import { relation, entity as ontahiEntity } from '@ontahi/core/entity';
import { describe, expect, it } from 'vitest';

import { applySupabaseDataGraphMappings, supabaseNaming } from './mapping.js';

describe('Supabase data graph mapping inference', () => {
  it('derives conventional tables, columns, and belongs-to foreign keys with overrides', () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    })
      .locators({ byId: 'id' })
      .identity('byId');
    const BookLabel = ontahiEntity({
      name: 'BookLabel',
      fields: {
        bookId: field.id(),
        targetTitle: field.string(),
      },
      relations: {
        book: relation.belongsTo(Book, { via: 'bookId' }),
      },
    });
    const BookWithLabels = Book.hasMany('labels', BookLabel);

    applySupabaseDataGraphMappings({
      entities: [BookWithLabels, BookLabel],
      naming: supabaseNaming.snakeCase(),
      overrides: {
        BookLabel: {
          table: 'legacy_labels',
        },
      },
    });

    expect({
      book: getEntityMapping(Book),
      label: getEntityMapping(BookLabel),
      relation: BookLabel.relations.book?.mapping,
      inverseRelation: BookWithLabels.relations.labels?.mapping,
    }).toEqual({
      book: {
        tableName: 'books',
        columns: {
          id: 'id',
          title: 'title',
        },
      },
      label: {
        tableName: 'legacy_labels',
        columns: {
          bookId: 'book_id',
          targetTitle: 'target_title',
        },
      },
      relation: {
        type: 'many-to-one',
        fromTable: 'legacy_labels',
        fromColumn: 'book_id',
        toTable: 'books',
        toColumn: 'id',
      },
      inverseRelation: {
        type: 'one-to-many',
        fromTable: 'books',
        fromColumn: 'id',
        toTable: 'legacy_labels',
        toColumn: 'book_id',
      },
    });
  });
});
