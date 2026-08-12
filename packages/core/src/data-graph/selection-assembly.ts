import { Effect } from 'effect';

import { booleanComputation, type BooleanComputation } from '../computation/conditional.js';

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
import { Selection, selection, type SelectionBuilder } from './selection-value.js';
import {
  GraphSelection as BaseGraphSelection,
  createInsertCommandSpec,
  createInsertManyCommandSpec,
  createUpsertCommandSpec,
  createUpsertManyCommandSpec,
  type EntityFieldName,
  type GraphSelectionFactories,
  type QueryIncludeArg,
  type QueryOrderByArg,
  type QuerySelectArg,
  type QueryWhereArg,
  type PickEntityFields,
} from './selection.js';

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

type RelatedToOptions<TTarget extends AnyEntityDefinition, TSource extends AnyEntityDefinition> = {
  through: (keyof TTarget['relations'] | keyof TSource['relations']) & string;
};

type RelationTraversal = {
  relationName: string;
  relationOwner: 'target' | 'source';
};

const resolveRelationTraversal = (
  targetEntity: AnyEntityDefinition,
  sourceEntity: AnyEntityDefinition,
  through?: string,
): RelationTraversal => {
  const candidates: RelationTraversal[] = [
    ...Object.entries(targetEntity.relations)
      .filter(([, relation]) => relation.target.name === sourceEntity.name)
      .map(([relationName]) => ({ relationName, relationOwner: 'target' as const })),
    ...(targetEntity === sourceEntity
      ? []
      : Object.entries(sourceEntity.relations)
          .filter(([, relation]) => relation.target.name === targetEntity.name)
          .map(([relationName]) => ({ relationName, relationOwner: 'source' as const }))),
  ];

  if (through) {
    const candidate = candidates.find(relation => relation.relationName === through);
    if (candidate) {
      return candidate;
    }
    if (through in targetEntity.relations || through in sourceEntity.relations) {
      throw new Error(
        `Relation ${through} does not connect ${targetEntity.name} and ${sourceEntity.name}.`,
      );
    }
    throw new Error(
      `Relation ${through} is not declared by ${targetEntity.name} or ${sourceEntity.name}.`,
    );
  }

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  if (candidates.length === 0) {
    throw new Error(
      `Cannot infer a relation between ${targetEntity.name} and ${sourceEntity.name}: no declared relation connects them.`,
    );
  }

  const candidateNames = candidates
    .map(
      candidate =>
        `${candidate.relationOwner === 'target' ? targetEntity.name : sourceEntity.name}.${candidate.relationName}`,
    )
    .join(', ');
  throw new Error(
    `Cannot infer a unique relation between ${targetEntity.name} and ${sourceEntity.name}: found ${candidateNames}. Pass { through } to disambiguate.`,
  );
};

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
    Simplify<Omit<TResult, keyof TInclude> & InferIncludeShape<TInclude>>,
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
  exists: (options?: TReadOptions) => BooleanComputation<TReadError>;
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

type BoundSelectionCardinality = 'one' | 'many' | undefined;

type BoundSelectionReturningResult<
  TEntity extends AnyEntityDefinition,
  TFieldNames extends readonly EntityFieldName<TEntity>[],
  TCardinality extends BoundSelectionCardinality,
> = TCardinality extends 'one'
  ? PickEntityFields<TEntity, TFieldNames>
  : Array<PickEntityFields<TEntity, TFieldNames>>;

export type BoundSelectionSemanticApi<
  TEntity extends AnyEntityDefinition,
  TCardinality extends BoundSelectionCardinality = undefined,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> = {
  and: (
    operand: Selection<TEntity> | SelectionBuilder<TEntity>,
  ) => BoundSelection<
    TEntity,
    TCardinality,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  or: (
    operand: Selection<TEntity> | SelectionBuilder<TEntity>,
  ) => BoundSelection<
    TEntity,
    TCardinality,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  not: () => BoundSelection<
    TEntity,
    TCardinality,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  named: (
    name: string,
  ) => BoundSelection<
    TEntity,
    TCardinality,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  where: (
    build: QueryWhereArg<TEntity, InferEntityRecord<TEntity['fields']>>,
  ) => BoundGraphSelection<
    TEntity,
    InferEntityRecord<TEntity['fields']>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  select: <TSelection extends SelectionObject>(
    build: (
      root: Parameters<QuerySelectArg<TEntity, InferEntityRecord<TEntity['fields']>>>[0],
    ) => TSelection,
  ) => BoundGraphSelection<
    TEntity,
    InferSelectionShape<TSelection>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  include: <TInclude extends Record<string, AnyRelationQueryBuilder>>(
    build: (
      root: Parameters<QueryIncludeArg<TEntity, InferEntityRecord<TEntity['fields']>>>[0],
    ) => TInclude,
  ) => BoundGraphSelection<
    TEntity,
    Simplify<
      Omit<InferEntityRecord<TEntity['fields']>, keyof TInclude> & InferIncludeShape<TInclude>
    >,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  orderBy: (
    build: QueryOrderByArg<TEntity, InferEntityRecord<TEntity['fields']>>,
  ) => BoundGraphSelection<
    TEntity,
    InferEntityRecord<TEntity['fields']>,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  >;
  limit: (
    limitValue: number,
  ) => BoundGraphSelection<
    TEntity,
    InferEntityRecord<TEntity['fields']>,
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
  updateReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    BoundSelectionReturningResult<TEntity, TFieldNames, TCardinality>,
    TCommandError,
    TCommandOptions
  >;
  delete: () => BoundGraphCommand<TEntity, never, void, TCommandError, TCommandOptions>;
  deleteReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ) => BoundGraphCommand<
    TEntity,
    never,
    BoundSelectionReturningResult<TEntity, TFieldNames, TCardinality>,
    TCommandError,
    TCommandOptions
  >;
  pipe: <TValue>(
    fn: (
      value: BoundSelection<
        TEntity,
        TCardinality,
        TReadError,
        TReadOptions,
        TCommandError,
        TCommandOptions
      >,
    ) => TValue,
  ) => TValue;
};

type BoundSelectionRuntimeApi<TEntity extends AnyEntityDefinition, TReadError, TReadOptions> = Omit<
  BoundGraphSelectionRuntimeApi<
    TEntity,
    InferEntityRecord<TEntity['fields']>,
    TReadError,
    TReadOptions
  >,
  'named'
>;

export type BoundSelection<
  TEntity extends AnyEntityDefinition,
  TCardinality extends BoundSelectionCardinality = undefined,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> = BoundSelectionSemanticApi<
  TEntity,
  TCardinality,
  TReadError,
  TReadOptions,
  TCommandError,
  TCommandOptions
> &
  BoundSelectionRuntimeApi<TEntity, TReadError, TReadOptions> &
  Selection<TEntity, TCardinality>;

export type BoundSelectionEntityBase<
  TEntity extends AnyEntityDefinition,
  TReadError = never,
  TReadOptions = undefined,
  TCommandError = TReadError,
  TCommandOptions = TReadOptions,
> = TEntity & {
  selection: (
    build: SelectionBuilder<TEntity>,
  ) => BoundSelection<TEntity, undefined, TReadError, TReadOptions, TCommandError, TCommandOptions>;
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
  upsertMany: (
    payloads: Array<Partial<InferEntityRecord<TEntity['fields']>>>,
    options: {
      conflictOn: readonly EntityFieldName<TEntity>[];
      strategy: 'ignore' | 'merge';
    },
  ) => BoundGraphCommand<
    TEntity,
    Array<Partial<InferEntityRecord<TEntity['fields']>>>,
    void,
    TCommandError,
    TCommandOptions
  >;
  relatedTo: <
    TSource extends AnyEntityDefinition,
    TSourceResult = InferEntityRecord<TSource['fields']>,
  >(
    sourceSelection: RelationRootSourceSelection<
      TSource,
      TSourceResult,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >,
    options?: RelatedToOptions<TEntity, TSource>,
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
  ) => BoundGraphSelection<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > &
    BaseGraphSelection<TEntity, TResult>;

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
      booleanComputation(
        createExecutableGraphRead(selection.build())
          .get(undefined, options)
          .pipe(Effect.map(row => row != null)),
      ),
    named: (name: string) => namedGraphRead(name, selection),
  });

  createGraphSelection = <
    TEntity extends AnyEntityDefinition,
    TResult = InferEntityRecord<TEntity['fields']>,
  >(
    builder: QueryBuilder<TEntity, TResult>,
  ): BoundGraphSelection<
    TEntity,
    TResult,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > &
    BaseGraphSelection<TEntity, TResult> => {
    const selection = new BaseGraphSelection(builder, graphSelectionFactories);
    return Object.assign(selection, runtimeApi(selection)) as unknown as BoundGraphSelection<
      TEntity,
      TResult,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    > &
      BaseGraphSelection<TEntity, TResult>;
  };

  const createBoundSelection = <
    TEntity extends AnyEntityDefinition,
    TCardinality extends BoundSelectionCardinality = undefined,
  >(
    semanticSelection: Selection<TEntity, TCardinality>,
  ): BoundSelection<
    TEntity,
    TCardinality,
    TReadError,
    TReadOptions,
    TCommandError,
    TCommandOptions
  > => {
    const value = new Selection(
      semanticSelection.root,
      semanticSelection.build(),
      semanticSelection.name,
      semanticSelection.cardinality,
    );
    const and = value.and.bind(value);
    const or = value.or.bind(value);
    const not = value.not.bind(value);
    const named = value.named.bind(value);
    const update = value.update.bind(value);
    const updateReturning = value.updateReturning.bind(value);
    const deleteSelection = value.delete.bind(value);
    const deleteReturning = value.deleteReturning.bind(value);
    const asGraphSelection = () => createGraphSelection(value.toQuery());

    return Object.assign(value, {
      and: (operand: Selection<TEntity> | SelectionBuilder<TEntity>) =>
        createBoundSelection(and(operand)),
      or: (operand: Selection<TEntity> | SelectionBuilder<TEntity>) =>
        createBoundSelection(or(operand)),
      not: () => createBoundSelection(not()),
      named: (name: string) => createBoundSelection(named(name)),
      where: (build: QueryWhereArg<TEntity, InferEntityRecord<TEntity['fields']>>) =>
        asGraphSelection().where(build),
      select: (build: QuerySelectArg<TEntity, InferEntityRecord<TEntity['fields']>>) =>
        asGraphSelection().select(build),
      include: (build: QueryIncludeArg<TEntity, InferEntityRecord<TEntity['fields']>>) =>
        asGraphSelection().include(build),
      orderBy: (build: QueryOrderByArg<TEntity, InferEntityRecord<TEntity['fields']>>) =>
        asGraphSelection().orderBy(build),
      limit: (limitValue: number) => asGraphSelection().limit(limitValue),
      update: (payload: Partial<InferEntityRecord<TEntity['fields']>>) =>
        createCommand(update(payload).build()),
      updateReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
        payload: Partial<InferEntityRecord<TEntity['fields']>>,
        fieldNames: TFieldNames,
      ) => createCommand(updateReturning(payload, fieldNames).build()),
      delete: () => createCommand(deleteSelection().build()),
      deleteReturning: <TFieldNames extends readonly EntityFieldName<TEntity>[]>(
        fieldNames: TFieldNames,
      ) => createCommand(deleteReturning(fieldNames).build()),
      exec: () => asGraphSelection().exec(),
      get: (options?: TReadOptions) => asGraphSelection().get(options),
      run: (options?: TReadOptions) => asGraphSelection().run(options),
      count: (options?: TReadOptions) => asGraphSelection().count(options),
      stream: (options?: TReadOptions) => asGraphSelection().stream(options),
      exists: (options?: TReadOptions) => asGraphSelection().exists(options),
    }) as unknown as BoundSelection<
      TEntity,
      TCardinality,
      TReadError,
      TReadOptions,
      TCommandError,
      TCommandOptions
    >;
  };

  const bindSelectionEntity = <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) =>
    Object.assign(entityDefinition, {
      selection: (build: SelectionBuilder<TEntity>) =>
        createBoundSelection(selection(entityDefinition, build)),
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
      upsertMany: (
        payloads: Array<Partial<InferEntityRecord<TEntity['fields']>>>,
        options: {
          conflictOn: readonly EntityFieldName<TEntity>[];
          strategy: 'ignore' | 'merge';
        },
      ) => createCommand(createUpsertManyCommandSpec(entityDefinition, payloads, options)),
      relatedTo: <
        TSource extends AnyEntityDefinition,
        TSourceResult = InferEntityRecord<TSource['fields']>,
      >(
        sourceSelection: RelationRootSourceSelection<
          TSource,
          TSourceResult,
          TReadError,
          TReadOptions,
          TCommandError,
          TCommandOptions
        >,
        options?: RelatedToOptions<TEntity, TSource>,
      ) => {
        const sourceEntity =
          'root' in sourceSelection ? sourceSelection.root : sourceSelection.entity;
        const { relationName, relationOwner } = resolveRelationTraversal(
          entityDefinition,
          sourceEntity,
          options?.through,
        );
        return new RelationRootSelection({
          targetEntity: entityDefinition as RelationRootTargetEntity<
            TEntity,
            TReadError,
            TReadOptions,
            TCommandError,
            TCommandOptions
          >,
          sourceSelection,
          relationName,
          relationOwner,
          createExecutableGraphRead,
        });
      },
      pipe: <TValue>(fn: (entity: TEntity) => TValue) => fn(entityDefinition),
    });

  return {
    bindSelection: createBoundSelection,
    bindSelectionEntity,
    createGraphSelection,
    namedGraphRead,
  };
};
