import { describe, expect, it } from 'vitest';

import {
  buildOperationCacheEntryKey,
  deleteOperationCacheEntry,
  getRuntimeOperationCacheStore,
  invalidateOperationCacheRefs,
  registerOperationCacheEntry,
} from './operation/cache.js';
import {
  normalizeOperationValueRef,
  resolveOperationValueRefs,
  type ServerRuntimeValueRef,
} from './operation/value-ref.js';

import { createServerRuntimeResources } from './index.js';

const bookRef = (id: string): ServerRuntimeValueRef => ({
  entity: 'Book',
  kind: 'bySlug',
  id: [id],
});

describe('operation cache primitives', () => {
  it('creates stable cache entry keys and value ref keys', () => {
    expect(buildOperationCacheEntryKey('features.books.fetchBook', { bookSlug: 'progbook' })).toBe(
      'features.books.fetchBook:{"bookSlug":"progbook"}',
    );
    expect(buildOperationCacheEntryKey('features.books.fetchBooks', undefined)).toBe(
      'features.books.fetchBooks:{}',
    );
    expect(normalizeOperationValueRef(bookRef('progbook'))).toBe('Book.bySlug:["progbook"]');
    expect(resolveOperationValueRefs([bookRef('progbook'), bookRef('progbook')])).toEqual([
      'Book.bySlug:["progbook"]',
    ]);
    expect(resolveOperationValueRefs(undefined)).toEqual([]);
  });

  it('stores one operation cache store in runtime resources', () => {
    const resources = createServerRuntimeResources();
    const first = getRuntimeOperationCacheStore(resources);
    const second = getRuntimeOperationCacheStore(resources);

    expect(first).toBe(second);
  });

  it('registers, deletes, and invalidates cache entries through value refs', async () => {
    const store = getRuntimeOperationCacheStore(createServerRuntimeResources());
    const firstEntry = buildOperationCacheEntryKey('features.books.fetchBook', {
      bookSlug: 'progbook',
    });
    const secondEntry = buildOperationCacheEntryKey('features.books.fetchBook', {
      bookSlug: 'other',
    });
    const firstPromise = Promise.resolve({ success: true as const, title: 'Progbook' });
    const secondPromise = Promise.resolve({ success: true as const, title: 'Other' });

    store.entries.set(firstEntry, firstPromise);
    store.entries.set(secondEntry, secondPromise);
    registerOperationCacheEntry(store, firstEntry, [bookRef('progbook')]);
    registerOperationCacheEntry(store, secondEntry, [bookRef('other')]);

    expect(store.refsByEntry.get(firstEntry)).toEqual(['Book.bySlug:["progbook"]']);
    expect(store.entriesByRef.get('Book.bySlug:["progbook"]')).toEqual(new Set([firstEntry]));

    invalidateOperationCacheRefs(store, [bookRef('progbook')]);

    expect(store.entries.has(firstEntry)).toBe(false);
    expect(store.refsByEntry.has(firstEntry)).toBe(false);
    expect(store.entriesByRef.has('Book.bySlug:["progbook"]')).toBe(false);
    expect(store.entries.get(secondEntry)).toBe(secondPromise);

    deleteOperationCacheEntry(store, secondEntry);
    deleteOperationCacheEntry(store, 'missing-entry');

    expect(store.entries.size).toBe(0);
    expect(store.refsByEntry.size).toBe(0);
    expect(store.entriesByRef.size).toBe(0);
  });
});
