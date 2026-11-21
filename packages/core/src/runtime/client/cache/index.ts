import type { AnyEntityDefinition } from '../../../data-graph/definitions.js';
import type { GraphOutputDescriptor } from '../../../data-graph/output/index.js';
import {
  createEntityIdentityRef,
  isEntityRef,
  normalizeEntityRef,
  type AnyEntityRef,
} from '../../../data-graph/ref/index.js';
import { isRecord } from '../../../value/object.js';

import { createGraphClientEntityStorage } from './entity-storage.js';
import { createGraphClientCacheEvents } from './events.js';
import {
  hasFreshnessMarker,
  hasSameFreshnessMarker,
  mergeFreshSnapshot,
  resolveEntitySnapshotFreshness,
} from './freshness.js';
import { createEntityLocatorRefs, normalizeOutputCacheKey } from './normalization.js';
import { createGraphClientOutputStorage } from './output-storage.js';
import type {
  GraphClientCacheEntityRecord,
  GraphClientCacheInvalidationResult,
  GraphClientCacheOptions,
  GraphClientCacheOutputNormalizationResult,
  GraphClientCacheOutputReadResult,
  GraphClientCacheOutputRecord,
  GraphClientCacheOutputSource,
  GraphClientCacheSnapshot,
  GraphClientCacheWriteResult,
} from './records.js';

export type {
  EntityLocatorRef,
  GraphClientCacheAliasRecord,
  GraphClientCacheEntityRecord,
  GraphClientCacheEvent,
  GraphClientCacheInspectableRecord,
  GraphClientCacheInvalidationResult,
  GraphClientCacheListener,
  GraphClientCacheOptions,
  GraphClientCacheOutputNormalizationResult,
  GraphClientCacheOutputReadResult,
  GraphClientCacheOutputRecord,
  GraphClientCacheOutputSource,
  GraphClientCacheSnapshot,
  GraphClientCacheWriteResult,
} from './records.js';
export * from './reconciliation.js';
export { createEntityLocatorRefs } from './normalization.js';

type WriteEntityFn = (
  entityDefinition: AnyEntityDefinition,
  snapshot: Record<string, unknown>,
) => GraphClientCacheWriteResult | undefined;

type ReadEntityFn = (
  entityDefinition: AnyEntityDefinition,
  snapshot: Record<string, unknown>,
) => Record<string, unknown> | undefined;

type ReadEntityRecordFn = (ref: AnyEntityRef) => GraphClientCacheEntityRecord | undefined;

// The exhaustive recursive dispatch mirrors the descriptor algebra.
const normalizeGraphOutputValue /* NOSONAR */ = (
  descriptor: GraphOutputDescriptor,
  value: unknown,
  writeEntity: WriteEntityFn,
  writes: GraphClientCacheWriteResult[],
): unknown => {
  switch (descriptor.kind) {
    case 'graph-output.opaque':
      return value;
    case 'graph-output.entity': {
      if (!isRecord(value)) {
        return value;
      }

      const write = writeEntity(descriptor.entity, value);

      if (write) {
        writes.push(write);
      }

      for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields ?? {})) {
        normalizeGraphOutputValue(fieldDescriptor, value[fieldName], writeEntity, writes);
      }

      return write?.ref ?? value;
    }
    case 'graph-output.array':
      if (!Array.isArray(value)) {
        return value;
      }

      return value.map(item =>
        normalizeGraphOutputValue(descriptor.item, item, writeEntity, writes),
      );
    case 'graph-output.object': {
      if (!isRecord(value)) {
        return value;
      }

      let output = value;

      for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields)) {
        const normalizedField = normalizeGraphOutputValue(
          fieldDescriptor,
          value[fieldName],
          writeEntity,
          writes,
        );

        if (normalizedField !== value[fieldName]) {
          output =
            output === value
              ? {
                  ...value,
                  [fieldName]: normalizedField,
                }
              : {
                  ...output,
                  [fieldName]: normalizedField,
                };
        }
      }

      return output;
    }
    case 'graph-output.nullable':
      if (value === null || value === undefined) {
        return value;
      }

      return normalizeGraphOutputValue(descriptor.item, value, writeEntity, writes);
    case 'graph-output.optional':
      if (value === undefined) {
        return value;
      }

      return normalizeGraphOutputValue(descriptor.item, value, writeEntity, writes);
  }
};

const denormalizeObjectField = (
  output: Record<string, unknown>,
  fieldName: string,
  fieldDescriptor: GraphOutputDescriptor,
  readEntitySnapshot: ReadEntityFn,
): Record<string, unknown> => {
  const denormalizedField = denormalizeGraphOutputValue(
    fieldDescriptor,
    output[fieldName],
    readEntitySnapshot,
  );

  if (denormalizedField === output[fieldName]) {
    return output;
  }

  return {
    ...output,
    [fieldName]: denormalizedField,
  };
};

// The exhaustive recursive dispatch mirrors the descriptor algebra.
const denormalizeGraphOutputValue /* NOSONAR */ = (
  descriptor: GraphOutputDescriptor,
  value: unknown,
  readEntitySnapshot: ReadEntityFn,
): unknown => {
  switch (descriptor.kind) {
    case 'graph-output.opaque':
      return value;
    case 'graph-output.entity': {
      if (isEntityRef(value)) {
        if (value.entityName !== descriptor.entity.name) {
          return value;
        }

        const cached = readEntitySnapshot(descriptor.entity, value.locator);

        if (!cached) {
          return value;
        }

        let output = cached;

        for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields ?? {})) {
          output = denormalizeObjectField(output, fieldName, fieldDescriptor, readEntitySnapshot);
        }

        return output;
      }

      if (!isRecord(value)) {
        return value;
      }

      let output = readEntitySnapshot(descriptor.entity, value) ?? value;

      for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields ?? {})) {
        output = denormalizeObjectField(output, fieldName, fieldDescriptor, readEntitySnapshot);
      }

      return output;
    }
    case 'graph-output.array':
      if (!Array.isArray(value)) {
        return value;
      }

      return value.map(item =>
        denormalizeGraphOutputValue(descriptor.item, item, readEntitySnapshot),
      );
    case 'graph-output.object': {
      if (!isRecord(value)) {
        return value;
      }

      let output = value;

      for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields)) {
        output = denormalizeObjectField(output, fieldName, fieldDescriptor, readEntitySnapshot);
      }

      return output;
    }
    case 'graph-output.nullable':
      if (value === null || value === undefined) {
        return value;
      }

      return denormalizeGraphOutputValue(descriptor.item, value, readEntitySnapshot);
    case 'graph-output.optional':
      if (value === undefined) {
        return value;
      }

      return denormalizeGraphOutputValue(descriptor.item, value, readEntitySnapshot);
  }
};

// The exhaustive recursive dispatch mirrors the descriptor algebra.
const collectGraphOutputEntityRecords /* NOSONAR */ = (
  descriptor: GraphOutputDescriptor,
  value: unknown,
  readEntityRecordByRef: ReadEntityRecordFn,
): GraphClientCacheEntityRecord[] | undefined => {
  switch (descriptor.kind) {
    case 'graph-output.opaque':
      return [];
    case 'graph-output.entity': {
      let ref: AnyEntityRef | undefined;

      if (isEntityRef(value)) {
        ref = value;
      } else if (isRecord(value)) {
        ref = createEntityIdentityRef(descriptor.entity, value);
      }

      if (ref?.entityName !== descriptor.entity.name) {
        return undefined;
      }

      const record = readEntityRecordByRef(ref);

      if (!record || !isRecord(record.value)) {
        return undefined;
      }

      const records = [record];

      for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields ?? {})) {
        const fieldRecords = collectGraphOutputEntityRecords(
          fieldDescriptor,
          record.value[fieldName],
          readEntityRecordByRef,
        );

        if (!fieldRecords) {
          return undefined;
        }

        records.push(...fieldRecords);
      }

      return records;
    }
    case 'graph-output.array':
      if (!Array.isArray(value)) {
        return undefined;
      }

      return value.reduce<GraphClientCacheEntityRecord[] | undefined>((records, item) => {
        if (!records) {
          return undefined;
        }

        const itemRecords = collectGraphOutputEntityRecords(
          descriptor.item,
          item,
          readEntityRecordByRef,
        );

        if (!itemRecords) {
          return undefined;
        }

        records.push(...itemRecords);
        return records;
      }, []);
    case 'graph-output.object': {
      if (!isRecord(value)) {
        return undefined;
      }

      const records: GraphClientCacheEntityRecord[] = [];

      for (const [fieldName, fieldDescriptor] of Object.entries(descriptor.fields)) {
        const fieldRecords = collectGraphOutputEntityRecords(
          fieldDescriptor,
          value[fieldName],
          readEntityRecordByRef,
        );

        if (!fieldRecords) {
          return undefined;
        }

        records.push(...fieldRecords);
      }

      return records;
    }
    case 'graph-output.nullable':
      if (value === null || value === undefined) {
        return [];
      }

      return collectGraphOutputEntityRecords(descriptor.item, value, readEntityRecordByRef);
    case 'graph-output.optional':
      if (value === undefined) {
        return [];
      }

      return collectGraphOutputEntityRecords(descriptor.item, value, readEntityRecordByRef);
  }
};

const resolveGraphOutputUpdatedAt = (
  outputRecord: GraphClientCacheOutputRecord,
  entityRecords: readonly GraphClientCacheEntityRecord[],
): number =>
  Math.min(
    outputRecord.cachedAt,
    ...entityRecords.map(record => record.freshnessAt ?? record.cachedAt),
  );

export const createGraphClientCache = (options: GraphClientCacheOptions = {}) => {
  const now = options.now ?? Date.now;
  const entityStorage = createGraphClientEntityStorage();
  const outputStorage = createGraphClientOutputStorage();
  const { recordsByCanonicalRef, canonicalKeysByAliasRef, refsByKey, aliasKeysByCanonicalRef } =
    entityStorage;
  const events = createGraphClientCacheEvents();

  const resolveCanonicalKey = (ref: AnyEntityRef): string => {
    const refKey = normalizeEntityRef(ref);

    return canonicalKeysByAliasRef.get(refKey) ?? refKey;
  };

  const resolveEntityRef = <TRef extends AnyEntityRef>(ref: TRef): AnyEntityRef | TRef =>
    refsByKey.get(resolveCanonicalKey(ref)) ?? ref;

  const resolveOutputCacheKeyValue = (
    value: unknown,
    seen: WeakSet<object> = new WeakSet(),
  ): unknown => {
    if (isEntityRef(value)) {
      return resolveEntityRef(value);
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) {
        return value;
      }

      seen.add(value);
      return value.map(item => resolveOutputCacheKeyValue(item, seen));
    }

    if (value instanceof Date) {
      return value;
    }

    if (isRecord(value)) {
      if (seen.has(value)) {
        return value;
      }

      seen.add(value);

      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolveOutputCacheKeyValue(item, seen)]),
      );
    }

    return value;
  };

  const resolveOutputCacheKey = (key: readonly unknown[]): readonly unknown[] =>
    key.map(segment => resolveOutputCacheKeyValue(segment));

  const readEntityRecord = <TValue = unknown>(
    ref: AnyEntityRef,
  ): GraphClientCacheEntityRecord<TValue> | undefined =>
    recordsByCanonicalRef.get(resolveCanonicalKey(ref)) as
      | GraphClientCacheEntityRecord<TValue>
      | undefined;

  const readEntity = <TValue = unknown>(ref: AnyEntityRef): TValue | undefined =>
    readEntityRecord<TValue>(ref)?.value;

  const hasEntity = (ref: AnyEntityRef): boolean => Boolean(readEntityRecord(ref));

  const inspect = (): GraphClientCacheSnapshot => ({
    version: events.version,
    records: Array.from(recordsByCanonicalRef.entries()).map(([key, record]) => ({
      ...record,
      key,
      aliases: Array.from(aliasKeysByCanonicalRef.get(key) ?? [])
        .map(aliasKey => refsByKey.get(aliasKey))
        .filter((ref): ref is AnyEntityRef => Boolean(ref)),
    })),
    outputs: Array.from(outputStorage.values()),
    aliases: Array.from(canonicalKeysByAliasRef.entries()).flatMap(([key, canonicalKey]) => {
      const ref = refsByKey.get(key);
      const canonicalRef = refsByKey.get(canonicalKey);

      return ref && canonicalRef
        ? [
            {
              ref,
              key,
              canonicalRef,
              canonicalKey,
            },
          ]
        : [];
    }),
  });

  const getAliasRefsForCanonicalKey = (canonicalKey: string): AnyEntityRef[] =>
    Array.from(aliasKeysByCanonicalRef.get(canonicalKey) ?? [])
      .filter(aliasKey => canonicalKeysByAliasRef.get(aliasKey) === canonicalKey)
      .map(aliasKey => refsByKey.get(aliasKey))
      .filter((ref): ref is AnyEntityRef => Boolean(ref));

  const deleteAliasesForCanonicalKey = (canonicalKey: string): AnyEntityRef[] => {
    const previousAliases = aliasKeysByCanonicalRef.get(canonicalKey);

    if (!previousAliases) {
      return [];
    }

    const aliases = getAliasRefsForCanonicalKey(canonicalKey);

    for (const aliasKey of previousAliases) {
      if (canonicalKeysByAliasRef.get(aliasKey) !== canonicalKey) {
        continue;
      }

      canonicalKeysByAliasRef.delete(aliasKey);
      refsByKey.delete(aliasKey);
    }

    aliasKeysByCanonicalRef.delete(canonicalKey);

    return aliases;
  };

  const invalidateEntity = <TValue = unknown>(
    ref: AnyEntityRef,
  ): GraphClientCacheInvalidationResult<TValue> | undefined => {
    const canonicalKey = resolveCanonicalKey(ref);
    const record = recordsByCanonicalRef.get(canonicalKey) as
      | GraphClientCacheEntityRecord<TValue>
      | undefined;

    if (!record) {
      return undefined;
    }

    const invalidation = {
      ...record,
      aliases: deleteAliasesForCanonicalKey(canonicalKey),
    };

    recordsByCanonicalRef.delete(canonicalKey);
    events.emit({
      type: 'invalidate',
      invalidation,
    });

    return invalidation;
  };

  const writeEntity = <
    TEntity extends AnyEntityDefinition,
    TSnapshot extends Record<string, unknown>,
  >(
    entityDefinition: TEntity,
    snapshot: TSnapshot,
  ): GraphClientCacheWriteResult<TSnapshot> | undefined => {
    const canonicalRef = createEntityIdentityRef(entityDefinition, snapshot);

    if (!canonicalRef) {
      return undefined;
    }

    const canonicalKey = normalizeEntityRef(canonicalRef);
    const cachedAt = now();
    const freshness = resolveEntitySnapshotFreshness(entityDefinition, snapshot);
    const existingRecord = recordsByCanonicalRef.get(canonicalKey);
    const value =
      hasFreshnessMarker(freshness) && hasSameFreshnessMarker(existingRecord, freshness)
        ? mergeFreshSnapshot(existingRecord as GraphClientCacheEntityRecord, snapshot)
        : snapshot;
    const aliases = createEntityLocatorRefs(entityDefinition, value).map(({ ref }) => ref);
    const aliasKeys = new Set(aliases.map(normalizeEntityRef));

    aliasKeys.add(canonicalKey);
    deleteAliasesForCanonicalKey(canonicalKey);

    recordsByCanonicalRef.set(canonicalKey, {
      cachedAt,
      ...freshness,
      ref: canonicalRef,
      value,
    });
    refsByKey.set(canonicalKey, canonicalRef);
    aliasKeysByCanonicalRef.set(canonicalKey, aliasKeys);

    for (const alias of aliases) {
      const aliasKey = normalizeEntityRef(alias);
      canonicalKeysByAliasRef.set(aliasKey, canonicalKey);
      refsByKey.set(aliasKey, alias);
    }

    const write = {
      cachedAt,
      ...freshness,
      ref: canonicalRef,
      value,
      aliases,
    };

    events.emit({
      type: 'write',
      write,
    });

    return write;
  };

  // The result is always the normalized value; the conditional work persists it.
  const writeOutput /* NOSONAR */ = (
    key: readonly unknown[],
    descriptor: GraphOutputDescriptor | undefined,
    value: unknown,
    source?: GraphClientCacheOutputSource,
  ): GraphClientCacheOutputNormalizationResult => {
    const normalized = normalizeOutput(descriptor, value);

    if (!descriptor) {
      return normalized;
    }

    const resolvedKey = resolveOutputCacheKey(key);
    const output = {
      cachedAt: now(),
      key: resolvedKey,
      keyHash: normalizeOutputCacheKey(resolvedKey),
      value: normalized.value,
      ...(source ? { source } : {}),
    };

    outputStorage.set(output);
    events.emit({
      type: 'write-output',
      output,
    });

    return normalized;
  };

  const readOutput = <TValue = unknown>(
    key: readonly unknown[],
    descriptor: GraphOutputDescriptor | undefined,
  ): GraphClientCacheOutputReadResult<TValue> | undefined => {
    if (!descriptor) {
      return undefined;
    }

    const resolvedKey = resolveOutputCacheKey(key);
    const outputRecord = outputStorage.get(normalizeOutputCacheKey(resolvedKey));

    if (!outputRecord) {
      return undefined;
    }

    const entityRecords = collectGraphOutputEntityRecords(
      descriptor,
      outputRecord.value,
      readEntityRecord,
    );

    if (!entityRecords) {
      return undefined;
    }

    return {
      ...outputRecord,
      initialDataUpdatedAt: resolveGraphOutputUpdatedAt(outputRecord, entityRecords),
    } as GraphClientCacheOutputReadResult<TValue>;
  };

  const readEntitySnapshot = (
    entityDefinition: AnyEntityDefinition,
    snapshot: Record<string, unknown>,
  ): Record<string, unknown> | undefined => {
    const identityRef = createEntityIdentityRef(entityDefinition, snapshot);

    if (identityRef) {
      const cached = readEntity<Record<string, unknown>>(identityRef);

      if (cached) {
        return cached;
      }
    }

    for (const { ref } of createEntityLocatorRefs(entityDefinition, snapshot)) {
      const cached = readEntity<Record<string, unknown>>(ref);

      if (cached) {
        return cached;
      }
    }

    return undefined;
  };

  const normalizeOutput = (
    descriptor: GraphOutputDescriptor | undefined,
    value: unknown,
  ): GraphClientCacheOutputNormalizationResult => {
    const writes: GraphClientCacheWriteResult[] = [];
    const normalizedValue = descriptor
      ? normalizeGraphOutputValue(descriptor, value, writeEntity as WriteEntityFn, writes)
      : value;

    return {
      value: normalizedValue,
      writes,
    };
  };

  const denormalizeOutput = <TValue>(
    descriptor: GraphOutputDescriptor | undefined,
    value: TValue,
  ): TValue =>
    descriptor
      ? (denormalizeGraphOutputValue(descriptor, value, readEntitySnapshot) as TValue)
      : value;

  const clear = () => {
    entityStorage.clear();
    outputStorage.clear();
    events.emit({
      type: 'clear',
    });
  };

  return {
    clear,
    denormalizeOutput,
    hasEntity,
    invalidateEntity,
    inspect,
    normalizeOutput,
    readOutput,
    readEntity,
    readEntityRecord,
    resolveEntityRef,
    subscribe: events.subscribe,
    writeEntity,
    writeOutput,
  };
};

export type GraphClientCache = ReturnType<typeof createGraphClientCache>;
