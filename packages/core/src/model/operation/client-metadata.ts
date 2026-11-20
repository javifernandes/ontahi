import { isEntityRef, normalizeEntityRef, type AnyEntityRef } from '../entity/ref/model.js';

export type QueryKeySegmentContext<TInput> = {
  input: TInput;
  operation: object;
};

export type QueryKeySegment<TInput> =
  | unknown
  | ((input: TInput, context: QueryKeySegmentContext<TInput>) => unknown);

export const queryRef =
  <TInput = Record<string, unknown>>(inputRefName: string): QueryKeySegment<TInput> =>
  (input: TInput) => {
    if (typeof input !== 'object' || input === null) return null;

    const directRef = (input as Record<string, unknown>)[inputRefName];
    return isEntityRef(directRef) ? normalizeEntityRef(directRef) : null;
  };

export type DomainOperationBridgeMetadata<TInput> = {
  query?: readonly QueryKeySegment<TInput>[];
  invalidate?: readonly (readonly QueryKeySegment<TInput>[])[];
};

export type DomainOperationClientCacheInvalidationContext<TInput, TResult> = {
  input: TInput;
  value: TResult;
  operation: {
    readonly [key: string]: unknown;
  };
};

export type DomainOperationClientCacheInvalidation<TInput = unknown, TResult = unknown> = (
  context: DomainOperationClientCacheInvalidationContext<TInput, TResult>,
) => AnyEntityRef | readonly AnyEntityRef[] | null | undefined;

export type ClientCacheKeySegmentContext<TInput> = {
  input: TInput;
  operation: {
    readonly [key: string]: unknown;
  };
  resolveRef?: (ref: AnyEntityRef) => AnyEntityRef;
};

export type ClientCacheKeySegment<TInput> =
  | unknown
  | ((input: TInput, context: ClientCacheKeySegmentContext<TInput>) => unknown);

export const cacheRef =
  <TInput = Record<string, unknown>>(inputRefName: string): ClientCacheKeySegment<TInput> =>
  (input: TInput, context: ClientCacheKeySegmentContext<TInput>) => {
    if (typeof input !== 'object' || input === null) {
      return null;
    }

    const inputRecord = input as Record<string, unknown>;
    const directRef = inputRecord[inputRefName];

    if (isEntityRef(directRef)) {
      return context.resolveRef?.(directRef) ?? directRef;
    }

    return null;
  };

export type DomainOperationClientCacheMetadata<TInput = unknown, TResult = unknown> = {
  query?: readonly ClientCacheKeySegment<TInput>[];
  invalidate?: readonly DomainOperationClientCacheInvalidation<TInput, TResult>[];
};
