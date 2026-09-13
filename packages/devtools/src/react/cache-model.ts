import {
  isEntityRef,
  normalizeEntityRef,
  type GraphClientCache,
  type GraphClientCacheSnapshot,
} from '@ontahi/core/data-graph';

// Core inspection returns a new object each time; React requires stable snapshots between writes.
export const createCacheStore = (cache: GraphClientCache) => {
  let snapshot = cache.inspect();
  return {
    subscribe: cache.subscribe,
    getSnapshot: () => {
      const next = cache.inspect();
      if (next.version !== snapshot.version) snapshot = next;
      return snapshot;
    },
  };
};

/** Explicit references in cached outputs, not inferred hook ownership or historical provenance. */
export const outputEntityKeys = (value: unknown, snapshot: GraphClientCacheSnapshot) => {
  const keys = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (item: unknown): void => {
    if (isEntityRef(item)) {
      const key = normalizeEntityRef(item);
      keys.add(snapshot.aliases.find(alias => alias.key === key)?.canonicalKey ?? key);
      return;
    }
    if (typeof item !== 'object' || item === null || seen.has(item)) return;
    seen.add(item);
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return keys;
};
