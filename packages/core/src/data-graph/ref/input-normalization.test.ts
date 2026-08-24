import { describe, expect, it } from 'vitest';

import { entity, field } from '../definitions.js';

import { attachEntityRefInputRefs, normalizeEntityRefQueryInput } from './input-normalization.js';
import { defineEntityRefInput } from './input.js';
import { createEntityRef } from './model.js';

describe('Entity Ref input normalization', () => {
  it('derives runtime refs and transport query keys from entity locator metadata', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({ refBySlug: 'slug' });
    const declarations = { book: defineEntityRefInput(Book) };

    expect(attachEntityRefInputRefs({ bookSlug: 'progbook' }, declarations).refs.book).toEqual(
      createEntityRef(Book, { slug: 'progbook' }),
    );
    expect(
      normalizeEntityRefQueryInput(
        { book: createEntityRef(Book, { slug: 'progbook' }), state: 'open' },
        declarations,
      ),
    ).toEqual({ bookSlug: 'progbook', state: 'open' });
  });

  it('keeps resolver affordances isolated without mutating a shared portable Ref', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });
    const book = createEntityRef(Book, { id: 'book-1' });
    const input = attachEntityRefInputRefs(
      {
        detailBook: book,
        summaryBook: book,
      },
      {
        detailBook: defineEntityRefInput(Book).resolveWith(() => ({ pageCount: 320 })),
        summaryBook: defineEntityRefInput(Book).resolveWith(() => ({ title: 'Programming Book' })),
      },
    );

    expect(input.refs.detailBook).not.toBe(book);
    expect(input.refs.summaryBook).not.toBe(book);
    expect(input.refs.detailBook).not.toBe(input.refs.summaryBook);
    expect('resolve' in book).toBe(false);
    expect(input.refs.detailBook).toEqual(book);
    expect(input.refs.summaryBook).toEqual(book);
    expect(input.refs.detailBook.resolve()).toEqual({ pageCount: 320 });
    expect(input.refs.summaryBook.resolve()).toEqual({ title: 'Programming Book' });
  });
});
