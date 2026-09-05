import { isRecord } from '../../../value/object.js';
import type { AnyEntityDefinition } from '../../definitions.js';
import {
  getGraphReadOutputDescriptor,
  type GraphOutputDescriptor,
} from '../../output/index.js';
import type { QueryOrView } from '../../query.js';
import {
  createEntityIdentityRef,
  createEntityRef,
  isEntityRef,
  isEntityRefLocatorValue,
  normalizeEntityRef,
  type AnyEntityRef,
  type EntityRef,
  type EntityRefLocator,
  type EntityRefLocatorValue,
} from '../../ref/index.js';

export type EntityLocatorRef<TEntityName extends string = string> = {
  name: string;
  ref: EntityRef<TEntityName, EntityRefLocator>;
};

export type GraphClientCacheEntityRecord<TValue = unknown> = {
  cachedAt: number;
  freshnessAt?: number;
  freshnessHash?: string | number | boolean | null;
  freshnessVersion?: string | number | boolean | null;
  ref: AnyEntityRef;
  value: TValue;
};

export type GraphClientCacheWriteResult<TValue = unknown> = GraphClientCacheEntityRecord<TValue> & {
  aliases: readonly AnyEntityRef[];
};

export type GraphClientCacheInvalidationResult<TValue = unknown> =
  GraphClientCacheEntityRecord<TValue> & {
    aliases: readonly AnyEntityRef[];
  };

export type GraphClientCacheOutputNormalizationResult = {
  writes: readonly GraphClientCacheWriteResult[];
  value: unknown;
};

export type GraphClientCacheOutputRecord<TValue = unknown> = {
  cachedAt: number;
  key: readonly unknown[];
  keyHash: string;
  value: TValue;
};

export type GraphClientCacheOutputReadResult<TValue = unknown> =
  GraphClientCacheOutputRecord<TValue> & {
    initialDataUpdatedAt: number;
  };

export type GraphClientCacheInspectableRecord<TValue = unknown> =
  GraphClientCacheEntityRecord<TValue> & {
    key: string;
    aliases: readonly AnyEntityRef[];
  };

export type GraphClientCacheAliasRecord = {
  ref: AnyEntityRef;
  key: string;
  canonicalRef: AnyEntityRef;
  canonicalKey: string;
};

export type GraphClientCacheSnapshot = {
  version: number;
  records: readonly GraphClientCacheInspectableRecord[];
  aliases: readonly GraphClientCacheAliasRecord[];
  outputs: readonly GraphClientCacheOutputRecord[];
};

export type GraphClientCacheEvent =
  | {
      type: 'write';
      version: number;
      write: GraphClientCacheWriteResult;
    }
  | {
      type: 'write-output';
      version: number;
      output: GraphClientCacheOutputRecord;
    }
  | {
      type: 'invalidate';
      version: number;
      invalidation: GraphClientCacheInvalidationResult;
    }
  | {
      type: 'clear';
      version: number;
    };

export type GraphClientCacheListener = (event: GraphClientCacheEvent) => void;

export type GraphClientCacheOptions = {
  now?: () => number;
};

type GraphClientCacheEventInput =
  | {
      type: 'write';
      write: GraphClientCacheWriteResult;
    }
  | {
      type: 'write-output';
      output: GraphClientCacheOutputRecord;
    }
  | {
      type: 'invalidate';
      invalidation: GraphClientCacheInvalidationResult;
    }
  | {
      type: 'clear';
    };

type WriteEntityFn = (
  entityDefinition: AnyEntityDefinition,
  snapshot: Record<string, unknown>,
) => GraphClientCacheWriteResult | undefined;

type ReadEntityFn = (
  entityDefinition: AnyEntityDefinition,
  snapshot: Record<string, unknown>,
) => Record<string, unknown> | undefined;

type ReadEntityRecordFn = (ref: AnyEntityRef) => GraphClientCacheEntityRecord | undefined;

const toTimestamp = (value: unknown): number | undefined => {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  return undefined;
};

const toFreshnessToken = (value: unknown): string | number | boolean | null | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  return undefined;
};

const resolveEntitySnapshotFreshness = (
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

const freshnessMarkers = [
  'freshnessVersion',
  'freshnessHash',
  'freshnessAt',
] as const satisfies readonly (keyof GraphClientCacheEntityRecord)[];

const hasFreshnessMarker = (
  freshness: Pick<
    GraphClientCacheEntityRecord,
    'freshnessAt' | 'freshnessHash' | 'freshnessVersion'
  >,
): boolean => freshnessMarkers.some(marker => freshness[marker] !== undefined);

const hasSameFreshnessMarker = (
  left: GraphClientCacheEntityRecord | undefined,
  right: Pick<GraphClientCacheEntityRecord, 'freshnessAt' | 'freshnessHash' | 'freshnessVersion'>,
): boolean => {
  if (!left) {
    return false;
  }

  const commonMarkers = freshnessMarkers.filter(
    marker => left[marker] !== undefined && right[marker] !== undefined,
  );

  return (
    commonMarkers.length > 0 &&
    commonMarkers.every(marker => Object.is(left[marker], right[marker]))
  );
};

const mergeFreshSnapshot = <TSnapshot extends Record<string, unknown>>(
  existing: GraphClientCacheEntityRecord,
  snapshot: TSnapshot,
): TSnapshot =>
  ({
    ...(existing.value as Record<string, unknown>),
    ...Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined)),
  }) as TSnapshot;

const normalizeOutputCacheKeyValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): string => {
  if (isEntityRef(value)) {
    return `ref(${normalizeEntityRef(value)})`;
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') {
    return `bigint(${value.toString()})`;
  }

  if (value instanceof Date) {
    return `date(${value.toISOString()})`;
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => normalizeOutputCacheKeyValue(item, seen)).join(',')}]`;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${normalizeOutputCacheKeyValue(value[key], seen)}`)
      .join(',')}}`;
  }

  return JSON.stringify(String(value));
};

const normalizeOutputCacheKey = (key: readonly unknown[]): string =>
  normalizeOutputCacheKeyValue(key);

export const createEntityLocatorRefs = <
  TEntity extends AnyEntityDefinition,
  TSnapshot extends Record<string, unknown>,
>(
  entityDefinition: TEntity,
  snapshot: TSnapshot,
): EntityLocatorRef<TEntity['name']>[] =>
  Object.entries(entityDefinition.refLocators).flatMap(([name, locator]) => {
    if (!locator.fields || locator.fields.length === 0) {
      return [];
    }

    const values = locator.fields.map(fieldName => snapshot[fieldName]);

    if (values.some(value => !isEntityRefLocatorValue(value))) {
      return [];
    }

    return [
      {
        name,
        ref: createEntityRef(
          entityDefinition,
          locator(...(values as readonly EntityRefLocatorValue[])),
        ),
      },
    ];
  });

const normalizeGraphOutputValue = (
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
    case 'graph-output.object':
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

const denormalizeGraphOutputValue = (
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

const collectGraphOutputEntityRecords = (
  descriptor: GraphOutputDescriptor,
  value: unknown,
  readEntityRecordByRef: ReadEntityRecordFn,
): GraphClientCacheEntityRecord[] | undefined => {
  switch (descriptor.kind) {
    case 'graph-output.opaque':
      return [];
    case 'graph-output.entity': {
      const ref = isEntityRef(value)
        ? value
        : isRecord(value)
          ? createEntityIdentityRef(descriptor.entity, value)
          : undefined;

      if (!ref || ref.entityName !== descriptor.entity.name) {
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

        return [...records, ...itemRecords];
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
  const recordsByCanonicalRef = new Map<string, GraphClientCacheEntityRecord>();
  const outputRecordsByKey = new Map<string, GraphClientCacheOutputRecord>();
  const canonicalKeysByAliasRef = new Map<string, string>();
  const refsByKey = new Map<string, AnyEntityRef>();
  const aliasKeysByCanonicalRef = new Map<string, Set<string>>();
  const listeners = new Set<GraphClientCacheListener>();
  let version = 0;

  const emit = (event: GraphClientCacheEventInput) => {
    version += 1;
    const versionedEvent = {
      ...event,
      version,
    } as GraphClientCacheEvent;

    for (const listener of listeners) {
      listener(versionedEvent);
    }
  };

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
      return value.map(item => resolveOutputCacheKeyValue(item, seen));
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
    version,
    records: Array.from(recordsByCanonicalRef.entries()).map(([key, record]) => ({
      ...record,
      key,
      aliases: Array.from(aliasKeysByCanonicalRef.get(key) ?? [])
        .map(aliasKey => refsByKey.get(aliasKey))
        .filter((ref): ref is AnyEntityRef => Boolean(ref)),
    })),
    outputs: Array.from(outputRecordsByKey.values()),
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

  const subscribe = (listener: GraphClientCacheListener): (() => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const getAliasRefsForCanonicalKey = (canonicalKey: string): AnyEntityRef[] =>
    Array.from(aliasKeysByCanonicalRef.get(canonicalKey) ?? [])
      .map(aliasKey => refsByKey.get(aliasKey))
      .filter((ref): ref is AnyEntityRef => Boolean(ref));

  const deleteAliasesForCanonicalKey = (canonicalKey: string): AnyEntityRef[] => {
    const previousAliases = aliasKeysByCanonicalRef.get(canonicalKey);

    if (!previousAliases) {
      return [];
    }

    const aliases = getAliasRefsForCanonicalKey(canonicalKey);

    for (const aliasKey of previousAliases) {
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
    emit({
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
    const aliases = createEntityLocatorRefs(entityDefinition, snapshot).map(({ ref }) => ref);
    const aliasKeys = new Set(aliases.map(normalizeEntityRef));
    const cachedAt = now();
    const freshness = resolveEntitySnapshotFreshness(entityDefinition, snapshot);
    const existingRecord = recordsByCanonicalRef.get(canonicalKey);
    const value =
      hasFreshnessMarker(freshness) && hasSameFreshnessMarker(existingRecord, freshness)
        ? mergeFreshSnapshot(existingRecord as GraphClientCacheEntityRecord, snapshot)
        : snapshot;

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

    emit({
      type: 'write',
      write,
    });

    return write;
  };

  const writeOutput = (
    key: readonly unknown[],
    descriptor: GraphOutputDescriptor | undefined,
    value: unknown,
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
    };

    outputRecordsByKey.set(output.keyHash, output);
    emit({
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
    const outputRecord = outputRecordsByKey.get(normalizeOutputCacheKey(resolvedKey));

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
    recordsByCanonicalRef.clear();
    outputRecordsByKey.clear();
    canonicalKeysByAliasRef.clear();
    refsByKey.clear();
    aliasKeysByCanonicalRef.clear();
    emit({
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
    subscribe,
    writeEntity,
    writeOutput,
  };
};

export type GraphClientCache = ReturnType<typeof createGraphClientCache>;

export type GraphClientCacheQueryReconciliation<TResult> = {
  readonly value: TResult[];
  readonly writes: readonly GraphClientCacheWriteResult[];
};

/** Reconciles one complete Query snapshot through Entity identities before exposing its value. */
export const reconcileGraphReadSnapshot = <TParams, TResult>(
  cache: GraphClientCache,
  read: QueryOrView<TParams, TResult>,
  params: TParams,
  value: TResult[],
): GraphClientCacheQueryReconciliation<TResult> => {
  const descriptor = getGraphReadOutputDescriptor(read, params);
  const normalized = cache.normalizeOutput(descriptor, value);

  return {
    writes: normalized.writes,
    value: cache.denormalizeOutput(descriptor, normalized.value) as TResult[],
  };
};
