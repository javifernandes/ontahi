import type { AnyEntityDefinition } from '../entity/definition.js';
import type { InferEntityRecord } from '../entity/field.js';

import type { QueryBuilder, QuerySpec, ViewDefinition } from './query.js';

export type RelatedRootSourceRead<TResult> =
  | QueryBuilder<any, TResult>
  | QuerySpec<any, TResult>
  | ViewDefinition<any, any, TResult>
  | RelatedRootReadSpec<any, any, any, TResult, any>;

export type RelatedRootReadMode = 'rows' | 'entityRows' | 'resolve' | 'countBySource';

export type RelationRootResolveResult<TSourceResult, TResult> = {
  sourceRows: TSourceResult[];
  rows: TResult[];
};

export type RelationRootGroupedCountResult<TSourceResult> = {
  sourceRows: TSourceResult[];
  countsBySource: Map<unknown, number>;
};

export type RelatedRootReadResult<
  TMode extends RelatedRootReadMode,
  TSourceResult,
  TResult,
  TTarget extends AnyEntityDefinition,
> = TMode extends 'entityRows'
  ? InferEntityRecord<TTarget['fields']>
  : TMode extends 'resolve'
    ? RelationRootResolveResult<TSourceResult, TResult>
    : TMode extends 'countBySource'
      ? RelationRootGroupedCountResult<TSourceResult>
      : TResult;

export type RelatedRootReadSpec<
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
  TSource extends AnyEntityDefinition = AnyEntityDefinition,
  TResult = unknown,
  TSourceResult = unknown,
  TMode extends RelatedRootReadMode = 'rows',
> = {
  kind: 'related-root-read';
  mode: TMode;
  target: QuerySpec<TTarget, TResult>;
  source: RelatedRootSourceRead<TSourceResult>;
  sourceEntity: TSource;
  relationName: string;
  relationOwner?: 'target' | 'source';
  __result?: RelatedRootReadResult<TMode, TSourceResult, TResult, TTarget>;
};

export const isRelatedRootReadSpec = (
  value: unknown,
): value is RelatedRootReadSpec<
  AnyEntityDefinition,
  AnyEntityDefinition,
  unknown,
  unknown,
  RelatedRootReadMode
> =>
  !!value && typeof value === 'object' && (value as { kind?: string }).kind === 'related-root-read';

export const createRelatedRootReadSpec = <
  TTarget extends AnyEntityDefinition,
  TSource extends AnyEntityDefinition,
  TResult,
  TSourceResult,
  TMode extends RelatedRootReadMode,
>(input: {
  mode: TMode;
  target: QuerySpec<TTarget, TResult>;
  source: RelatedRootSourceRead<TSourceResult>;
  sourceEntity: TSource;
  relationName: string;
  relationOwner?: 'target' | 'source';
}): RelatedRootReadSpec<TTarget, TSource, TResult, TSourceResult, TMode> => ({
  kind: 'related-root-read',
  mode: input.mode,
  target: input.target,
  source: input.source,
  sourceEntity: input.sourceEntity,
  relationName: input.relationName,
  ...(input.relationOwner ? { relationOwner: input.relationOwner } : {}),
});
