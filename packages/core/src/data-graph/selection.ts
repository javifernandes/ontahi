import { GraphCommand, type GraphCommandSpec } from './command.js';
import type {
  AnyEntityDefinition,
  InferEntityMutationRecord,
  InferEntityRecord,
} from './definitions.js';
import type { QueryBuilder, QuerySpec } from './query.js';
import {
  selectionNone,
  type EntitySelectionSource,
  type SemanticSelection,
  type SelectionExpression,
} from './selection-ast.js';
import type { RecursiveEntityViewDefinition } from './view.js';

type EntityMutationPayload<TEntity extends AnyEntityDefinition> = Partial<
  InferEntityMutationRecord<TEntity['fields']>
>;

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

export type EntityMutationFieldName<TEntity extends AnyEntityDefinition> =
  keyof InferEntityMutationRecord<TEntity['fields']> & string;

export type PickEntityFields<
  TEntity extends AnyEntityDefinition,
  TFieldNames extends readonly EntityMutationFieldName<TEntity>[],
> = Pick<InferEntityRecord<TEntity['fields']>, TFieldNames[number]>;

type EntitySelection<TEntity extends AnyEntityDefinition> =
  | SelectionExpression
  | EntitySelectionSource<TEntity>
  | SemanticSelection<TEntity['name']>;

const resolveEntitySelection = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  selection: EntitySelection<TEntity>,
) => {
  if (!('expression' in selection)) return selection;
  if (selection.root !== root && selection.root.name !== root.name) {
    throw new Error(`Cannot target ${root.name} with a ${selection.root.name} selection.`);
  }
  return selection.expression;
};

export const createUpdateCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  selection: EntitySelection<TEntity>,
  payload: EntityMutationPayload<TEntity>,
  options?: {
    returning?: readonly EntityMutationFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  },
): GraphCommandSpec<TEntity, EntityMutationPayload<TEntity>> => ({
  kind: 'command',
  operation: 'update',
  root,
  selection: resolveEntitySelection(root, selection),
  payload,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
  ...(options?.cardinality ? { cardinality: options.cardinality } : {}),
});

export const createDeleteCommandSpec = <TEntity extends AnyEntityDefinition, TResult = void>(
  root: TEntity,
  selection: EntitySelection<TEntity>,
  options?: {
    returning?: readonly EntityMutationFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  },
): GraphCommandSpec<TEntity, never, TResult> => ({
  kind: 'command',
  operation: 'delete',
  root,
  selection: resolveEntitySelection(root, selection),
  ...(options?.returning ? { returning: [...options.returning] } : {}),
  ...(options?.cardinality ? { cardinality: options.cardinality } : {}),
});

export const createInsertCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: EntityMutationPayload<TEntity>,
  options?: {
    returning?: readonly EntityMutationFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  },
): GraphCommandSpec<TEntity, EntityMutationPayload<TEntity>> => ({
  kind: 'command',
  operation: 'insert',
  root,
  selection: selectionNone(),
  payload,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
  ...(options?.cardinality ? { cardinality: options.cardinality } : {}),
});

export const createInsertManyCommandSpec = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: Array<EntityMutationPayload<TEntity>>,
  options?: {
    returning?: readonly EntityMutationFieldName<TEntity>[];
  },
): GraphCommandSpec<TEntity, Array<EntityMutationPayload<TEntity>>> => ({
  kind: 'command',
  operation: 'insert_many',
  root,
  selection: selectionNone(),
  payload,
  ...(options?.returning ? { returning: [...options.returning] } : {}),
});

type UpsertCommandOptions<TEntity extends AnyEntityDefinition> = {
  conflictOn: readonly EntityMutationFieldName<TEntity>[];
  strategy: 'ignore' | 'merge';
};

const createUpsertCommandSpecForPayload = <
  TEntity extends AnyEntityDefinition,
  TPayload extends EntityMutationPayload<TEntity> | Array<EntityMutationPayload<TEntity>>,
>(
  root: TEntity,
  payload: TPayload,
  options: UpsertCommandOptions<TEntity>,
): GraphCommandSpec<TEntity, TPayload> => ({
  kind: 'command',
  operation: 'upsert',
  root,
  selection: selectionNone(),
  payload,
  upsert: {
    conflictOn: [...options.conflictOn],
    strategy: options.strategy,
  },
});

export const createUpsertCommandSpec: <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: EntityMutationPayload<TEntity>,
  options: UpsertCommandOptions<TEntity>,
) => GraphCommandSpec<TEntity, EntityMutationPayload<TEntity>> = createUpsertCommandSpecForPayload;

export const createUpsertManyCommandSpec: <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  payload: Array<EntityMutationPayload<TEntity>>,
  options: UpsertCommandOptions<TEntity>,
) => GraphCommandSpec<TEntity, Array<EntityMutationPayload<TEntity>>> =
  createUpsertCommandSpecForPayload;

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

  as<TView extends RecursiveEntityViewDefinition<TEntity, any, any>>(view: TView) {
    const nextBuilder = this.builder.as(view);
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
    payload: EntityMutationPayload<TEntity>,
  ): GraphCommand<TEntity, EntityMutationPayload<TEntity>> {
    return this.updateCommand(payload);
  }

  updateOne(
    payload: EntityMutationPayload<TEntity>,
  ): GraphCommand<TEntity, EntityMutationPayload<TEntity>> {
    return this.updateCommand(payload, { cardinality: 'one' });
  }

  updateMany(
    payload: EntityMutationPayload<TEntity>,
  ): GraphCommand<TEntity, EntityMutationPayload<TEntity>> {
    return this.update(payload);
  }

  updateReturning<TFieldNames extends readonly EntityMutationFieldName<TEntity>[]>(
    payload: EntityMutationPayload<TEntity>,
    fieldNames: TFieldNames,
  ): GraphCommand<
    TEntity,
    EntityMutationPayload<TEntity>,
    Array<PickEntityFields<TEntity, TFieldNames>>
  > {
    return this.updateCommand(payload, { returning: fieldNames }) as GraphCommand<
      TEntity,
      EntityMutationPayload<TEntity>,
      Array<PickEntityFields<TEntity, TFieldNames>>
    >;
  }

  updateOneReturning<TFieldNames extends readonly EntityMutationFieldName<TEntity>[]>(
    payload: EntityMutationPayload<TEntity>,
    fieldNames: TFieldNames,
  ): GraphCommand<TEntity, EntityMutationPayload<TEntity>, PickEntityFields<TEntity, TFieldNames>> {
    return this.updateCommand(payload, {
      returning: fieldNames,
      cardinality: 'one',
    }) as GraphCommand<
      TEntity,
      EntityMutationPayload<TEntity>,
      PickEntityFields<TEntity, TFieldNames>
    >;
  }

  updateManyReturning<TFieldNames extends readonly EntityMutationFieldName<TEntity>[]>(
    payload: EntityMutationPayload<TEntity>,
    fieldNames: TFieldNames,
  ): GraphCommand<
    TEntity,
    EntityMutationPayload<TEntity>,
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

  deleteOneReturning<TFieldNames extends readonly EntityMutationFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ): GraphCommand<TEntity, never, PickEntityFields<TEntity, TFieldNames>> {
    return this.deleteCommand<PickEntityFields<TEntity, TFieldNames>>({
      returning: fieldNames,
      cardinality: 'one',
    });
  }

  deleteManyReturning<TFieldNames extends readonly EntityMutationFieldName<TEntity>[]>(
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
    payload: EntityMutationPayload<TEntity>,
    options?: {
      returning?: readonly EntityMutationFieldName<TEntity>[];
      cardinality?: 'one' | 'many';
    },
  ) {
    return this.factories.createCommand(
      createUpdateCommandSpec(this.root, this.builder.spec.selection, payload, {
        ...options,
        ...(this.builder.spec.cardinality === 'one' ? { cardinality: 'one' as const } : {}),
      }),
    );
  }

  protected deleteCommand<TResultCommand = void>(options?: {
    returning?: readonly EntityMutationFieldName<TEntity>[];
    cardinality?: 'one' | 'many';
  }) {
    return this.factories.createCommand<TEntity, never, TResultCommand>(
      createDeleteCommandSpec<TEntity, TResultCommand>(this.root, this.builder.spec.selection, {
        ...options,
        ...(this.builder.spec.cardinality === 'one' ? { cardinality: 'one' as const } : {}),
      }),
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
