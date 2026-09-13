import { createEntityRef, createGraphClientCache, entity, field } from '@ontahi/core/data-graph';
import { expect, it } from 'vitest';

import { entityReferenceLinks } from './cache-model.js';

it('resolves aliases and keeps shared field paths without recursing through cycles', () => {
  const Book = entity('Book', { id: field.id(), slug: field.string() })
    .locators({ refById: 'id', refBySlug: 'slug' })
    .identity('refById');
  const cache = createGraphClientCache();
  cache.writeEntity(Book, { id: 'b1', slug: 'book' });
  const shared = { book: createEntityRef(Book, { slug: 'book' }) };
  const value: Record<string, unknown> = { first: shared, second: shared };
  value.self = value;
  expect(entityReferenceLinks(value, cache.inspect())).toEqual([
    { path: 'first.book', key: 'Book:{"id":"b1"}' },
    { path: 'second.book', key: 'Book:{"id":"b1"}' },
  ]);
});

it('links embedded rows only through declared relationships and canonical identity', () => {
  const Tag = entity('Tag', { id: field.id(), name: field.string() });
  const Book = entity('Book', { id: field.id() }).hasMany('tags', Tag);
  const cache = createGraphClientCache();
  cache.writeEntity(Tag, { id: 't1', name: 'Current name' });
  expect(
    entityReferenceLinks(
      {
        id: 'b1',
        tags: [{ id: 't1', name: 'Older embedded name' }, { id: 'absent' }],
        unrelated: { id: 't1' },
      },
      cache.inspect(),
      Book,
    ),
  ).toEqual([
    { path: 'tags[0]', key: 'Tag:{"id":"t1"}' },
    { path: 'tags[1]', key: 'Tag:{"id":"absent"}' },
  ]);
});
