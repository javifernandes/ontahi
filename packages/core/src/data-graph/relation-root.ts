import { Effect } from 'effect';

import { booleanComputation } from '../computation/conditional.js';

import type { ExecutableGraphRead } from './binding.js';
import {
  getEntityMapping,
  resolveFieldNameForEntity,
  type InferEntityRecord,
  type AnyEntityDefinition,
} from './definitions.js';
import {
  query,
  QueryBuilder,
  RelationQueryBuilder,
  type AnyRelationQueryBuilder,
  type InferSelectionShape,
  type QuerySpec,
  type SelectionValue,
  type SelectionObject,
  type ViewDefinition,
} from './query.js';
import { getEntityIdentityLocator } from './ref.js';
import type { BoundGraphSelection } from './selection-assembly.js';
import type { EntitySelectionSource } from './selection-ast.js';
import type { QueryOrderByArg, QuerySelectArg, QueryWhereArg } from './selection.js';

type RelatedRootSourceRead<TResult> =
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

export const isRelatedRootReadSpec = (value: unknown): value is RelatedRootReadSpec =>
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

export type RelationRootTargetEntity<
  TEntity extends AnyEntityDefinition,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> = TEntity & {
  all: () => BoundGraphSelection<
    TEntity,
    InferEntityRecord<TEntity['fields']>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
};

export type RelationRootSourceSelection<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> =
  | EntitySelectionSource<TEntity>
  | BoundGraphSelection<TEntity, TResult, TReadError, TReadOptions, TCommandError, TCommandOptions>
  | RelationRootSelection<
      TEntity,
      any,
      TResult,
      any,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >;

type CreateExecutableRelatedRootRead<TError, TOptions> = <
  TRead extends import('./query.js').QueryOrView<any, any>,
>(
  read: TRead,
) => ExecutableGraphRead<TRead, TError, TOptions>;

type RelationRootSelectionOptions<
  TTarget extends AnyEntityDefinition,
  TSource extends AnyEntityDefinition,
  TResult,
  TSourceResult,
  TReadError,
  TReadOptions,
  TCommandError,
  TCommandOptions,
> = {
  targetEntity: RelationRootTargetEntity<
    TTarget,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  sourceSelection: RelationRootSourceSelection<
    TSource,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  relationName: string;
  relationOwner?: 'target' | 'source';
  createExecutableGraphRead: CreateExecutableRelatedRootRead<TReadError, TReadOptions>;
  targetSelection?: BoundGraphSelection<
    TTarget,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
};

const isRelationRootSelection = <
  TEntity extends AnyEntityDefinition,
  TReadError,
  TReadOptions,
  TCommandError,
  TCommandOptions,
>(
  value: unknown,
): value is RelationRootSelection<
  TEntity,
  AnyEntityDefinition,
  any,
  any,
  TReadError,
  TReadOptions,
  TCommandError,
  TCommandOptions
> => value instanceof RelationRootSelection;

const getRelationRootSourceEntity = <
  TEntity extends AnyEntityDefinition,
  TReadError,
  TReadOptions,
  TCommandError,
  TCommandOptions,
>(
  sourceSelection: RelationRootSourceSelection<
    TEntity,
    unknown,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >,
): TEntity => {
  if (
    isRelationRootSelection<TEntity, TReadError, TReadOptions, TCommandError, TCommandOptions>(
      sourceSelection,
    )
  ) {
    return sourceSelection.entity as unknown as TEntity;
  }

  return (
    sourceSelection as BoundGraphSelection<
      TEntity,
      unknown,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >
  ).root;
};

const buildRelationRootSourceRead = <
  TEntity extends AnyEntityDefinition,
  TResult,
  TReadError,
  TReadOptions,
  TCommandError,
  TCommandOptions,
>(
  sourceSelection: RelationRootSourceSelection<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >,
): RelatedRootSourceRead<TResult> => {
  if (
    isRelationRootSelection<TEntity, TReadError, TReadOptions, TCommandError, TCommandOptions>(
      sourceSelection,
    )
  ) {
    return sourceSelection.build();
  }

  if ('expression' in sourceSelection) {
    return query(sourceSelection.root)
      .where(sourceSelection)
      .build() as RelatedRootSourceRead<TResult>;
  }

  return sourceSelection.build();
};

export class RelationRootSelection<
  TTarget extends AnyEntityDefinition,
  TSource extends AnyEntityDefinition,
  TResult = InferEntityRecord<TTarget['fields']>,
  TSourceResult = InferEntityRecord<TSource['fields']>,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> {
  private readonly targetEntity: RelationRootTargetEntity<
    TTarget,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;

  private readonly sourceSelection: RelationRootSourceSelection<
    TSource,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;

  private readonly relationName: string;
  private readonly relationOwner: 'target' | 'source';

  private readonly createExecutableGraphRead: CreateExecutableRelatedRootRead<
    TReadError,
    TReadOptions
  >;

  private readonly targetSelection: BoundGraphSelection<
    TTarget,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;

  constructor({
    targetEntity,
    sourceSelection,
    relationName,
    relationOwner = 'target',
    createExecutableGraphRead,
    targetSelection = targetEntity.all() as BoundGraphSelection<
      TTarget,
      TResult,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >,
  }: RelationRootSelectionOptions<
    TTarget,
    TSource,
    TResult,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >) {
    this.targetEntity = targetEntity;
    this.sourceSelection = sourceSelection;
    this.relationName = relationName;
    this.relationOwner = relationOwner;
    this.createExecutableGraphRead = createExecutableGraphRead;
    this.targetSelection = targetSelection;
  }

  get entity(): RelationRootTargetEntity<
    TTarget,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > {
    return this.targetEntity;
  }

  where(
    build: QueryWhereArg<TTarget, TResult>,
  ): RelationRootSelection<
    TTarget,
    TSource,
    TResult,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > {
    return new RelationRootSelection({
      targetEntity: this.targetEntity,
      sourceSelection: this.sourceSelection,
      relationName: this.relationName,
      relationOwner: this.relationOwner,
      createExecutableGraphRead: this.createExecutableGraphRead,
      targetSelection: this.targetSelection.where(build),
    });
  }

  select<TSelection extends SelectionObject>(
    build: (root: Parameters<QuerySelectArg<TTarget, TResult>>[0]) => TSelection,
  ): RelationRootSelection<
    TTarget,
    TSource,
    InferSelectionShape<TSelection>,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > {
    const nextSelection = this.targetSelection.select(build);

    return new RelationRootSelection<
      TTarget,
      TSource,
      InferSelectionShape<TSelection>,
      TSourceResult,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >({
      targetEntity: this.targetEntity,
      sourceSelection: this.sourceSelection,
      relationName: this.relationName,
      relationOwner: this.relationOwner,
      createExecutableGraphRead: this.createExecutableGraphRead,
      targetSelection: nextSelection,
    });
  }

  orderBy(
    build: QueryOrderByArg<TTarget, TResult>,
  ): RelationRootSelection<
    TTarget,
    TSource,
    TResult,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > {
    return new RelationRootSelection({
      targetEntity: this.targetEntity,
      sourceSelection: this.sourceSelection,
      relationName: this.relationName,
      relationOwner: this.relationOwner,
      createExecutableGraphRead: this.createExecutableGraphRead,
      targetSelection: this.targetSelection.orderBy(build),
    });
  }

  limit(
    limitValue: number,
  ): RelationRootSelection<
    TTarget,
    TSource,
    TResult,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > {
    return new RelationRootSelection({
      targetEntity: this.targetEntity,
      sourceSelection: this.sourceSelection,
      relationName: this.relationName,
      relationOwner: this.relationOwner,
      createExecutableGraphRead: this.createExecutableGraphRead,
      targetSelection: this.targetSelection.limit(limitValue),
    });
  }

  build(): RelatedRootReadSpec<TTarget, TSource, TResult, TSourceResult, 'rows'>;
  build<TMode extends RelatedRootReadMode>(
    mode: TMode,
  ): RelatedRootReadSpec<TTarget, TSource, TResult, TSourceResult, TMode>;
  build<TMode extends RelatedRootReadMode>(
    mode: TMode = 'rows' as TMode,
  ): RelatedRootReadSpec<TTarget, TSource, TResult, TSourceResult, TMode> {
    return createRelatedRootReadSpec({
      mode,
      target: this.targetSelection.build(),
      source: buildRelationRootSourceRead(this.sourceSelection),
      sourceEntity: getRelationRootSourceEntity(this.sourceSelection),
      relationName: this.relationName,
      relationOwner: this.relationOwner,
    });
  }

  resolveEntityRows(options?: TReadOptions) {
    return this.createExecutableGraphRead(this.build('entityRows')).run(undefined, options);
  }

  resolve(options?: TReadOptions) {
    return this.createExecutableGraphRead(this.build('resolve'))
      .run(undefined, options)
      .pipe(Effect.map(rows => rows[0]));
  }

  run(options?: TReadOptions) {
    return this.createExecutableGraphRead(this.build('rows')).run(undefined, options);
  }

  get(options?: TReadOptions) {
    return this.createExecutableGraphRead(this.build('rows')).get(undefined, options);
  }

  count(options?: TReadOptions) {
    return this.createExecutableGraphRead(this.build('rows')).count(undefined, options);
  }

  exists(options?: TReadOptions) {
    return booleanComputation(this.count(options).pipe(Effect.map(count => count > 0)));
  }

  countBySource(options?: TReadOptions) {
    return this.createExecutableGraphRead(this.build('countBySource'))
      .run(undefined, options)
      .pipe(Effect.map(rows => rows[0]));
  }
}

export const stripQueryShape = <TEntity extends AnyEntityDefinition>(
  spec: QuerySpec<TEntity, any>,
): QuerySpec<TEntity, InferEntityRecord<TEntity['fields']>> => ({
  ...spec,
  select: undefined,
  includes: undefined,
});

export const resolveRelatedRootFields = <
  TTarget extends AnyEntityDefinition,
  TSource extends AnyEntityDefinition,
>(
  targetEntity: TTarget,
  sourceEntity: TSource,
  relationName: string,
  relationOwner: 'target' | 'source' = 'target',
) => {
  const relationEntity = relationOwner === 'target' ? targetEntity : sourceEntity;
  const relationDefinition = relationEntity.relations[relationName];
  const expectedRelatedEntity = relationOwner === 'target' ? sourceEntity : targetEntity;
  if (relationDefinition?.target.name !== expectedRelatedEntity.name) {
    throw new Error(
      `Relation ${relationEntity.name}.${relationName} does not connect ${targetEntity.name} to ${sourceEntity.name}.`,
    );
  }

  const identityEntity =
    relationDefinition.relationKind === 'belongsTo' ? relationDefinition.target : relationEntity;
  const identityFields = getEntityIdentityLocator(identityEntity)?.locator.fields;
  const identityField = identityFields?.length === 1 ? identityFields[0] : undefined;
  const semanticFields =
    relationDefinition.relationKind === 'belongsTo'
      ? relationOwner === 'target'
        ? { targetField: relationDefinition.sourceField, sourceField: identityField }
        : { targetField: identityField, sourceField: relationDefinition.sourceField }
      : relationOwner === 'target'
        ? { targetField: identityField, sourceField: relationDefinition.targetField }
        : { targetField: relationDefinition.targetField, sourceField: identityField };

  if (semanticFields.targetField && semanticFields.sourceField) {
    return semanticFields as { targetField: string; sourceField: string };
  }

  const mapping = relationDefinition?.mapping;
  if (!relationDefinition || !mapping) {
    throw new Error(`Relation ${relationEntity.name}.${relationName} is missing mapping metadata.`);
  }

  const targetTable = getEntityMapping(targetEntity).tableName;
  const sourceTable = getEntityMapping(sourceEntity).tableName;

  const targetUsesFrom = mapping.fromTable === targetTable && mapping.toTable === sourceTable;
  const targetUsesTo = mapping.toTable === targetTable && mapping.fromTable === sourceTable;

  if (!targetUsesFrom && !targetUsesTo) {
    throw new Error(
      `Relation ${relationEntity.name}.${relationName} does not connect ${targetEntity.name} to ${sourceEntity.name}.`,
    );
  }

  return targetUsesFrom
    ? {
        targetField: resolveFieldNameForEntity(targetEntity, mapping.fromColumn),
        sourceField: resolveFieldNameForEntity(sourceEntity, mapping.toColumn),
      }
    : {
        targetField: resolveFieldNameForEntity(targetEntity, mapping.toColumn),
        sourceField: resolveFieldNameForEntity(sourceEntity, mapping.fromColumn),
      };
};

export const selectionUsesRelationBuilders = (
  selection: Record<string, SelectionValue> | undefined,
): boolean => {
  if (!selection) {
    return false;
  }

  return Object.values(selection).some(value => {
    if (value instanceof RelationQueryBuilder) {
      return true;
    }

    return (
      !!value &&
      typeof value === 'object' &&
      selectionUsesRelationBuilders(value as Record<string, SelectionValue>)
    );
  });
};

export const getPublicSourceFieldAccessor = (
  spec: {
    select?: Record<string, SelectionValue>;
    includes?: Record<string, AnyRelationQueryBuilder>;
  },
  fieldName: string,
): ((row: Record<string, unknown>) => unknown) | null => {
  if (!spec.select && !spec.includes) {
    return row => row[fieldName];
  }

  const selectShape = spec.select;
  if (!selectShape || spec.includes || selectionUsesRelationBuilders(selectShape)) {
    return null;
  }

  for (const [key, value] of Object.entries(selectShape)) {
    if (
      (value as { kind?: string }).kind === 'field-ref' &&
      (value as { fieldName: string }).fieldName === fieldName
    ) {
      return row => row[key];
    }
  }

  return null;
};

export const materializeFlatSelection = (
  row: Record<string, unknown>,
  selection: Record<string, SelectionValue>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(selection)) {
    if ((value as { kind?: string }).kind === 'field-ref') {
      result[key] = row[(value as { fieldName: string }).fieldName];
      continue;
    }

    if (value && typeof value === 'object') {
      result[key] = materializeFlatSelection(row, value as Record<string, SelectionValue>);
    }
  }

  return result;
};
