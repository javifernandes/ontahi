import {
  createEntityIdentityRef,
  type AnyEntityDefinition,
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

/** Field paths keep shared references distinct; only ancestors count as cycles. */
export const entityReferenceLinks = (
  value: unknown,
  snapshot: GraphClientCacheSnapshot,
  entity?: AnyEntityDefinition,
) => {
  const links: { path: string; key: string }[] = [];
  const ancestors = new WeakSet<object>();
  const aliases = new Map(snapshot.aliases.map(alias => [alias.key, alias.canonicalKey]));
  const visit = (item: unknown, path: string, definition?: AnyEntityDefinition): void => {
    if (isEntityRef(item)) {
      const key = normalizeEntityRef(item);
      links.push({ path, key: aliases.get(key) ?? key });
      return;
    }
    if (typeof item !== 'object' || item === null || ancestors.has(item)) return;
    if (path && definition && !Array.isArray(item)) {
      const ref = createEntityIdentityRef(definition, item as Record<string, unknown>);
      if (ref) {
        const key = normalizeEntityRef(ref);
        links.push({ path, key: aliases.get(key) ?? key });
        return;
      }
    }
    ancestors.add(item);
    for (const [name, child] of Object.entries(item))
      visit(
        child,
        Array.isArray(item) ? `${path}[${name}]` : path ? `${path}.${name}` : name,
        Array.isArray(item) ? definition : definition?.relations[name]?.target,
      );
    ancestors.delete(item);
  };
  visit(value, '', entity);
  return links;
};

export const cachedEntityLabel = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  for (const field of ['name', 'title']) {
    const label = (value as Record<string, unknown>)[field];
    if (typeof label === 'string' && label.trim()) return label;
  }
  return undefined;
};
