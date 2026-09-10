import { afterEach, describe, expect, it, vi } from 'vitest';

import { authoringDialectPreference as preference } from './authoring-preference.js';

afterEach(() => {
  vi.restoreAllMocks();
  preference.set(undefined);
});

describe('browser authoring preference', () => {
  it('persists, notifies subscribers and supports clearing the preference', () => {
    const notify = vi.fn();
    const unsubscribe = preference.subscribe(notify);
    preference.set('declarative');
    expect(preference.getSnapshot()).toBe('declarative');
    expect(globalThis.localStorage.getItem('ontahi.authoring.dialect')).toBe('declarative');
    expect(notify).toHaveBeenCalledOnce();
    preference.set(undefined);
    expect(preference.getSnapshot()).toBeUndefined();
    unsubscribe();
    preference.set('ts');
    expect(notify).toHaveBeenCalledTimes(2);
    expect(preference.getServerSnapshot()).toBeUndefined();
  });

  it('reacts to another tab but ignores unrelated and invalid values', () => {
    const notify = vi.fn();
    const unsubscribe = preference.subscribe(notify);
    globalThis.localStorage.setItem('ontahi.authoring.dialect', 'declarative');
    globalThis.dispatchEvent(new StorageEvent('storage', { key: 'ontahi.authoring.dialect' }));
    expect(notify).toHaveBeenCalledOnce();
    expect(preference.getSnapshot()).toBe('declarative');
    globalThis.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(notify).toHaveBeenCalledOnce();
    globalThis.localStorage.setItem('ontahi.authoring.dialect', 'invalid');
    expect(preference.getSnapshot()).toBeUndefined();
    globalThis.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('keeps a page-local preference when storage writes fail', () => {
    preference.set('ts');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    preference.set('declarative');
    expect(preference.getSnapshot()).toBe('declarative');
  });
});
