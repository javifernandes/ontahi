import type { ServerRuntimeResourceMap } from '../context-resources.js';

import type { OperationFailure, OperationResult } from './types.js';
import { resolveOperationValueRefs, type ServerRuntimeValueRef } from './value-ref.js';

export type RuntimeOperationCacheStore = {
  entries: Map<string, Promise<OperationResult<Record<string, unknown> | void, OperationFailure>>>;
  refsByEntry: Map<string, string[]>;
  entriesByRef: Map<string, Set<string>>;
};

export const OPERATION_CACHE_STORE_RESOURCE_KEY = 'runtime.operation-cache-store';

const createRuntimeOperationCacheStore = (): RuntimeOperationCacheStore => ({
  entries: new Map(),
  refsByEntry: new Map(),
  entriesByRef: new Map(),
});

export const getRuntimeOperationCacheStore = (
  resources: ServerRuntimeResourceMap,
): RuntimeOperationCacheStore => {
  const cached = resources.get(OPERATION_CACHE_STORE_RESOURCE_KEY);

  if (cached) {
    return cached as RuntimeOperationCacheStore;
  }

  const created = createRuntimeOperationCacheStore();
  resources.set(OPERATION_CACHE_STORE_RESOURCE_KEY, created);
  return created;
};

export const buildOperationCacheEntryKey = (
  scope: string,
  input: Record<string, unknown> | undefined,
) => `${scope}:${JSON.stringify(input ?? {})}`;

export const registerOperationCacheEntry = (
  store: RuntimeOperationCacheStore,
  entryKey: string,
  refs: ReadonlyArray<ServerRuntimeValueRef>,
) => {
  const normalizedRefs = resolveOperationValueRefs(refs);
  store.refsByEntry.set(entryKey, normalizedRefs);

  for (const refKey of normalizedRefs) {
    const keyedEntries = store.entriesByRef.get(refKey) ?? new Set<string>();
    keyedEntries.add(entryKey);
    store.entriesByRef.set(refKey, keyedEntries);
  }
};

export const deleteOperationCacheEntry = (store: RuntimeOperationCacheStore, entryKey: string) => {
  store.entries.delete(entryKey);
  const refs = store.refsByEntry.get(entryKey);

  if (!refs) {
    return;
  }

  store.refsByEntry.delete(entryKey);

  for (const refKey of refs) {
    const keyedEntries = store.entriesByRef.get(refKey);

    if (!keyedEntries) {
      continue;
    }

    keyedEntries.delete(entryKey);

    if (keyedEntries.size === 0) {
      store.entriesByRef.delete(refKey);
    }
  }
};

export const invalidateOperationCacheRefs = (
  store: RuntimeOperationCacheStore,
  refs: ReadonlyArray<ServerRuntimeValueRef>,
) => {
  const entryKeys = new Set<string>();

  for (const refKey of resolveOperationValueRefs(refs)) {
    const keyedEntries = store.entriesByRef.get(refKey);

    if (!keyedEntries) {
      continue;
    }

    for (const entryKey of keyedEntries) {
      entryKeys.add(entryKey);
    }
  }

  for (const entryKey of entryKeys) {
    deleteOperationCacheEntry(store, entryKey);
  }
};
