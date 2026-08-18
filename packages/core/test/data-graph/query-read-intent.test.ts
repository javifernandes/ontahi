import { describe, expect, expectTypeOf, it } from 'vitest';

import { entity, field, query } from '../../src/data-graph/index.js';

const Book = entity('Book', {
  id: field.id(),
  title: field.string(),
});

describe('query read intent', () => {
  it('keeps many as the default and represents terminal read intents explicitly', () => {
    const books = query(Book).where(book => book.title.eq('Ontahi'));

    expect(books.build()).toMatchObject({
      kind: 'query',
      root: Book,
    });
    expect(books.build().cardinality).toBeUndefined();
    expect(books.first()).toMatchObject({
      kind: 'graph-read-expression',
      intent: 'first',
      read: books,
    });
    expect(books.count()).toMatchObject({
      kind: 'graph-read-expression',
      intent: 'count',
      read: books,
    });
    expect(books.exists()).toMatchObject({
      kind: 'graph-read-expression',
      intent: 'exists',
      read: books,
    });
  });

  it('marks one as strict query cardinality without changing the projected row type', () => {
    const oneBook = query(Book)
      .select(book => ({ title: book.title }))
      .one();

    expect(oneBook.intent).toBe('one');
    expect(oneBook.read.build().cardinality).toBe('one');
    expectTypeOf(oneBook.__result).toEqualTypeOf<{ title: string } | undefined>();
  });
});
