import { describe, expect, it } from 'vitest';

import {
  cacheRef,
  createEntityRef,
  createGraphClientCache,
  defineEntityRefInput,
  entity,
  field,
  getOperationClientCacheKey,
  graphOutput,
  invalidateOperationCacheRefs,
  normalizeEntityRef,
  readInitialOperationCacheValueFromCache,
  reconcileOperationOutput,
  valueContainsEntityRef,
} from '../../../../src/data-graph/index.js';

const defineBookEntity = () =>
  entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
    updatedAt: field.string(),
  })
    .locators({
      refById: 'id',
      refBySlug: 'slug',
    })
    .identity('refById')
    .freshness({
      updatedAt: 'updatedAt',
    });

describe('data-graph operation client cache helpers', () => {
  it('derives operation cache keys through canonical refs learned by the graph cache', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const slugRef = createEntityRef(Book, { slug: 'progbook' });
    const idRef = createEntityRef(Book, { id: 'book-1' });
    const operation = {
      entityName: 'Book',
      name: 'fetchBook',
      inputRefs: {
        book: defineEntityRefInput(Book),
      },
      clientCache: {
        query: [cacheRef('book')],
      },
    };

    cache.writeEntity(Book, {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(
      getOperationClientCacheKey(
        cache,
        operation,
        {
          book: slugRef,
        },
        ['fallback'],
      ),
    ).toEqual(['Book', 'fetchBook', idRef]);
  });

  it('seeds direct entity operation results from cached input refs', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache({
      now: () => 1_700_000_000_000,
    });
    const book = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
      updatedAt: '2026-01-02T03:04:05.000Z',
    };
    const operation = {
      entityName: 'Book',
      name: 'fetchBook',
      graphOutput: graphOutput.entity(Book),
      inputRefs: {
        book: defineEntityRefInput(Book),
      },
    };

    cache.writeEntity(Book, book);

    expect(
      readInitialOperationCacheValueFromCache(cache, operation, {
        book: createEntityRef(Book, { slug: 'progbook' }),
      }),
    ).toEqual({
      initialDataUpdatedAt: Date.parse('2026-01-02T03:04:05.000Z'),
      value: createEntityRef(Book, { id: 'book-1' }),
    });
  });

  it('invalidates input refs and explicit result refs as one unique ref set', () => {
    const Book = defineBookEntity();
    const cache = createGraphClientCache();
    const idRef = createEntityRef(Book, { id: 'book-1' });
    const slugRef = createEntityRef(Book, { slug: 'progbook' });
    const operation = {
      entityName: 'Book',
      name: 'deleteBook',
      inputRefs: {
        book: defineEntityRefInput(Book),
      },
      clientCache: {
        invalidate: [
          ({ value }: { value: { deletedBookId: string } }) =>
            createEntityRef(Book, { id: value.deletedBookId }),
        ],
      },
    };

    cache.writeEntity(Book, {
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming Book',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(
      invalidateOperationCacheRefs(
        cache,
        operation,
        {
          book: slugRef,
        },
        {
          deletedBookId: 'book-1',
        },
      ),
    ).toEqual([slugRef, idRef]);
    expect(cache.readEntity(idRef)).toBeUndefined();
    expect(cache.readEntity(slugRef)).toBeUndefined();
  });

  it('reconciles operation outputs without degrading richer same-freshness cache records', () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      subtitle: field.string(),
      version: field.string(),
    })
      .locators({
        refById: 'id',
      })
      .identity('refById')
      .freshness({
        version: 'version',
      });
    const cache = createGraphClientCache();
    const richBook = {
      id: 'book-1',
      title: 'Programming Book',
      subtitle: 'Richer local projection',
      version: 'v1',
    };
    const partialBook = {
      id: 'book-1',
      title: 'Programming Book',
      version: 'v1',
    };

    cache.writeEntity(Book, richBook);

    expect(
      reconcileOperationOutput(
        cache,
        {
          entityName: 'Book',
          name: 'fetchBook',
          graphOutput: graphOutput.entity(Book),
        },
        partialBook,
      ),
    ).toEqual(richBook);
  });

  it('detects entity refs inside nested values without looping on circular objects', () => {
    const Book = defineBookEntity();
    const slugRef = createEntityRef(Book, { slug: 'progbook' });
    const value: Record<string, unknown> = {
      items: [slugRef],
    };

    value.self = value;

    expect(valueContainsEntityRef(value, new Set([normalizeEntityRef(slugRef)]))).toBe(true);
    expect(
      valueContainsEntityRef(
        value,
        new Set([normalizeEntityRef(createEntityRef(Book, { id: 'x' }))]),
      ),
    ).toBe(false);
  });
});
