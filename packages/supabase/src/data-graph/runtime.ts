import {
  compileResolvedQueryPlan,
  createRelatedRootReadSpec,
  getPublicSourceFieldAccessor,
  isRelatedRootReadSpec,
  materializeFlatSelection,
  resolveQuerySpec,
  resolveRelatedRootFields,
  selectionUsesRelationBuilders,
  stripQueryShape,
  type AnyEntityDefinition,
  type DataGraphExecutionRuntime,
  type GraphCommandSpec,
  type PlainGraphRead,
  type QueryOrView,
  type QuerySpec,
  type RelatedRootReadMode,
  type RelatedRootReadSpec,
} from '@ontahi/core/data-graph';
import { Effect, Stream } from 'effect';

import { executeSupabaseGraphCommandEffect } from './command.js';
import { materializeSupabaseEntityRow } from './materialization.js';
import { fetchSupabaseEntityRowsEffect, hydrateSupabaseEntityRowsEffect } from './query.js';
import type {
  FetchEntityRowsInput,
  SupabaseErrorFactory,
  SupabaseLikeClient,
  SupabaseReadDeps,
} from './types.js';

import { applySupabasePredicates, hasEmptySupabaseInPredicate } from './index.js';

export const executeSupabaseGraphQueryEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object = {},
  TParams = unknown,
  TResult = unknown,
>(
  deps: {
    getClient: (options?: TReadOptions) => Effect.Effect<TClient, TError>;
    createError: SupabaseErrorFactory<TError>;
  },
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  options?: TReadOptions,
): Effect.Effect<TResult[], TError> =>
  Effect.gen(function* () {
    if (isRelatedRootReadSpec(queryOrView)) {
      return yield* executeSupabaseRelatedRootRunEffect(
        deps,
        queryOrView as RelatedRootReadSpec<any, any, TResult, any, any>,
        options,
      );
    }

    const spec = resolveQuerySpec(queryOrView as PlainGraphRead<TParams, TResult>, params);
    const plan = compileResolvedQueryPlan(spec);
    const supabase = yield* deps.getClient(options);

    const rootRows = yield* fetchSupabaseEntityRowsEffect({
      supabase,
      entityDefinition: spec.root,
      predicates: spec.where as FetchEntityRowsInput<TClient>['predicates'],
      orderBy: spec.orderBy,
      limit: spec.limit,
      selectShape: spec.select,
      includeShape: spec.includes,
      tableName: plan.rootTable,
      compiledWhere: plan.where,
      compiledOrderBy: plan.orderBy,
      message: `Failed to load ${spec.root.name} records`,
      createError: deps.createError,
    });

    const hydratedRows = yield* hydrateSupabaseEntityRowsEffect({
      supabase,
      rows: rootRows,
      includeShape: spec.includes,
      includePlans: plan.includes,
      fetchEntityRowsEffect: nestedInput => fetchSupabaseEntityRowsEffect(nestedInput),
      createError: deps.createError,
    });

    return hydratedRows.map(row =>
      materializeSupabaseEntityRow(row, spec.root, spec.select, spec.includes),
    ) as TResult[];
  });

export const executeSupabaseGraphCountEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object = {},
  TParams = unknown,
  TResult = unknown,
>(
  deps: {
    getClient: (options?: TReadOptions) => Effect.Effect<TClient, TError>;
    createError: SupabaseErrorFactory<TError>;
  },
  queryOrView: QueryOrView<TParams, TResult>,
  params: TParams,
  options?: TReadOptions,
): Effect.Effect<number, TError> =>
  Effect.gen(function* () {
    if (isRelatedRootReadSpec(queryOrView)) {
      return yield* executeSupabaseRelatedRootCountEffect(deps, queryOrView, options);
    }

    const spec = resolveQuerySpec(queryOrView as PlainGraphRead<TParams, TResult>, params);
    const plan = compileResolvedQueryPlan(spec);
    const predicates = plan.where.length > 0 ? plan.where : spec.where;

    if (hasEmptySupabaseInPredicate(predicates)) {
      return 0;
    }

    const supabase = yield* deps.getClient(options);

    return yield* Effect.tryPromise({
      try: async () => {
        let query = supabase.from(plan.rootTable).select('*', { count: 'exact', head: true });
        query = applySupabasePredicates(spec.root, query, predicates);

        const result = await query;
        if (result.error) {
          throw result.error.message;
        }

        return result.count ?? 0;
      },
      catch: cause =>
        deps.createError({
          message: `Failed to count ${spec.root.name} records`,
          logMessage: `Data graph count query failed for ${spec.root.name}`,
          cause,
        }),
    });
  });

const resolvePlainSourceSpec = <TParams, TResult>(
  read: PlainGraphRead<TParams, TResult>,
  params: TParams,
) => resolveQuerySpec(read, params);

const resolveRelatedRootEntityRowsEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
>(
  deps: SupabaseReadDeps<TClient, TError, TReadOptions>,
  spec: QueryOrView<any, any>,
  options?: TReadOptions,
): Effect.Effect<Array<Record<string, unknown>>, TError> => {
  if (isRelatedRootReadSpec(spec)) {
    return executeSupabaseGraphQueryEffect(
      deps,
      createRelatedRootReadSpec({
        ...spec,
        mode: 'entityRows',
      }),
      undefined,
      options,
    ) as Effect.Effect<Array<Record<string, unknown>>, TError>;
  }

  const querySpec = stripQueryShape(
    resolvePlainSourceSpec(spec as PlainGraphRead<any, any>, undefined),
  );

  return executeSupabaseGraphQueryEffect(deps, querySpec, undefined, options) as Effect.Effect<
    Array<Record<string, unknown>>,
    TError
  >;
};

const resolveRelatedRootPublicSourceRowsEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
>(
  deps: SupabaseReadDeps<TClient, TError, TReadOptions>,
  source: QueryOrView<any, any>,
  sourceEntityRows: Array<Record<string, unknown>>,
  options?: TReadOptions,
): Effect.Effect<unknown[], TError> => {
  if (isRelatedRootReadSpec(source)) {
    return executeSupabaseGraphQueryEffect(deps, source, undefined, options) as Effect.Effect<
      unknown[],
      TError
    >;
  }

  const spec = resolvePlainSourceSpec(source as PlainGraphRead<any, any>, undefined);

  if (!spec.select && !spec.includes) {
    return Effect.succeed(sourceEntityRows);
  }

  if (spec.select && !spec.includes && !selectionUsesRelationBuilders(spec.select)) {
    return Effect.succeed(sourceEntityRows.map(row => materializeFlatSelection(row, spec.select!)));
  }

  return executeSupabaseGraphQueryEffect(deps, spec, undefined, options) as Effect.Effect<
    unknown[],
    TError
  >;
};

const resolveRelatedRootPublicSourceValuesEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
>(
  deps: SupabaseReadDeps<TClient, TError, TReadOptions>,
  source: QueryOrView<any, any>,
  sourceField: string,
  options?: TReadOptions,
): Effect.Effect<
  {
    sourceRows: unknown[];
    sourceValues: unknown[];
  } | null,
  TError
> => {
  if (isRelatedRootReadSpec(source)) {
    return Effect.succeed(null);
  }

  const spec = resolvePlainSourceSpec(source as PlainGraphRead<any, any>, undefined);
  const accessor = getPublicSourceFieldAccessor(spec, sourceField);

  if (!accessor) {
    return Effect.succeed(null);
  }

  return executeSupabaseGraphQueryEffect(deps, spec, undefined, options).pipe(
    Effect.map(sourceRows => ({
      sourceRows,
      sourceValues: [
        ...new Set(
          (sourceRows as Array<Record<string, unknown>>)
            .map(row => accessor(row))
            .filter(value => value != null),
        ),
      ],
    })),
  );
};

const resolveRelatedRootSourceValues = (
  sourceRows: Array<Record<string, unknown>>,
  sourceField: string,
) => [...new Set(sourceRows.map(row => row[sourceField]).filter(value => value != null))];

const buildRelatedRootTargetSpec = <TTarget extends AnyEntityDefinition>(
  spec: RelatedRootReadSpec<TTarget, any, any, any, any>,
  sourceValues: readonly unknown[],
  options?: {
    stripShape?: boolean;
  },
): QuerySpec<TTarget, any> => {
  const { targetField } = resolveRelatedRootFields(
    spec.target.root,
    spec.sourceEntity,
    spec.relationName,
  );

  return {
    ...(options?.stripShape ? stripQueryShape(spec.target) : spec.target),
    where: [
      ...spec.target.where,
      {
        kind: 'predicate',
        operator: 'in',
        fieldName: targetField,
        values: sourceValues,
      },
    ],
  };
};

type RelatedRootSourceContext = {
  sourceRows: unknown[];
  sourceEntityRows: Array<Record<string, unknown>>;
  sourceValues: unknown[];
  hasPublicSourceValues: boolean;
};

const shouldResolvePublicSourceRows = (mode: RelatedRootReadMode) =>
  mode === 'resolve' || mode === 'countBySource';

const resolveRelatedRootSourceContextEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
  TResult,
>(
  deps: SupabaseReadDeps<TClient, TError, TReadOptions>,
  spec: RelatedRootReadSpec<any, any, TResult, any, any>,
  sourceField: string,
  options?: TReadOptions,
): Effect.Effect<RelatedRootSourceContext, TError> =>
  Effect.gen(function* () {
    const publicSourceValues = yield* resolveRelatedRootPublicSourceValuesEffect(
      deps,
      spec.source,
      sourceField,
      options,
    );

    if (publicSourceValues) {
      return {
        sourceRows: publicSourceValues.sourceRows,
        sourceEntityRows: [],
        sourceValues: publicSourceValues.sourceValues,
        hasPublicSourceValues: true,
      };
    }

    const sourceEntityRows = yield* resolveRelatedRootEntityRowsEffect(deps, spec.source, options);
    const sourceRows = shouldResolvePublicSourceRows(spec.mode)
      ? yield* resolveRelatedRootPublicSourceRowsEffect(
          deps,
          spec.source,
          sourceEntityRows,
          options,
        )
      : sourceEntityRows;

    return {
      sourceRows,
      sourceEntityRows,
      sourceValues: resolveRelatedRootSourceValues(sourceEntityRows, sourceField),
      hasPublicSourceValues: false,
    };
  });

const emptyRelatedRootResult = <TResult>(
  spec: RelatedRootReadSpec<any, any, TResult, any, any>,
  sourceRows: unknown[],
) => {
  if (spec.mode === 'resolve') {
    return [{ sourceRows, rows: [] }] as TResult[];
  }

  if (spec.mode === 'countBySource') {
    return [{ sourceRows, countsBySource: new Map<unknown, number>() }] as TResult[];
  }

  return [] as TResult[];
};

const countRowsBySource = (
  sourceValues: readonly unknown[],
  rows: Array<Record<string, unknown>>,
  targetField: string,
) => {
  const countsBySource = new Map<unknown, number>();
  for (const key of sourceValues) {
    if (!countsBySource.has(key)) countsBySource.set(key, 0);
  }

  for (const row of rows) {
    const key = row[targetField];
    if (key != null) {
      countsBySource.set(key, (countsBySource.get(key) ?? 0) + 1);
    }
  }

  return countsBySource;
};

const materializeRelatedRootResult = <TResult>(
  spec: RelatedRootReadSpec<any, any, TResult, any, any>,
  sourceRows: unknown[],
  sourceValues: readonly unknown[],
  rows: TResult[],
  targetField: string,
) => {
  if (spec.mode === 'resolve') {
    return [{ sourceRows, rows }] as TResult[];
  }

  if (spec.mode === 'countBySource') {
    return [
      {
        sourceRows,
        countsBySource: countRowsBySource(
          sourceValues,
          rows as Array<Record<string, unknown>>,
          targetField,
        ),
      },
    ] as TResult[];
  }

  return rows;
};

const executeSupabaseRelatedRootRunEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
  TResult,
>(
  deps: SupabaseReadDeps<TClient, TError, TReadOptions>,
  spec: RelatedRootReadSpec<any, any, TResult, any, any>,
  options?: TReadOptions,
): Effect.Effect<TResult[], TError> =>
  Effect.gen(function* () {
    const { sourceField, targetField } = resolveRelatedRootFields(
      spec.target.root,
      spec.sourceEntity,
      spec.relationName,
    );
    const sourceContext = yield* resolveRelatedRootSourceContextEffect(
      deps,
      spec,
      sourceField,
      options,
    );

    if (!sourceContext.hasPublicSourceValues && sourceContext.sourceEntityRows.length === 0) {
      return emptyRelatedRootResult(spec, sourceContext.sourceRows);
    }

    if (sourceContext.sourceValues.length === 0) {
      return emptyRelatedRootResult(spec, sourceContext.sourceRows);
    }

    const targetSpec = buildRelatedRootTargetSpec(spec, sourceContext.sourceValues, {
      stripShape: spec.mode === 'entityRows' || spec.mode === 'countBySource',
    });
    const rows = yield* executeSupabaseGraphQueryEffect(deps, targetSpec, undefined, options);

    return materializeRelatedRootResult(
      spec,
      sourceContext.sourceRows,
      sourceContext.sourceValues,
      rows,
      targetField,
    );
  });

const executeSupabaseRelatedRootCountEffect = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object,
>(
  deps: SupabaseReadDeps<TClient, TError, TReadOptions>,
  spec: RelatedRootReadSpec,
  options?: TReadOptions,
): Effect.Effect<number, TError> =>
  Effect.gen(function* () {
    const { sourceField } = resolveRelatedRootFields(
      spec.target.root,
      spec.sourceEntity,
      spec.relationName,
    );
    const sourceEntityRows = yield* resolveRelatedRootEntityRowsEffect(deps, spec.source, options);

    if (sourceEntityRows.length === 0) {
      return 0;
    }

    const sourceValues = resolveRelatedRootSourceValues(sourceEntityRows, sourceField);
    if (sourceValues.length === 0) {
      return 0;
    }

    return yield* executeSupabaseGraphCountEffect(
      deps,
      buildRelatedRootTargetSpec(spec, sourceValues, { stripShape: true }),
      undefined,
      options,
    );
  });

export const createSupabaseDataGraphRuntime = <
  TClient extends SupabaseLikeClient,
  TError,
  TReadOptions extends object = {},
  TCommandOptions extends object = TReadOptions,
>(deps: {
  getReadClient: (options?: TReadOptions) => Effect.Effect<TClient, TError>;
  getCommandClient: (options?: TCommandOptions) => Effect.Effect<TClient, TError>;
  createError: SupabaseErrorFactory<TError>;
}): DataGraphExecutionRuntime<TError, TReadOptions, TCommandOptions> => ({
  get: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) =>
    executeSupabaseGraphQueryEffect(
      {
        getClient: deps.getReadClient,
        createError: deps.createError,
      },
      queryOrView,
      params,
      options,
    ).pipe(Effect.map(rows => rows[0] ?? null)),
  run: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) =>
    executeSupabaseGraphQueryEffect(
      {
        getClient: deps.getReadClient,
        createError: deps.createError,
      },
      queryOrView,
      params,
      options,
    ),
  stream: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) => {
    if (isRelatedRootReadSpec(queryOrView)) {
      return Stream.fail(
        deps.createError({
          message: 'Relation-root graph streams are not supported',
          logMessage: 'Relation-root graph stream attempted',
          cause: 'unsupported_related_root_stream',
        }),
      );
    }

    return Stream.unwrap(
      executeSupabaseGraphQueryEffect(
        {
          getClient: deps.getReadClient,
          createError: deps.createError,
        },
        queryOrView,
        params,
        options,
      ).pipe(Effect.map(rows => Stream.fromIterable(rows))),
    );
  },
  count: <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ) =>
    executeSupabaseGraphCountEffect(
      {
        getClient: deps.getReadClient,
        createError: deps.createError,
      },
      queryOrView,
      params,
      options,
    ),
  runCommand: <TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TCommandOptions,
  ) =>
    executeSupabaseGraphCommandEffect(
      {
        getClient: deps.getCommandClient,
        createError: deps.createError,
      },
      command,
      options,
    ),
});
