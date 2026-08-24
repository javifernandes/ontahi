import type {
  ClientCacheKeySegment,
  DomainOperationClientCacheMetadata,
} from '../../operations.js';
import type { GraphOutputDescriptor } from '../../output/index.js';
import { isEntityRef, normalizeEntityRef, type AnyEntityRef } from '../../ref/index.js';
import type { GraphClientCache } from '../cache/index.js';

export type GraphClientCacheOperationLike<TInput = unknown, TData = unknown> = {
  entityName: string;
  graphOutput?: GraphOutputDescriptor;
  name: string;
  clientCache?: DomainOperationClientCacheMetadata<TInput, TData>;
};

export type OperationInitialCacheValue = {
  initialDataUpdatedAt: number;
  value: unknown;
};

export const reconcileOperationOutput = <TInput, TData>(
  clientCache: GraphClientCache,
  operation: GraphClientCacheOperationLike<TInput, TData>,
  value: TData,
): TData => {
  const normalized = clientCache.normalizeOutput(operation.graphOutput, value);
  return clientCache.denormalizeOutput(operation.graphOutput, normalized.value) as TData;
};

const asEntityRefList = (value: unknown): AnyEntityRef[] =>
  (Array.isArray(value) ? value : value ? [value] : []).filter(isEntityRef);

const directInputRefs = (input: unknown): AnyEntityRef[] =>
  typeof input === 'object' && input !== null && !Array.isArray(input)
    ? Object.values(input).filter(isEntityRef)
    : [];

const uniqueEntityRefs = (refs: readonly AnyEntityRef[]): AnyEntityRef[] => {
  const seen = new Set<string>();
  const uniqueRefs: AnyEntityRef[] = [];

  for (const ref of refs) {
    const key = normalizeEntityRef(ref);

    if (!seen.has(key)) {
      seen.add(key);
      uniqueRefs.push(ref);
    }
  }

  return uniqueRefs;
};

export const invalidateOperationCacheRefs = <TInput, TData>(
  clientCache: GraphClientCache,
  operation: GraphClientCacheOperationLike<TInput, TData>,
  input: TInput,
  value: TData,
): AnyEntityRef[] => {
  const affectedRefs: AnyEntityRef[] = [];
  const invalidateRef = (ref: AnyEntityRef) => {
    const invalidation = clientCache.invalidateEntity(ref);

    affectedRefs.push(ref);

    if (invalidation) {
      affectedRefs.push(invalidation.ref, ...invalidation.aliases);
    }
  };

  for (const ref of directInputRefs(input)) {
    invalidateRef(ref);
  }

  for (const resolveInvalidation of operation.clientCache?.invalidate ?? []) {
    const refs = asEntityRefList(
      resolveInvalidation({
        input,
        value,
        operation,
      }),
    );

    for (const ref of refs) {
      invalidateRef(ref);
    }
  }

  return uniqueEntityRefs(affectedRefs);
};

export const valueContainsEntityRef = (
  value: unknown,
  targetRefKeys: ReadonlySet<string>,
  seen: WeakSet<object> = new WeakSet(),
): boolean => {
  if (isEntityRef(value)) {
    return targetRefKeys.has(normalizeEntityRef(value));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.some(item => valueContainsEntityRef(item, targetRefKeys, seen));
  }

  return Object.values(value).some(item => valueContainsEntityRef(item, targetRefKeys, seen));
};

const resolveClientCacheQueryKeySegment = <TInput, TData>(
  clientCache: GraphClientCache,
  operation: GraphClientCacheOperationLike<TInput, TData>,
  input: TInput,
  segment: ClientCacheKeySegment<TInput>,
): unknown =>
  typeof segment === 'function'
    ? segment(input, {
        input,
        operation,
        resolveRef: (ref: AnyEntityRef) => clientCache.resolveEntityRef(ref),
      })
    : segment;

export const getOperationClientCacheKey = <TInput, TData>(
  clientCache: GraphClientCache,
  operation: GraphClientCacheOperationLike<TInput, TData>,
  input: TInput,
  fallbackKey: readonly unknown[],
): readonly unknown[] =>
  operation.clientCache?.query
    ? [
        operation.entityName,
        operation.name,
        ...operation.clientCache.query.map(segment =>
          resolveClientCacheQueryKeySegment(clientCache, operation, input, segment),
        ),
      ]
    : fallbackKey;

export const readInitialOperationCacheValueFromCache = <TInput, TData>(
  clientCache: GraphClientCache,
  operation: GraphClientCacheOperationLike<TInput, TData>,
  input: TInput,
  queryKey?: readonly unknown[],
): OperationInitialCacheValue | undefined => {
  const descriptor = operation.graphOutput;

  if (!descriptor) {
    return undefined;
  }

  if (descriptor.kind === 'graph-output.entity' && typeof input === 'object' && input !== null) {
    const ref = directInputRefs(input).find(
      candidate => candidate?.entityName === descriptor.entity.name,
    );

    if (ref) {
      const record = clientCache.readEntityRecord(ref);

      if (record) {
        return {
          initialDataUpdatedAt: record.freshnessAt ?? record.cachedAt,
          value: clientCache.resolveEntityRef(ref),
        };
      }
    }
  }

  const output = queryKey ? clientCache.readOutput(queryKey, descriptor) : undefined;

  return output
    ? {
        initialDataUpdatedAt: output.initialDataUpdatedAt,
        value: output.value,
      }
    : undefined;
};
