import { describe, expect, it } from 'vitest';

import { entity, field } from '../definitions.js';

import { createEntityIdentityRef, getEntityIdentityLocator } from './identity.js';
import { createEntityRef } from './model.js';

describe('Entity Ref identity', () => {
  it('materializes the declared identity without carrying unrelated attributes', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    })
      .locators({ refBySlug: 'slug' })
      .identity('refBySlug');

    expect(getEntityIdentityLocator(Book)?.name).toBe('refBySlug');
    expect(
      createEntityIdentityRef(Book, {
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming Book',
      }),
    ).toEqual(createEntityRef(Book, { slug: 'progbook' }));
  });
});
