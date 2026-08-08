import {
  type AnyEntityDefinition,
  type InferEntityRecord,
  type RelationDefinition,
  type RelationKind,
} from './definitions.js';
import type { RelatedRootReadSpec } from './relation-root.js';
import {
  selectionAll,
  selectionAnd,
  type EntitySelectionSource,
  type SemanticSelection,
  type SelectionExpression,
  type SelectionPredicate,
} from './selection-ast.js';

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

type RelationResult<TRelationKind extends RelationKind, TItem> = TRelationKind extends 'belongsTo'
  ? TItem | null
  : TItem[];

type InferRelationBuilderResult<TRelationBuilder> =
  TRelationBuilder extends RelationQueryBuilder<
    AnyEntityDefinition,
    infer TRelationKind,
    infer TItem
  >
    ? RelationResult<TRelationKind, TItem>
    : never;

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

export type AnyRelationQueryBuilder = RelationQueryBuilder<any, any, any>;

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
> {
  readonly kind = 'relation-builder';

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
    build: (root: EntityProxy<TEntity>) => TInclude,
  ) {
    return new RelationQueryBuilder<
      TEntity,
      TRelationKind,
      Simplify<TItem & InferIncludeShape<TInclude>>
    >(
      this.relationName,
      this.relationKind,
      this.entity,
      this.selectShape,
      build(createEntityProxy(this.entity)),
      this.orderBySpecs,
      this.limitValue,
    );
  }

  select<TSelection extends Record<string, SelectionValue>>(
    build: (root: EntityProxy<TEntity>) => TSelection,
  ) {
    return new RelationQueryBuilder<TEntity, TRelationKind, InferSelectionShape<TSelection>>(
      this.relationName,
      this.relationKind,
      this.entity,
      build(createEntityProxy(this.entity)),
      this.includeShape,
      this.orderBySpecs,
      this.limitValue,
    );
  }

  orderBy(build: (root: EntityProxy<TEntity>) => AnyFieldReference | OrderSpec) {
    const result = build(createEntityProxy(this.entity));
    const orderSpec = result.kind === 'field-ref' ? result.asc() : result;

    return new RelationQueryBuilder<TEntity, TRelationKind, TItem>(
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
    return new RelationQueryBuilder<TEntity, TRelationKind, TItem>(
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
  [TRelationName in keyof TEntity['relations']]: TEntity['relations'][TRelationName] extends RelationDefinition<
    infer TRelationKind,
    infer TTarget
  >
    ? RelationQueryBuilder<TTarget, TRelationKind, InferEntityRecord<TTarget['fields']>> & {
        relationKind: TRelationKind;
      }
    : never;
};

type FieldReferences<TEntity extends AnyEntityDefinition> = {
  [TFieldName in keyof InferEntityRecord<TEntity['fields']>]: FieldReference<
    InferEntityRecord<TEntity['fields']>[TFieldName]
  >;
};

export type EntityProxy<TEntity extends AnyEntityDefinition> = FieldReferences<TEntity> &
  RelationReferences<TEntity>;

const createEntityProxy = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
): EntityProxy<TEntity> => {
  const proxy: Record<string, unknown> = {};

  for (const fieldName of Object.keys(entityDefinition.fields)) {
    proxy[fieldName] = createFieldReference(fieldName);
  }

  for (const [relationName, relationDefinition] of Object.entries(
    entityDefinition.relations,
  ) as Array<[string, RelationDefinition<RelationKind, AnyEntityDefinition>]>) {
    proxy[relationName] = new RelationQueryBuilder(
      relationName,
      relationDefinition.relationKind,
      relationDefinition.target,
    );
  }

  return proxy as EntityProxy<TEntity>;
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
  __result?: unknown;
};

export class QueryBuilder<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
> {
  constructor(readonly spec: QuerySpec<TEntity, TResult>) {}

  where(
    build:
      | ((root: EntityProxy<TEntity>) => SelectionExpression)
      | EntitySelectionSource<TEntity>
      | SemanticSelection<TEntity['name']>,
  ) {
    if (
      typeof build !== 'function' &&
      build.root !== this.spec.root &&
      build.root.name !== this.spec.root.name
    ) {
      throw new Error(`Cannot apply a ${build.root.name} selection to ${this.spec.root.name}.`);
    }

    return new QueryBuilder<TEntity, TResult>({
      ...this.spec,
      selection: selectionAnd(
        this.spec.selection,
        typeof build === 'function' ? build(createEntityProxy(this.spec.root)) : build.expression,
      ),
      ...(typeof build !== 'function' &&
      (this.spec.cardinality === 'one' || build.cardinality === 'one')
        ? { cardinality: 'one' as const }
        : {}),
    });
  }

  select<TSelection extends Record<string, SelectionValue>>(
    build: (root: EntityProxy<TEntity>) => TSelection,
  ) {
    return new QueryBuilder<TEntity, InferSelectionShape<TSelection>>({
      ...this.spec,
      select: build(createEntityProxy(this.spec.root)),
    } as QuerySpec<TEntity, InferSelectionShape<TSelection>>);
  }

  include<TInclude extends Record<string, AnyRelationQueryBuilder>>(
    build: (root: EntityProxy<TEntity>) => TInclude,
  ) {
    return new QueryBuilder<TEntity, Simplify<TResult & InferIncludeShape<TInclude>>>({
      ...this.spec,
      includes: {
        ...(this.spec.includes ?? {}),
        ...build(createEntityProxy(this.spec.root)),
      },
    });
  }

  orderBy(build: (root: EntityProxy<TEntity>) => AnyFieldReference | OrderSpec) {
    const result = build(createEntityProxy(this.spec.root));
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

  build() {
    return this.spec;
  }
}

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
