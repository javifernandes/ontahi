import { describe, expect, it, vi } from 'vitest';

import {
  createContextResourceApi,
  createServerRuntimeResources,
  getOrCreateContextResource,
} from '../../../src/runtime/server/index.js';

describe('server context resource api', () => {
  it('creates and reuses resource promises by key', async () => {
    const resources = createServerRuntimeResources();
    const factory = vi.fn(async () => ({ value: 'progbook' }));

    const first = getOrCreateContextResource(resources, 'book.shell', factory);
    const second = getOrCreateContextResource(resources, 'book.shell', factory);

    await expect(first).resolves.toEqual({ value: 'progbook' });
    await expect(second).resolves.toEqual({ value: 'progbook' });
    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('exposes map-like resource helpers and memoized resource functions', async () => {
    const resources = createServerRuntimeResources();
    const api = createContextResourceApi(resources);
    const run = vi.fn((input: { slug: string }) => ({ title: input.slug.toUpperCase() }));
    const memoized = api.memoize({
      namespace: 'book.title',
      key: input => input.slug,
      run,
    });

    expect(api.has('custom')).toBe(false);
    expect(api.set('custom', 42)).toBe(42);
    expect(api.get<number>('custom')).toBe(42);
    expect(api.has('custom')).toBe(true);
    expect(api.delete('custom')).toBe(true);
    expect(api.has('custom')).toBe(false);
    await expect(api.getOrCreate('direct', () => 'value')).resolves.toBe('value');
    await expect(memoized({ slug: 'progbook' })).resolves.toEqual({ title: 'PROGBOOK' });
    await expect(memoized({ slug: 'progbook' })).resolves.toEqual({ title: 'PROGBOOK' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
