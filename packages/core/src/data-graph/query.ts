import { hasOwn, isRecord } from '../value/object.js';

import {
  type AnyEntityDefinition,
  type InferEntityRecord,
  type RelationDefinition,
  type RelationKind,
} from './definitions.js';
import { isEntityRef, type EntityRef } from './ref/index.js';
import type { RelatedRootReadSpec } from './relation-root.js';
import {
  selectionAll,
  selectionAnd,
  selectionReferences,
  type EntitySelectionSource,
  type SemanticSelection,
  type SelectionExpression,
  type SelectionPredicate,
} from './selection-ast.js';
import { applyViewToQuerySpec } from './view-query.js';
import type {
  EntityViewAst,
  InferEntityViewResult,
  RecursiveEntityViewDefinition,
} from './view.js';

type OrderDirection = 'asc' | 'desc';

type OrderSpec = {
  kind: 'order';
  fieldName: string;
  direction: OrderDirection;
};

type FieldReference<TValue = unknown> = {
  kind: 'field-ref';
  fieldName: string;
  eq: (value: TValue) => SelectionPredicate;
  in: (values: readonly TValue[]) => SelectionPredicate;
  isNull: () => SelectionPredicate;
  lte: (value: TValue) => SelectionPredicate;
  lt: (value: TValue) => SelectionPredicate;
  gte: (value: TValue) => SelectionPredicate;
  gt: (value: TValue) => SelectionPredicate;
  asc: () => OrderSpec;
  desc: () => OrderSpec;
};

type AnyFieldReference = FieldReference<any>;

type ReferenceFieldReference<TValue> = Pick<
  FieldReference<TValue>,
  'kind' | 'fieldName' | 'eq' | 'in' | 'isNull'
>;

const createFieldReference = <TValue>(fieldName: string): FieldReference<TValue> => ({
  kind: 'field-ref',
  fieldName,
  eq: value => ({ kind: 'predicate', operator: 'eq', fieldName, value }),
  in: values => ({ kind: 'predicate', operator: 'in', fieldName, values }),
  isNull: () => ({ kind: 'predicate', operator: 'isNull', fieldName }),
  lte: value => ({ kind: 'predicate', operator: 'lte', fieldName, value }),
  lt: value => ({ kind: 'predicate', operator: 'lt', fieldName, value }),
  gte: value => ({ kind: 'predicate', operator: 'gte', fieldName, value }),
  gt: value => ({ kind: 'predicate', operator: 'gt', fieldName, value }),
  asc: () => ({ kind: 'order', fieldName, direction: 'asc' }),
  desc: () => ({ kind: 'order', fieldName, direction: 'desc' }),
});

export interface SelectionObject {
  [key: string]: SelectionValue;
}

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

type RelationResult<
  TRelationKind extends RelationKind,
  TItem,
  TNullable extends boolean,
> = TRelationKind extends 'belongsTo' ? (TNullable extends false ? TItem : TItem | null) : TItem[];

type InferRelationBuilderResult<TRelationBuilder extends AnyRelationQueryBuilder> = RelationResult<
  TRelationBuilder['relationKind'],
  TRelationBuilder['__item'],
  TRelationBuilder['__nullable']
>;

type InferSelectionValue<TValue> =
  TValue extends FieldReference<infer TFieldValue>
    ? TFieldValue
    : TValue extends RelationQueryBuilder<any, any, any>
      ? InferRelationBuilderResult<TValue>
      : TValue extends SelectionObject
        ? InferSelectionShape<TValue>
        : never;

export type InferSelectionShape<TSelection extends SelectionObject> = Simplify<{
  [TKey in keyof TSelection]: InferSelectionValue<TSelection[TKey]>;
}>;

export type InferIncludeShape<TInclude extends Record<string, AnyRelationQueryBuilder>> = Simplify<{
  [TKey in keyof TInclude]: InferRelationBuilderResult<TInclude[TKey]>;
}>;

export type AnyRelationQueryBuilder = RelationQueryBuilder<any, any, any, any>;

export type SelectionValue = AnyFieldReference | AnyRelationQueryBuilder | SelectionObject;

export type RelationNodeSpec = {
  relationName: string;
  relationKind: RelationKind;
  entity: AnyEntityDefinition;
  select?: Record<string, SelectionValue>;
  includes?: Record<string, AnyRelationQueryBuilder>;
  orderBy: OrderSpec[];
  limit?: number;
};

export class RelationQueryBuilder<
  TEntity extends AnyEntityDefinition,
  TRelationKind extends RelationKind = RelationKind,
  TItem = InferEntityRecord<TEntity['fields']>,
  TNullable extends boolean = boolean,
> {
  readonly kind = 'relation-builder';
  declare readonly __item: TItem;
  declare readonly __nullable: TNullable;

  constructor(
    readonly relationName: string,
    readonly relationKind: TRelationKind,
    readonly entity: TEntity,
    readonly selectShape?: Record<string, SelectionValue>,
    readonly includeShape?: Record<string, AnyRelationQueryBuilder>,
    readonly orderBySpecs: readonly OrderSpec[] = [],
    readonly limitValue?: number,
  ) {}

  include<TInclude extends Record<string, AnyRelationQueryBuilder>>(
    build: (root: EntityIncludeProxy<TEntity>) => TInclude,
  ) {
    return new RelationQueryBuilder<
      TEntity,
      TRelationKind,
      Simplify<Omit<TItem, keyof TInclude> & InferIncludeShape<TInclude>>,
      TNullable
    >(
      this.relationName,
      this.relationKind,
      this.entity,
      this.selectShape,
      build(createEntityIncludeProxy(this.entity)),
      this.orderBySpecs,
      this.limitValue,
    );
  }

  select<TSelection extends Record<string, SelectionValue>>(
    build: (root: EntitySelectionProxy<TEntity>) => TSelection,
  ) {
    return new RelationQueryBuilder<
      TEntity,
      TRelationKind,
      InferSelectionShape<TSelection>,
      TNullable
    >(
      this.relationName,
      this.relationKind,
      this.entity,
      build(createEntitySelectionProxy(this.entity)),
      this.includeShape,
      this.orderBySpecs,
      this.limitValue,
    );
  }

  orderBy(build: (root: EntityFieldProxy<TEntity>) => AnyFieldReference | OrderSpec) {
    const result = build(createEntityFieldProxy(this.entity));
    const orderSpec = result.kind === 'field-ref' ? result.asc() : result;

    return new RelationQueryBuilder<TEntity, TRelationKind, TItem, TNullable>(
      this.relationName,
      this.relationKind,
      this.entity,
      this.selectShape,
      this.includeShape,
      [...this.orderBySpecs, orderSpec],
      this.limitValue,
    );
  }

  limit(limitValue: number) {
    return new RelationQueryBuilder<TEntity, TRelationKind, TItem, TNullable>(
      this.relationName,
      this.relationKind,
      this.entity,
      this.selectShape,
      this.includeShape,
      this.orderBySpecs,
      limitValue,
    );
  }

  toNodeSpec(): RelationNodeSpec {
    return {
      relationName: this.relationName,
      relationKind: this.relationKind,
      entity: this.entity,
      select: this.selectShape,
      includes: this.includeShape,
      orderBy: [...this.orderBySpecs],
      limit: this.limitValue,
    };
  }
}

type RelationReferences<TEntity extends AnyEntityDefinition> = {
  [TRelationName in keyof TEntity['relations']]: TEntity['relations'][TRelationName] extends {
    relationKind: infer TRelationKind extends RelationKind;
    target: infer TTarget extends AnyEntityDefinition;
  }
    ? RelationQueryBuilder<
        TTarget,
        TRelationKind,
        InferEntityRecord<TTarget['fields']>,
        NonNullable<TEntity['relations'][TRelationName]['nullable']>
      > & {
        relationKind: TRelationKind;
      }
    : never;
};

type FieldReferences<TEntity extends AnyEntityDefinition> = {
  [TFieldName in keyof InferEntityRecord<
    TEntity['fields']
  >]: TFieldName extends keyof TEntity['fields']
    ? TEntity['fields'][TFieldName] extends { fieldType: 'reference' }
      ? ReferenceFieldReference<InferEntityRecord<TEntity['fields']>[TFieldName]>
      : FieldReference<InferEntityRecord<TEntity['fields']>[TFieldName]>
    : never;
};

export type EntityFieldProxy<TEntity extends AnyEntityDefinition> = FieldReferences<TEntity>;

export type EntitySelectionProxy<TEntity extends AnyEntityDefinition> = FieldReferences<TEntity> &
  Omit<RelationReferences<TEntity>, keyof FieldReferences<TEntity>>;

export type EntityIncludeProxy<TEntity extends AnyEntityDefinition> = RelationReferences<TEntity>;

/** @deprecated Prefer the proxy type that matches the Query clause. */
export type EntityProxy<TEntity extends AnyEntityDefinition> = EntityFieldProxy<TEntity>;

const createEntityFieldProxy = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
): EntityFieldProxy<TEntity> => {
  const proxy: Record<string, unknown> = {};

  for (const fieldName of Object.keys(entityDefinition.fields)) {
    proxy[fieldName] = createFieldReference(fieldName);
  }

  return proxy as EntityFieldProxy<TEntity>;
};

const createEntitySelectionProxy = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
): EntitySelectionProxy<TEntity> => {
  const proxy = createEntityFieldProxy(entityDefinition) as Record<string, unknown>;

  for (const [relationName, relationDefinition] of Object.entries(
    entityDefinition.relations,
  ) as Array<[string, RelationDefinition<RelationKind, AnyEntityDefinition>]>) {
    if (relationName in entityDefinition.fields) continue;
    proxy[relationName] = new RelationQueryBuilder(
      relationName,
      relationDefinition.relationKind,
      relationDefinition.target,
    );
  }

  return proxy as EntitySelectionProxy<TEntity>;
};

const createEntityIncludeProxy = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
): EntityIncludeProxy<TEntity> => {
  const proxy: Record<string, unknown> = {};

  for (const [relationName, relationDefinition] of Object.entries(
    entityDefinition.relations,
  ) as Array<[string, RelationDefinition<RelationKind, AnyEntityDefinition>]>) {
    proxy[relationName] = new RelationQueryBuilder(
      relationName,
      relationDefinition.relationKind,
      relationDefinition.target,
    );
  }

  return proxy as EntityIncludeProxy<TEntity>;
};

export type QuerySpec<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TResult = unknown,
> = {
  kind: 'query';
  root: TEntity;
  selection: SelectionExpression;
  select?: Record<string, SelectionValue>;
  includes?: Record<string, AnyRelationQueryBuilder>;
  orderBy: OrderSpec[];
  limit?: number;
  cardinality?: 'one' | 'many';
  view?: EntityViewAst;
  __result?: unknown;
};

export type GraphReadIntent = 'first' | 'one' | 'count' | 'exists';

export type GraphReadExpression<TRead, TIntent extends GraphReadIntent, TResult> = {
  readonly kind: 'graph-read-expression';
  readonly intent: TIntent;
  readonly read: TRead;
  readonly __result?: TResult;
};

export const isGraphReadExpression = (
  value: unknown,
): value is GraphReadExpression<unknown, GraphReadIntent, unknown> =>
  isRecord(value) && hasOwn(value, 'kind') && value.kind === 'graph-read-expression';

const graphReadExpression = <TRead, TIntent extends GraphReadIntent, TResult>(
  read: TRead,
  intent: TIntent,
): GraphReadExpression<TRead, TIntent, TResult> => ({
  kind: 'graph-read-expression',
  intent,
  read,
});

export class QueryBuilder<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
> {
  declare readonly __result?: TResult;

  constructor(readonly spec: QuerySpec<TEntity, TResult>) {}

  where(
    build:
      | ((root: EntityFieldProxy<TEntity>) => SelectionExpression)
      | EntitySelectionSource<TEntity>
      | SemanticSelection<TEntity['name']>
      | EntityRef<TEntity['name']>,
  ) {
    if (isEntityRef(build) && build.entityName !== this.spec.root.name) {
      throw new Error(`Cannot apply a ${build.entityName} reference to ${this.spec.root.name}.`);
    }
    if (
      typeof build !== 'function' &&
      !isEntityRef(build) &&
      build.root !== this.spec.root &&
      build.root.name !== this.spec.root.name
    ) {
      throw new Error(`Cannot apply a ${build.root.name} selection to ${this.spec.root.name}.`);
    }

    const expression =
      typeof build === 'function'
        ? build(createEntityFieldProxy(this.spec.root))
        : isEntityRef(build)
          ? selectionReferences([build])
          : build.expression;

    return new QueryBuilder<TEntity, TResult>({
      ...this.spec,
      selection: selectionAnd(this.spec.selection, expression),
      ...(typeof build !== 'function' &&
      !isEntityRef(build) &&
      (this.spec.cardinality === 'one' || build.cardinality === 'one')
        ? { cardinality: 'one' as const }
        : {}),
    });
  }

  select<TSelection extends Record<string, SelectionValue>>(
    build: (root: EntitySelectionProxy<TEntity>) => TSelection,
  ) {
    return new QueryBuilder<TEntity, InferSelectionShape<TSelection>>({
      ...this.spec,
      select: build(createEntitySelectionProxy(this.spec.root)),
      view: undefined,
    } as QuerySpec<TEntity, InferSelectionShape<TSelection>>);
  }

  include<TInclude extends Record<string, AnyRelationQueryBuilder>>(
    build: (root: EntityIncludeProxy<TEntity>) => TInclude,
  ) {
    return new QueryBuilder<
      TEntity,
      Simplify<Omit<TResult, keyof TInclude> & InferIncludeShape<TInclude>>
    >({
      ...this.spec,
      includes: {
        ...(this.spec.includes ?? {}),
        ...build(createEntityIncludeProxy(this.spec.root)),
      },
      view: undefined,
    } as unknown as QuerySpec<
      TEntity,
      Simplify<Omit<TResult, keyof TInclude> & InferIncludeShape<TInclude>>
    >);
  }

  as<TView extends RecursiveEntityViewDefinition<TEntity, any, any>>(view: TView) {
    return new QueryBuilder<TEntity, InferEntityViewResult<TView>>(
      applyViewToQuerySpec(this.spec, view),
    );
  }

  orderBy(build: (root: EntityFieldProxy<TEntity>) => AnyFieldReference | OrderSpec) {
    const result = build(createEntityFieldProxy(this.spec.root));
    const orderSpec = result.kind === 'field-ref' ? result.asc() : result;

    return new QueryBuilder<TEntity, TResult>({
      ...this.spec,
      orderBy: [...this.spec.orderBy, orderSpec],
    });
  }

  limit(limitValue: number) {
    return new QueryBuilder<TEntity, TResult>({
      ...this.spec,
      limit: limitValue,
    });
  }

  first() {
    return graphReadExpression<QueryBuilder<TEntity, TResult>, 'first', TResult>(this, 'first');
  }

  one() {
    const read = new QueryBuilder<TEntity, TResult>({
      ...this.spec,
      cardinality: 'one',
    });

    return graphReadExpression<QueryBuilder<TEntity, TResult>, 'one', TResult>(read, 'one');
  }

  count() {
    return graphReadExpression<QueryBuilder<TEntity, TResult>, 'count', TResult>(this, 'count');
  }

  exists() {
    return graphReadExpression<QueryBuilder<TEntity, TResult>, 'exists', TResult>(this, 'exists');
  }

  build() {
    return this.spec;
  }
}

export type InferQueryResult<TQuery extends QueryBuilder<any, any>> = NonNullable<
  TQuery['__result']
>;

export const query = <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) =>
  new QueryBuilder<TEntity>({
    kind: 'query',
    root: entityDefinition,
    selection: selectionAll(),
    orderBy: [],
  });

export type ViewDefinition<
  TParams,
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TResult = unknown,
> = {
  kind: 'view';
  name: string;
  root: TEntity;
  build: (params: TParams) => QuerySpec<TEntity, TResult>;
};

export const view = <TParams, TEntity extends AnyEntityDefinition, TResult = unknown>(
  name: string,
  entityDefinition: TEntity,
  build: (input: {
    root: TEntity;
    params: TParams;
  }) => QueryBuilder<TEntity, TResult> | QuerySpec<TEntity, TResult>,
): ViewDefinition<TParams, TEntity, TResult> => ({
  kind: 'view',
  name,
  root: entityDefinition,
  build: params => {
    const built = build({ root: entityDefinition, params });
    return built instanceof QueryBuilder ? built.build() : built;
  },
});

export type PlainGraphRead<TParams, TResult> =
  | QueryBuilder<any, TResult>
  | QuerySpec<AnyEntityDefinition, TResult>
  | ViewDefinition<TParams, AnyEntityDefinition, TResult>;

export type GraphReadSpec<TParams, TResult> =
  | PlainGraphRead<TParams, TResult>
  | (RelatedRootReadSpec<any, any, any, any, any> & { __result?: TResult });

export type QueryOrView<TParams, TResult> = GraphReadSpec<TParams, TResult>;

export const resolveQuerySpec = <TParams, TResult>(
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
): QuerySpec<AnyEntityDefinition, TResult> => {
  if (queryOrView instanceof QueryBuilder) {
    return queryOrView.build();
  }

  if (queryOrView.kind === 'related-root-read') {
    throw new Error('resolveQuerySpec cannot resolve related-root reads directly.');
  }

  if (queryOrView.kind === 'view') {
    return queryOrView.build(params);
  }

  return queryOrView;
};
