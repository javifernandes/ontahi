import type { AnyEntityDefinition } from '../../../data-graph/definitions.js';

import type { GraphClientCacheEntityRecord } from './records.js';

const toTimestamp = (value: unknown): number | undefined => {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  return undefined;
};

const toFreshnessToken = (value: unknown): string | number | boolean | null | undefined =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value === null
    ? value
    : undefined;

export const resolveEntitySnapshotFreshness = (
  entityDefinition: AnyEntityDefinition,
  snapshot: Record<string, unknown>,
): Pick<GraphClientCacheEntityRecord, 'freshnessAt' | 'freshnessHash' | 'freshnessVersion'> => {
  const metadata = entityDefinition.freshnessMetadata;
  const freshnessAt = metadata?.updatedAt ? toTimestamp(snapshot[metadata.updatedAt]) : undefined;
  const freshnessHash = metadata?.hash ? toFreshnessToken(snapshot[metadata.hash]) : undefined;
  const freshnessVersion = metadata?.version
    ? toFreshnessToken(snapshot[metadata.version])
    : undefined;
  return {
    ...(freshnessAt !== undefined ? { freshnessAt } : {}),
    ...(freshnessHash !== undefined ? { freshnessHash } : {}),
    ...(freshnessVersion !== undefined ? { freshnessVersion } : {}),
  };
};

const freshnessMarkers = ['freshnessVersion', 'freshnessHash', 'freshnessAt'] as const;

export const hasFreshnessMarker = (
  freshness: Pick<
    GraphClientCacheEntityRecord,
    'freshnessAt' | 'freshnessHash' | 'freshnessVersion'
  >,
): boolean => freshnessMarkers.some(marker => freshness[marker] !== undefined);

export const hasSameFreshnessMarker = (
  left: GraphClientCacheEntityRecord | undefined,
  right: Pick<GraphClientCacheEntityRecord, 'freshnessAt' | 'freshnessHash' | 'freshnessVersion'>,
): boolean => {
  if (!left) return false;
  const commonMarkers = freshnessMarkers.filter(
    marker => left[marker] !== undefined && right[marker] !== undefined,
  );
  return (
    commonMarkers.length > 0 &&
    commonMarkers.every(marker => Object.is(left[marker], right[marker]))
  );
};

export const mergeFreshSnapshot = <TSnapshot extends Record<string, unknown>>(
  existing: GraphClientCacheEntityRecord,
  snapshot: TSnapshot,
): TSnapshot =>
  ({
    ...(existing.value as Record<string, unknown>),
    ...Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined)),
  }) as TSnapshot;
