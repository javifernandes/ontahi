import { describe, expect, it } from 'vitest';

import type { AnyEntityDefinition } from '../entity/definition.js';

import { query } from './query.js';

const entity = (name: string): AnyEntityDefinition => ({
  kind: 'entity',
  name,
  fields: {},
  relations: {},
  refLocators: {},
});

describe('Relation Query composition', () => {
  it('preserves earlier includes when another include is chained', () => {
    const Author = entity('Author');
    const Tag = entity('Tag');
    const Book = entity('Book');
    Book.relations = {
      author: { kind: 'relation', relationKind: 'belongsTo', target: Author },
      tags: { kind: 'relation', relationKind: 'hasMany', target: Tag },
    } as AnyEntityDefinition['relations'];
    const Library = entity('Library');
    Library.relations = {
      books: { kind: 'relation', relationKind: 'hasMany', target: Book },
    } as AnyEntityDefinition['relations'];

    const spec = query(Library)
      .include(library => ({
        books: library.books
          .include(book => ({ author: book.author }))
          .include(book => ({ tags: book.tags })),
      }))
      .build();

    expect(Object.keys(spec.includes!.books!.toNodeSpec().includes!)).toEqual(['author', 'tags']);
  });
});
