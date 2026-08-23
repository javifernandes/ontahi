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
});
