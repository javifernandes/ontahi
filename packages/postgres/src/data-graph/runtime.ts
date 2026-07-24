import {
  RelationQueryBuilder,
  isRelatedRootReadSpec,
  resolveQuerySpec,
  resolveRelatedRootFields,
  resolveRelationFields,
  selectionAnd,
  type AnyEntityDefinition,
  type AnyRelationQueryBuilder,
  type DataGraphExecutionRuntime,
  type GraphCommandSpec,
  type PlainGraphRead,
  type QueryOrView,
  type QuerySpec,
  type RelatedRootReadSpec,
  type SelectionValue,
} from '@ontahi/core/data-graph';
import { Effect, Stream } from 'effect';
import type { Pool, QueryResultRow } from 'pg';

import { createPostgresMappingRegistry, type PostgresEntityMapping } from './mapping.js';
import { compilePostgresCommand, compilePostgresQuery } from './sql.js';

export type PostgresDataGraphErrorReason =
  | 'execution_failed'
  | 'invalid_command'
  | 'cardinality_mismatch';

export class PostgresDataGraphError extends Error {
  readonly _tag = 'PostgresDataGraphError';

  constructor(
    message: string,
    readonly reason: PostgresDataGraphErrorReason = 'execution_failed',
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

const mappingFor = (
  registry: Map<AnyEntityDefinition, PostgresEntityMapping>,
  entity: AnyEntityDefinition,
) => {
  const mapping = registry.get(entity);
  if (!mapping) throw new Error(`Missing PostgreSQL mapping for ${entity.name}.`);
  return mapping;
};

const invalidCommandCause = (cause: unknown) =>
  cause instanceof Error &&
  (cause.message.startsWith('PostgreSQL upsert') || cause.message.startsWith('PostgreSQL insert'));

export const createPostgresDataGraphRuntime = (input: {
  pool: Pick<Pool, 'query'>;
  mappings: readonly PostgresEntityMapping[];
}): DataGraphExecutionRuntime<
  PostgresDataGraphError,
  undefined,
  undefined,
  PostgresDataGraphError
> => {
  const registry = createPostgresMappingRegistry(input.mappings);
  const executeQuery = <TRow extends QueryResultRow>(sql: { text: string; values: unknown[] }) =>
    input.pool.query<TRow>(sql.text, sql.values);

  const loadRelation = async (
    row: Record<string, unknown>,
    sourceEntity: AnyEntityDefinition,
    relation: AnyRelationQueryBuilder,
  ) => {
    const node = relation.toNodeSpec();
    const fields = resolveRelationFields(sourceEntity, node.relationName, node);
    const related = await readSpec({
      kind: 'query',
      root: node.entity,
      selection: {
        kind: 'predicate',
        operator: 'eq',
        fieldName: fields.targetField,
        value: row[fields.sourceField],
      },
      select: node.select,
      includes: node.includes,
      orderBy: [...node.orderBy],
      limit: node.limit,
    });
    return node.relationKind === 'belongsTo' ? (related[0] ?? null) : related;
  };

  const materializeSelection = async (
    row: Record<string, unknown>,
    entity: AnyEntityDefinition,
    selection: Record<string, SelectionValue>,
  ): Promise<Record<string, unknown>> =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(selection).map(async ([key, value]) => {
          if ((value as { kind?: string }).kind === 'field-ref') {
            return [key, row[(value as { fieldName: string }).fieldName]];
          }
          if (value instanceof RelationQueryBuilder) {
            return [key, await loadRelation(row, entity, value)];
          }
          return [
            key,
            await materializeSelection(row, entity, value as Record<string, SelectionValue>),
          ];
        }),
      ),
    );

  const materializeRow = async (
    row: Record<string, unknown>,
    spec: QuerySpec,
  ): Promise<Record<string, unknown>> => {
    const materialized = spec.select
      ? await materializeSelection(row, spec.root, spec.select)
      : Object.fromEntries(Object.keys(spec.root.fields).map(field => [field, row[field]]));

    for (const [name, relation] of Object.entries(spec.includes ?? {})) {
      materialized[name] = await loadRelation(row, spec.root, relation);
    }
    return materialized;
  };

  const readSpec = async (
    spec: QuerySpec,
    options: { entityRows?: boolean; applyLimit?: boolean } = {},
  ): Promise<Record<string, unknown>[]> => {
    const effectiveSpec =
      options.applyLimit === false
        ? {
            ...spec,
            limit: undefined,
          }
        : spec;
    const result = await executeQuery<Record<string, unknown> & QueryResultRow>(
      compilePostgresQuery(effectiveSpec, undefined, mappingFor(registry, spec.root)),
    );
    if (spec.cardinality === 'one' && result.rows.length !== 1) {
      throw new PostgresDataGraphError(
        `Expected exactly one ${spec.root.name}, received ${result.rows.length}.`,
        'cardinality_mismatch',
      );
    }
    return options.entityRows
      ? result.rows
      : Promise.all(result.rows.map(row => materializeRow(row, spec)));
  };

  const uniqueNonNullValues = (rows: Record<string, unknown>[], field: string) => [
    ...new Set(rows.map(row => row[field]).filter(value => value != null)),
  ];

  const withRelatedTargetPredicate = (
    spec: RelatedRootReadSpec,
    targetField: string,
    sourceValues: readonly unknown[],
  ): QuerySpec => ({
    ...spec.target,
    selection: selectionAnd(spec.target.selection, {
      kind: 'predicate',
      operator: 'in',
      fieldName: targetField,
      values: sourceValues,
    }),
  });

  const executeEntityRows = async (
    read: QueryOrView<any, any>,
  ): Promise<Record<string, unknown>[]> =>
    isRelatedRootReadSpec(read)
      ? executeRelatedRootRead({ ...read, mode: 'entityRows' })
      : readSpec(resolveQuerySpec(read as PlainGraphRead<any, any>, undefined), {
          entityRows: true,
        });

  const executeRelatedRootRead = async (
    spec: RelatedRootReadSpec<any, any, any, any, any>,
  ): Promise<any[]> => {
    const { sourceField, targetField } = resolveRelatedRootFields(
      spec.target.root,
      spec.sourceEntity,
      spec.relationName,
    );
    const sourceEntityRows = await executeEntityRows(spec.source);
    const sourceRows =
      spec.mode === 'resolve' || spec.mode === 'countBySource'
        ? await executeRead(spec.source, undefined)
        : sourceEntityRows;
    const sourceValues = uniqueNonNullValues(sourceEntityRows, sourceField);

    if (sourceValues.length === 0) {
      if (spec.mode === 'resolve') return [{ sourceRows, rows: [] }];
      if (spec.mode === 'countBySource') {
        return [{ sourceRows, countsBySource: new Map<unknown, number>() }];
      }
      return [];
    }

    const targetSpec = withRelatedTargetPredicate(spec, targetField, sourceValues);
    const entityRows = await readSpec(targetSpec, { entityRows: true });
    if (spec.mode === 'entityRows') return entityRows;
    if (spec.mode === 'countBySource') {
      const countsBySource = new Map<unknown, number>(sourceValues.map(value => [value, 0]));
      for (const row of entityRows) {
        const value = row[targetField];
        if (value != null) countsBySource.set(value, (countsBySource.get(value) ?? 0) + 1);
      }
      return [{ sourceRows, countsBySource }];
    }

    const rows = await readSpec(targetSpec);
    return spec.mode === 'resolve' ? [{ sourceRows, rows }] : rows;
  };

  const executeRead = <TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
  ): Promise<TResult[]> =>
    isRelatedRootReadSpec(queryOrView)
      ? executeRelatedRootRead(queryOrView)
      : readSpec(resolveQuerySpec(queryOrView as PlainGraphRead<TParams, TResult>, params)).then(
          rows => rows as TResult[],
        );

  const run = <TParams, TResult>(queryOrView: QueryOrView<TParams, TResult>, params: TParams) =>
    Effect.tryPromise({
      try: () => executeRead(queryOrView, params),
      catch: cause =>
        cause instanceof PostgresDataGraphError
          ? cause
          : new PostgresDataGraphError(
              'PostgreSQL data graph execution failed.',
              'execution_failed',
              cause,
            ),
    }).pipe(Effect.map(rows => rows as TResult[]));

  return {
    get: (queryOrView, params) =>
      run(queryOrView, params).pipe(Effect.map(rows => rows[0] ?? null)),
    run,
    stream: (queryOrView, params) =>
      Stream.fromEffect(run(queryOrView, params)).pipe(Stream.flatMap(Stream.fromIterable)),
    count: (queryOrView, params) => {
      if (isRelatedRootReadSpec(queryOrView)) {
        return Effect.tryPromise({
          try: async () => {
            const { sourceField, targetField } = resolveRelatedRootFields(
              queryOrView.target.root,
              queryOrView.sourceEntity,
              queryOrView.relationName,
            );
            const sourceValues = uniqueNonNullValues(
              await executeEntityRows(queryOrView.source),
              sourceField,
            );
            if (sourceValues.length === 0) return 0;
            return (
              await readSpec(withRelatedTargetPredicate(queryOrView, targetField, sourceValues), {
                entityRows: true,
                applyLimit: false,
              })
            ).length;
          },
          catch: cause =>
            cause instanceof PostgresDataGraphError
              ? cause
              : new PostgresDataGraphError(
                  'PostgreSQL related-root count failed.',
                  'execution_failed',
                  cause,
                ),
        });
      }
      const spec = resolveQuerySpec(queryOrView, params);
      return Effect.tryPromise({
        try: () =>
          executeQuery<{ count: number }>(
            compilePostgresQuery(queryOrView, params, mappingFor(registry, spec.root), {
              count: true,
            }),
          ),
        catch: cause =>
          new PostgresDataGraphError(
            'PostgreSQL data graph count failed.',
            'execution_failed',
            cause,
          ),
      }).pipe(Effect.map(result => result.rows[0]?.count ?? 0));
    },
    runCommand: <TResult>(command: GraphCommandSpec<any, any, TResult>) =>
      Effect.tryPromise({
        try: () =>
          executeQuery<QueryResultRow>(
            compilePostgresCommand(command, mappingFor(registry, command.root)),
          ),
        catch: cause =>
          new PostgresDataGraphError(
            'PostgreSQL data graph command failed.',
            invalidCommandCause(cause) ? 'invalid_command' : 'execution_failed',
            cause,
          ),
      }).pipe(
        Effect.flatMap(result =>
          command.cardinality === 'one' && result.rowCount !== 1
            ? Effect.fail(
                new PostgresDataGraphError(
                  `Expected exactly one affected row, got ${result.rowCount ?? 0}.`,
                  'cardinality_mismatch',
                ),
              )
            : Effect.succeed(
                (command.returning
                  ? command.cardinality === 'one'
                    ? result.rows[0]
                    : result.rows
                  : undefined) as TResult,
              ),
        ),
      ),
  };
};
