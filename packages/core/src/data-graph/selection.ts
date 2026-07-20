import { GraphCommand, type GraphCommandSpec } from './command.js';
import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import type { QueryBuilder, QuerySpec } from './query.js';

export type QueryWhereArg<TEntity extends AnyEntityDefinition, TResult> = Parameters<
  QueryBuilder<TEntity, TResult>['where']
>[0];

export type QuerySelectArg<TEntity extends AnyEntityDefinition, TResult> = Parameters<
  QueryBuilder<TEntity, TResult>['select']
>[0];

export type QueryIncludeArg<TEntity extends AnyEntityDefinition, TResult> = Parameters<
  QueryBuilder<TEntity, TResult>['include']
>[0];

export type QueryOrderByArg<TEntity extends AnyEntityDefinition, TResult> = Parameters<
  QueryBuilder<TEntity, TResult>['orderBy']
>[0];

export type EntityFieldName<TEntity extends AnyEntityDefinition> = keyof InferEntityRecord<
  TEntity['fields']
> &
  string;

export type PickEntityFields<
  TEntity extends AnyEntityDefinition,
  TFieldNames extends readonly EntityFieldName<TEntity>[],
> = Pick<InferEntityRecord<TEntity['fields']>, TFieldNames[number]>;

type EntityWhere<TEntity extends AnyEntityDefinition> = QuerySpec<
  TEntity,
  InferEntityRecord<TEntity['fields']>
>['where'];

export const createUpdateCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  where: EntityWhere<TEntity>,
  payload: Partial<InferEntityRecord<TEntity['fields']>>,
  options?: {
    returning?: readonly EntityFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  },
): GraphCommandSpec<TEntity, Partial<InferEntityRecord<TEntity['fields']>>> => ({
  kind: 'command',
  operation: 'update',
  root,
  where,
  payload,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
  ...(options?.cardinality ? { cardinality: options.cardinality } : {}),
});

export const createDeleteCommandSpec = <TEntity extends AnyEntityDefinition, TResult = void>(
  root: TEntity,
  where: EntityWhere<TEntity>,
  options?: {
    returning?: readonly EntityFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  },
): GraphCommandSpec<TEntity, never, TResult> => ({
  kind: 'command',
  operation: 'delete',
  root,
  where,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
  ...(options?.cardinality ? { cardinality: options.cardinality } : {}),
});

export const createInsertCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: Partial<InferEntityRecord<TEntity['fields']>>,
  options?: {
    returning?: readonly EntityFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  },
): GraphCommandSpec<TEntity, Partial<InferEntityRecord<TEntity['fields']>>> => ({
  kind: 'command',
  operation: 'insert',
  root,
  where: [],
  payload,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
  ...(options?.cardinality ? { cardinality: options.cardinality } : {}),
});

export const createInsertManyCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: Array<Partial<InferEntityRecord<TEntity['fields']>>>,
  options?: {
    returning?: readonly EntityFieldName<TEntity>[];
  },
): GraphCommandSpec<TEntity, Array<Partial<InferEntityRecord<TEntity['fields']>>>> => ({
  kind: 'command',
  operation: 'insert_many',
  root,
  where: [],
  payload,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
});

export const createUpsertCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: Partial<InferEntityRecord<TEntity['fields']>>,
  options: {
    conflictOn: readonly EntityFieldName<TEntity>[];
    strategy: 'ignore' | 'merge';
  },
): GraphCommandSpec<TEntity, Partial<InferEntityRecord<TEntity['fields']>>> => ({
  kind: 'command',
  operation: 'upsert',
  root,
  where: [],
  payload,
  upsert: {
    conflictOn: [...options.conflictOn],
    strategy: options.strategy,
  },
});

export interface GraphSelectionFactories {
  createSelection<TEntity extends AnyEntityDefinition, TResult>(
    builder: QueryBuilder<TEntity, TResult>,
  ): GraphSelection<TEntity, TResult>;
  createCommand<TEntity extends AnyEntityDefinition, TPayload = unknown, TResult = void>(
    spec: GraphCommandSpec<TEntity, TPayload, TResult>,
  ): GraphCommand<TEntity, TPayload, TResult>;
}

let defaultGraphSelectionFactories!: GraphSelectionFactories;

type SelectionFromBuilder<TBuilder> =
  TBuilder extends QueryBuilder<infer TEntity, infer TResult>
    ? GraphSelection<TEntity, TResult>
    : never;

export class GraphSelection<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
> {
  constructor(
    protected readonly builder: QueryBuilder<TEntity, TResult>,
    protected readonly factories: GraphSelectionFactories = defaultGraphSelectionFactories,
  ) {}

  get root(): TEntity {
    return this.builder.spec.root;
  }

  where(build: QueryWhereArg<TEntity, TResult>) {
    const nextBuilder = this.whereBuilder(build);
    return this.factories.createSelection(nextBuilder) as SelectionFromBuilder<typeof nextBuilder>;
  }

  select(build: QuerySelectArg<TEntity, TResult>) {
    const nextBuilder = this.selectBuilder(build);
    return this.factories.createSelection(nextBuilder) as SelectionFromBuilder<typeof nextBuilder>;
  }

  include(build: QueryIncludeArg<TEntity, TResult>) {
    const nextBuilder = this.includeBuilder(build);
    return this.factories.createSelection(nextBuilder) as SelectionFromBuilder<typeof nextBuilder>;
  }

  orderBy(build: QueryOrderByArg<TEntity, TResult>) {
    const nextBuilder = this.orderByBuilder(build);
    return this.factories.createSelection(nextBuilder) as SelectionFromBuilder<typeof nextBuilder>;
  }

  limit(limitValue: number) {
    const nextBuilder = this.limitBuilder(limitValue);
    return this.factories.createSelection(nextBuilder) as SelectionFromBuilder<typeof nextBuilder>;
  }

  build(): QuerySpec<TEntity, TResult> {
    return this.builder.build();
  }

  update(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ): GraphCommand<TEntity, Partial<InferEntityRecord<TEntity['fields']>>> {
    return this.updateCommand(payload);
  }

  updateOne(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ): GraphCommand<TEntity, Partial<InferEntityRecord<TEntity['fields']>>> {
    return this.updateCommand(payload, { cardinality: 'one' });
  }

  updateMany(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ): GraphCommand<TEntity, Partial<InferEntityRecord<TEntity['fields']>>> {
    return this.update(payload);
  }

  updateReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ): GraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    Array<PickEntityFields<TEntity, TFieldNames>>
  > {
    return this.updateCommand(payload, { returning: fieldNames }) as GraphCommand<
      TEntity,
      Partial<InferEntityRecord<TEntity['fields']>>,
      Array<PickEntityFields<TEntity, TFieldNames>>
    >;
  }

  updateOneReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ): GraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    PickEntityFields<TEntity, TFieldNames>
  > {
    return this.updateCommand(payload, {
      returning: fieldNames,
      cardinality: 'one',
    }) as GraphCommand<
      TEntity,
      Partial<InferEntityRecord<TEntity['fields']>>,
      PickEntityFields<TEntity, TFieldNames>
    >;
  }

  updateManyReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ): GraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    Array<PickEntityFields<TEntity, TFieldNames>>
  > {
    return this.updateReturning(payload, fieldNames);
  }

  delete(): GraphCommand<TEntity> {
    return this.deleteCommand();
  }

  deleteOne(): GraphCommand<TEntity> {
    return this.deleteCommand({ cardinality: 'one' });
  }

  deleteMany(): GraphCommand<TEntity> {
    return this.delete();
  }

  deleteOneReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ): GraphCommand<TEntity, never, PickEntityFields<TEntity, TFieldNames>> {
    return this.deleteCommand<PickEntityFields<TEntity, TFieldNames>>({
      returning: fieldNames,
      cardinality: 'one',
    });
  }

  deleteManyReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ): GraphCommand<TEntity, never, Array<PickEntityFields<TEntity, TFieldNames>>> {
    return this.deleteCommand<Array<PickEntityFields<TEntity, TFieldNames>>>({
      returning: fieldNames,
    });
  }

  protected whereBuilder(build: QueryWhereArg<TEntity, TResult>) {
    return this.builder.where(build);
  }

  protected selectBuilder(build: QuerySelectArg<TEntity, TResult>) {
    return this.builder.select(build as QuerySelectArg<TEntity, TResult>);
  }

  protected includeBuilder(build: QueryIncludeArg<TEntity, TResult>) {
    return this.builder.include(build as QueryIncludeArg<TEntity, TResult>);
  }

  protected orderByBuilder(build: QueryOrderByArg<TEntity, TResult>) {
    return this.builder.orderBy(build);
  }

  protected limitBuilder(limitValue: number) {
    return this.builder.limit(limitValue);
  }

  protected updateCommand(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    options?: {
      returning?: readonly EntityFieldName<TEntity>[];
      cardinality?: 'one' | 'many';
    },
  ) {
    return this.factories.createCommand(
      createUpdateCommandSpec(this.root, this.builder.spec.where, payload, options),
    );
  }

  protected deleteCommand<TResultCommand = void>(options?: {
    returning?: readonly EntityFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  }) {
    return this.factories.createCommand<TEntity, never, TResultCommand>(
      createDeleteCommandSpec<TEntity, TResultCommand>(this.root, this.builder.spec.where, options),
    );
  }

  pipe<TValue>(fn: (selection: this) => TValue): TValue {
    return fn(this);
  }
}

defaultGraphSelectionFactories = {
  createSelection: <TEntity extends AnyEntityDefinition, TResult>(
    builder: QueryBuilder<TEntity, TResult>,
  ) => new GraphSelection(builder, defaultGraphSelectionFactories),
  createCommand: <TEntity extends AnyEntityDefinition, TPayload = unknown, TResult = void>(
    spec: GraphCommandSpec<TEntity, TPayload, TResult>,
  ) => new GraphCommand(spec),
};
