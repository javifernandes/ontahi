import type { AnyEntityRef, EntityRef, EntityRefLocator } from '../../../model/entity/ref/model.js';

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

export type GraphClientCacheOutputSource = {
  readonly kind: 'graph-read' | 'operation';
  readonly name: string;
};

export type GraphClientCacheOutputRecord<TValue = unknown> = {
  source?: GraphClientCacheOutputSource;
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
  | { type: 'write'; version: number; write: GraphClientCacheWriteResult }
  | { type: 'write-output'; version: number; output: GraphClientCacheOutputRecord }
  | { type: 'invalidate'; version: number; invalidation: GraphClientCacheInvalidationResult }
  | { type: 'clear'; version: number };

export type GraphClientCacheListener = (event: GraphClientCacheEvent) => void;

export type GraphClientCacheOptions = {
  now?: () => number;
};

export type GraphClientCacheEventInput =
  | { type: 'write'; write: GraphClientCacheWriteResult }
  | { type: 'write-output'; output: GraphClientCacheOutputRecord }
  | { type: 'invalidate'; invalidation: GraphClientCacheInvalidationResult }
  | { type: 'clear' };
