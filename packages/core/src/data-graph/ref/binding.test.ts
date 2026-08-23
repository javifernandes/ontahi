import { describe, expect, it } from 'vitest';

import {
  bindEntityRefMethods,
  bindEntityRefOperationProxy,
  bindEntityRefRelationOperations,
} from './binding.js';
import { createEntityRef } from './model.js';

describe('bound Entity Ref affordances', () => {
  it('binds local methods without changing portable Ref identity', () => {
    const book = bindEntityRefMethods(createEntityRef('Book', { slug: 'progbook' }), {
      describe: ref => `${ref.entityName}:${ref.locator.slug}`,
    });

    expect(book.describe()).toBe('Book:progbook');
    expect(book).toMatchObject({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: { slug: 'progbook' },
    });
  });

  it('binds operation and relation affordances through explicit runners', () => {
    const operationRef = bindEntityRefOperationProxy(
      createEntityRef('Book', { slug: 'progbook' }),
      { rename: { id: 'Book.rename' } },
      {
        run: ({ operation, input }) => ({ operation, input }),
      },
    );
    const relationRef = bindEntityRefRelationOperations(
      createEntityRef('Book', { slug: 'progbook' }),
      'authors',
      { add: { id: 'Book.authors.add' } },
      {
        receiver: 'book',
        run: ({ operation, input }) => ({ operation, input }),
      },
    );

    expect(operationRef.rename({ title: 'New title' })).toEqual({
      operation: { id: 'Book.rename' },
      input: { slug: 'progbook', title: 'New title' },
    });
    const relationResult = relationRef.authors.add({ authorId: 'author-1' });

    expect(relationResult).toMatchObject({
      operation: { id: 'Book.authors.add' },
      input: {
        authorId: 'author-1',
      },
    });
    expect((relationResult.input as Record<string, unknown>).book).toBe(relationRef);
  });
});
