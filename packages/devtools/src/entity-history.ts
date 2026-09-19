import { normalizeEntityRef, type GraphClientCache } from '@ontahi/core/data-graph';
import { hasOwn } from '@ontahi/core/value/object';

import { cloneDiagnosticValue } from './diagnostics.js';

export type EntityHistoryEntry = {
  readonly id: number;
  readonly segment: number;
  readonly at: number;
  readonly kind: 'baseline' | 'write' | 'invalidate' | 'clear';
  readonly key?: string;
  readonly value?: unknown;
  readonly bytes: number;
};

export type EntityHistorySnapshot = {
  readonly recording: boolean;
  readonly entries: readonly EntityHistoryEntry[];
  readonly bytes: number;
  readonly dropped: number;
  readonly captureErrors: number;
};

export const createEntityHistory = (
  cache: GraphClientCache,
  {
    capacity = 200,
    maxBytes = 2_000_000,
    now = Date.now,
  }: { capacity?: number; maxBytes?: number; now?: () => number } = {},
) => {
  if (
    !Number.isInteger(capacity) ||
    capacity <= 0 ||
    !Number.isInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new TypeError('History capacity and byte limit must be positive integers.');
  }
  let snapshot: EntityHistorySnapshot = {
    recording: false,
    entries: [],
    bytes: 0,
    dropped: 0,
    captureErrors: 0,
  };
  let sequence = 0;
  let segment = 0;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Debugging listeners must not interrupt application writes. */
      }
    }
  };
  const capture = (kind: EntityHistoryEntry['kind'], key?: string, value?: unknown) => {
    try {
      const data = {
        id: ++sequence,
        segment,
        at: now(),
        kind,
        ...(key === undefined ? {} : { key }),
        ...(value === undefined ? {} : { value: cloneDiagnosticValue(value) }),
      };
      // Approximate UTF-16 payload footprint; the entry-count limit also bounds object overhead.
      const bytes = JSON.stringify(data).length * 2;
      if (bytes > maxBytes) {
        snapshot = { ...snapshot, dropped: snapshot.dropped + 1 };
      } else {
        const entries = [...snapshot.entries, { ...data, bytes }];
        let retainedBytes = snapshot.bytes + bytes;
        let dropped = snapshot.dropped;
        while (entries.length > capacity || retainedBytes > maxBytes) {
          retainedBytes -= entries.shift()!.bytes;
          dropped += 1;
        }
        snapshot = { ...snapshot, entries, bytes: retainedBytes, dropped };
      }
    } catch {
      snapshot = { ...snapshot, captureErrors: snapshot.captureErrors + 1 };
    }
    notify();
  };
  const setRecording = (recording: boolean) => {
    if (recording === snapshot.recording) return;
    unsubscribe?.();
    unsubscribe = undefined;
    snapshot = { ...snapshot, recording };
    if (recording) {
      segment += 1;
      unsubscribe = cache.subscribe(event => {
        if (event.type === 'write')
          capture('write', normalizeEntityRef(event.write.ref), event.write.value);
        else if (event.type === 'invalidate')
          capture('invalidate', normalizeEntityRef(event.invalidation.ref));
        else if (event.type === 'clear') capture('clear');
      });
      for (const record of cache.inspect().records) capture('baseline', record.key, record.value);
    }
    notify();
  };
  return {
    inspect: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setRecording,
    clear: () => {
      snapshot = { ...snapshot, entries: [], bytes: 0, dropped: 0, captureErrors: 0 };
      notify();
    },
    dispose: () => {
      setRecording(false);
    },
    limits: { capacity, maxBytes },
  };
};

export type EntityHistory = ReturnType<typeof createEntityHistory>;

/** Compare fields present in two captured snapshots, without treating missing fields as null. */
export const historyFieldChanges = (before: unknown, after: unknown) => {
  const fields = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const previous = fields(before);
  const current = fields(after);
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])].flatMap(field => {
    const had = hasOwn(previous, field);
    const has = hasOwn(current, field);
    return had === has && JSON.stringify(previous[field]) === JSON.stringify(current[field])
      ? []
      : [
          {
            field,
            kind: !had ? 'added' : !has ? 'removed' : 'changed',
            before: previous[field],
            after: current[field],
          },
        ];
  });
};
