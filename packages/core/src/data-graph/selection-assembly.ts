import { Effect } from 'effect';

import type { BoundGraphRead, ExecutableGraphRead } from './binding.js';
import type { BoundGraphCommand } from './command-binding.js';
import type { GraphCommandSpec } from './command.js';
import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import {
  query,
  type AnyRelationQueryBuilder,
  type InferIncludeShape,
  type InferSelectionShape,
  type QueryBuilder,
  type SelectionObject,
  type ViewDefinition,
  view,
} from './query.js';
import {
  RelationRootSelection,
  type RelationRootSourceSelection,
  type RelationRootTargetEntity,
} from './relation-root.js';
import {
  GraphSelection as BaseGraphSelection,
  createInsertCommandSpec,
  createInsertManyCommandSpec,
  createUpsertCommandSpec,
  type EntityFieldName,
  type GraphSelectionFactories,
  type QueryIncludeArg,
  type QueryOrderByArg,
  type QuerySelectArg,
  type QueryWhereArg,
  type PickEntityFields,
} from './selection.js';

export type BoundGraphSelectionSemanticApi<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> = {
  where: (
    build: QueryWhereArg<TEntity, TResult>,
  ) => BoundGraphSelection<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  select: <TSelection extends SelectionObject>(
    build: (root: Parameters<QuerySelectArg<TEntity, TResult>>[0]) => TSelection,
  ) => BoundGraphSelection<
    TEntity,
    InferSelectionShape<TSelection>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  include: <TInclude extends Record<string, AnyRelationQueryBuilder>>(
    build: (root: Parameters<QueryIncludeArg<TEntity, TResult>>[0]) => TInclude,
  ) => BoundGraphSelection<
    TEntity,
    TResult & InferIncludeShape<TInclude>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  orderBy: (
    build: QueryOrderByArg<TEntity, TResult>,
  ) => BoundGraphSelection<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  limit: (
    limitValue: number,
  ) => BoundGraphSelection<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  update: (
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  updateOne: (
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  updateMany: (
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  updateReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    Array<PickEntityFields<TEntity, TFieldNames>>,
    TCommandError,
    TCommandOptions
  >;
  updateOneReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    PickEntityFields<TEntity, TFieldNames>,
    TCommandError,
    TCommandOptions
  >;
  updateManyReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    Array<PickEntityFields<TEntity, TFieldNames>>,
    TCommandError,
    TCommandOptions
  >;
  delete: () => BoundGraphCommand<TEntity, never, void, TCommandError, TCommandOptions>;
  deleteOne: () => BoundGraphCommand<TEntity, never, void, TCommandError, TCommandOptions>;
  deleteMany: () => BoundGraphCommand<TEntity, never, void, TCommandError, TCommandOptions>;
  deleteOneReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    never,
    PickEntityFields<TEntity, TFieldNames>,
    TCommandError,
    TCommandOptions
  >;
  deleteManyReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    never,
    Array<PickEntityFields<TEntity, TFieldNames>>,
    TCommandError,
    TCommandOptions
  >;
  pipe: <TValue>(
    fn: (
      selection: BoundGraphSelection<
        TEntity,
        TResult,
        TReadError,
        TReadOptions,
        TCommandError,
        TCommandOptions
      >,
    ) => TValue,
  ) => TValue;
};

export type BoundGraphSelectionRuntimeApi<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
  TReadError = never,
  TReadOptions = undefined,
> = {
  exec: () => ExecutableGraphRead<QueryBuilder<TEntity, TResult>, TReadError, TReadOptions>;
  get: (
    options?: TReadOptions,
  ) => ReturnType<
    ExecutableGraphRead<QueryBuilder<TEntity, TResult>, TReadError, TReadOptions>['get']
  >;
  run: (
    options?: TReadOptions,
  ) => ReturnType<
    ExecutableGraphRead<QueryBuilder<TEntity, TResult>, TReadError, TReadOptions>['run']
  >;
  count: (
    options?: TReadOptions,
  ) => ReturnType<
    ExecutableGraphRead<QueryBuilder<TEntity, TResult>, TReadError, TReadOptions>['count']
  >;
  stream: (
    options?: TReadOptions,
  ) => ReturnType<
    ExecutableGraphRead<QueryBuilder<TEntity, TResult>, TReadError, TReadOptions>['stream']
  >;
  exists: (options?: TReadOptions) => Effect.Effect<boolean, TReadError>;
  named: (
    name: string,
  ) => BoundGraphRead<ViewDefinition<undefined, TEntity, TResult>, TReadError, TReadOptions>;
};

export type BoundGraphSelection<
  TEntity extends AnyEntityDefinition,
  TResult = InferEntityRecord<TEntity['fields']>,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> = Omit<
  BaseGraphSelection<TEntity, TResult>,
  | keyof BoundGraphSelectionSemanticApi<
      TEntity,
      TResult,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >
  | keyof BoundGraphSelectionRuntimeApi<TEntity, TResult, TReadError, TReadOptions>
> &
  BoundGraphSelectionSemanticApi<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > &
  BoundGraphSelectionRuntimeApi<TEntity, TResult, TReadError, TReadOptions>;

export type BoundSelectionEntityBase<
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
  where: (
    build: Parameters<
      BoundGraphSelection<
        TEntity,
        InferEntityRecord<TEntity['fields']>,
        TReadError,
        TReadOptions,
        TCommandError,
        TCommandOptions
      >['where']
    >[0],
  ) => BoundGraphSelection<
    TEntity,
    InferEntityRecord<TEntity['fields']>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  insert: (
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  insertReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    PickEntityFields<TEntity, TFieldNames>,
    TCommandError,
    TCommandOptions
  >;
  insertMany: (
    payloads: Array<Partial<InferEntityRecord<TEntity['fields']>>>,
  ) => BoundGraphCommand<
    TEntity,
    Array<Partial<InferEntityRecord<TEntity['fields']>>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  insertManyReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payloads: Array<Partial<InferEntityRecord<TEntity['fields']>>>,
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    Array<Partial<InferEntityRecord<TEntity['fields']>>>,
    Array<PickEntityFields<TEntity, TFieldNames>>,
    TCommandError,
    TCommandOptions
  >;
  upsert: (
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    options: {
      conflictOn: readonly EntityFieldName<TEntity>[];
      strategy: 'ignore' | 'merge';
    },
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  relatedTo: <TSource extends AnyEntityDefinition, TSourceResult>(
    sourceSelection: RelationRootSourceSelection<
      TSource,
      TSourceResult,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >,
    options: {
      through: keyof TEntity['relations'] & string;
    },
  ) => RelationRootSelection<
    TEntity,
    TSource,
    InferEntityRecord<TEntity['fields']>,
    TSourceResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  pipe: <TValue>(
    fn: (
      entity: BoundSelectionEntityBase<
        TEntity,
        TReadError,
        TReadOptions,
        TCommandError,
        TCommandOptions
      >,
    ) => TValue,
  ) => TValue;
};

type CreateCommand<TError, TOptions> = <
  TEntity extends AnyEntityDefinition,
  TPayload = unknown,
  TResult = void,
>(
  spec: GraphCommandSpec<TEntity, TPayload, TResult>,
) => BoundGraphCommand<TEntity, TPayload, TResult, TError, TOptions>;

type CreateExecutableGraphRead<TError, TOptions> = <
  TRead extends import('./query.js').QueryOrView<any, any>,
>(
  read: TRead,
) => ExecutableGraphRead<TRead, TError, TOptions>;

type BindGraphReadFn<TError, TOptions> = <TRead extends import('./query.js').QueryOrView<any, any>>(
  read: TRead,
) => BoundGraphRead<TRead, TError, TOptions>;

export const createGraphSelectionAssembly = <
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
>({
  createCommand,
  createExecutableGraphRead,
  bindGraphRead,
}: {
  createCommand: CreateCommand<TCommandError, TCommandOptions>;
  createExecutableGraphRead: CreateExecutableGraphRead<TReadError, TReadOptions>;
  bindGraphRead: BindGraphReadFn<TReadError, TReadOptions>;
}) => {
  const namedGraphRead = <TParams, TEntity extends AnyEntityDefinition, TResult>(
    name: string,
    selectionOrEntity: BaseGraphSelection<TEntity, TResult> | TEntity,
    build?: (params: TParams) => BaseGraphSelection<TEntity, any>,
  ): BoundGraphRead<
    ViewDefinition<TParams | undefined, TEntity, TResult>,
    TReadError,
    TReadOptions
  > => {
    if (selectionOrEntity instanceof BaseGraphSelection) {
      const selection = selectionOrEntity;

      return bindGraphRead(
        view<undefined, TEntity, TResult>(name, selection.root, () => selection.build()),
      ) as BoundGraphRead<
        ViewDefinition<TParams | undefined, TEntity, TResult>,
        TReadError,
        TReadOptions
      >;
    }

    const entityDefinition = selectionOrEntity as TEntity;
    if (!build) {
      throw new Error(`namedGraphRead(${name}) requires a selection or a builder function.`);
    }

    return bindGraphRead(
      view<TParams, TEntity, TResult>(name, entityDefinition, ({ params }) =>
        build(params).build(),
      ),
    ) as BoundGraphRead<
      ViewDefinition<TParams | undefined, TEntity, TResult>,
      TReadError,
      TReadOptions
    >;
  };

  let createGraphSelection!: <
    TEntity extends AnyEntityDefinition,
    TResult = InferEntityRecord<TEntity['fields']>,
  >(
    builder: QueryBuilder<TEntity, TResult>,
  ) => BaseGraphSelection<TEntity, TResult>;

  const graphSelectionFactories: GraphSelectionFactories = {
    createSelection: <TEntity extends AnyEntityDefinition, TResult>(
      builder: QueryBuilder<TEntity, TResult>,
    ) => createGraphSelection(builder) as BaseGraphSelection<TEntity, TResult>,
    createCommand: <TEntity extends AnyEntityDefinition, TPayload = unknown, TResult = void>(
      spec: GraphCommandSpec<TEntity, TPayload, TResult>,
    ) => createCommand(spec),
  };

  const runtimeApi = <TEntity extends AnyEntityDefinition, TResult>(
    selection: BaseGraphSelection<TEntity, TResult>,
  ) => ({
    exec: () => createExecutableGraphRead(selection.build()),
    get: (options?: TReadOptions) =>
      createExecutableGraphRead(selection.build()).get(undefined, options),
    run: (options?: TReadOptions) =>
      createExecutableGraphRead(selection.build()).run(undefined, options),
    count: (options?: TReadOptions) =>
      createExecutableGraphRead(selection.build()).count(undefined, options),
    stream: (options?: TReadOptions) =>
      createExecutableGraphRead(selection.build()).stream(undefined, options),
    exists: (options?: TReadOptions) =>
      createExecutableGraphRead(selection.build())
        .get(undefined, options)
        .pipe(Effect.map(row => row != null)),
    named: (name: string) => namedGraphRead(name, selection),
  });

  createGraphSelection = <
    TEntity extends AnyEntityDefinition,
    TResult = InferEntityRecord<TEntity['fields']>,
  >(
    builder: QueryBuilder<TEntity, TResult>,
  ): BaseGraphSelection<TEntity, TResult> => {
    const selection = new BaseGraphSelection(builder, graphSelectionFactories);
    return Object.assign(selection, runtimeApi(selection)) as BaseGraphSelection<TEntity, TResult>;
  };

  const bindSelectionEntity = <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) =>
    Object.assign(entityDefinition, {
      all: () => createGraphSelection(query(entityDefinition)),
      where: (build: QueryWhereArg<TEntity, any>) =>
        createGraphSelection(query(entityDefinition).where(build)),
      insert: (payload: Partial<InferEntityRecord<TEntity['fields']>>) =>
        createCommand(createInsertCommandSpec(entityDefinition, payload)),
      insertReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
        payload: Partial<InferEntityRecord<TEntity['fields']>>,
        fieldNames: TFieldNames,
      ) =>
        createCommand<
          TEntity,
          Partial<InferEntityRecord<TEntity['fields']>>,
          PickEntityFields<TEntity, TFieldNames>
        >(
          createInsertCommandSpec(entityDefinition, payload, {
            returning: fieldNames,
            cardinality: 'one',
          }),
        ),
      insertMany: (payloads: Array<Partial<InferEntityRecord<TEntity['fields']>>>) =>
        createCommand(createInsertManyCommandSpec(entityDefinition, payloads)),
      insertManyReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
        payloads: Array<Partial<InferEntityRecord<TEntity['fields']>>>,
        fieldNames: TFieldNames,
      ) =>
        createCommand<
          TEntity,
          Array<Partial<InferEntityRecord<TEntity['fields']>>>,
          Array<PickEntityFields<TEntity, TFieldNames>>
        >(createInsertManyCommandSpec(entityDefinition, payloads, { returning: fieldNames })),
      upsert: (
        payload: Partial<InferEntityRecord<TEntity['fields']>>,
        options: {
          conflictOn: readonly EntityFieldName<TEntity>[];
          strategy: 'ignore' | 'merge';
        },
      ) => createCommand(createUpsertCommandSpec(entityDefinition, payload, options)),
      relatedTo: <TSource extends AnyEntityDefinition, TSourceResult>(
        sourceSelection: RelationRootSourceSelection<
          TSource,
          TSourceResult,
          TReadError,
          TReadOptions,
          TCommandError,
          TCommandOptions
        >,
        options: {
          through: keyof TEntity['relations'] & string;
        },
      ) =>
        new RelationRootSelection({
          targetEntity: entityDefinition as RelationRootTargetEntity<
            TEntity,
            TReadError,
            TReadOptions,
            TCommandError,
            TCommandOptions
          >,
          sourceSelection,
          relationName: options.through,
          createExecutableGraphRead,
        }),
      pipe: <TValue>(fn: (entity: TEntity) => TValue) => fn(entityDefinition),
    });

  return {
    bindSelectionEntity,
    createGraphSelection,
    namedGraphRead,
  };
};
