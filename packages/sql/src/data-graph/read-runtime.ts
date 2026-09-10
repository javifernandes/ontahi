import {
  RelationQueryBuilder,
  isRelatedRootReadSpec,
  getEntityReferenceField,
  liftEntityReferenceFieldValues,
  liftEntityReferenceRecord,
  liftEntityReferenceValue,
  normalizeEntityReferenceJoinValue,
  resolveQuerySpec,
  resolveRelatedRootFields,
  resolveRelationFields,
  selectionAnd,
  type AnyEntityDefinition,
  type AnyRelationQueryBuilder,
  type DataGraphExecutionRuntime,
  type PlainGraphRead,
  type QueryOrView,
  type QuerySpec,
  type RelatedRootReadSpec,
  type SelectionValue,
} from '@ontahi/core/data-graph';
import { Effect, Stream } from 'effect';

import type { SqlDialect } from './dialect.js';
import { createSqlMappingRegistry, type SqlEntityMapping } from './mapping.js';
import { createSqlQueryCompiler, type ParameterizedSql } from './query.js';

export const createSqlReadRuntime = <TError extends Error>(input: {
  mappings: readonly SqlEntityMapping[];
  dialect: SqlDialect;
  normalizeRow?: (
    entity: AnyEntityDefinition,
    row: Record<string, unknown>,
  ) => Record<string, unknown>;
  executeQuery: <TRow extends Record<string, unknown>>(
    sql: ParameterizedSql,
  ) => Promise<{ rows: TRow[] }>;
  Error: new (
    message: string,
    reason: 'execution_failed' | 'cardinality_mismatch',
    cause?: unknown,
  ) => TError;
}): Pick<DataGraphExecutionRuntime<TError>, 'get' | 'run' | 'stream' | 'count'> => {
  const { dialect, executeQuery } = input;
  const compiler = createSqlQueryCompiler(dialect);
  const registry = createSqlMappingRegistry(input.mappings);
  const mappingFor = (
    mappings: Map<AnyEntityDefinition, SqlEntityMapping>,
    entity: AnyEntityDefinition,
  ) => {
    const mapping = mappings.get(entity);
    if (!mapping) throw new Error(`Missing SQL mapping for ${entity.name}.`);
    return mapping;
  };
  const loadRelation = async (
    row: Record<string, unknown>,
    sourceEntity: AnyEntityDefinition,
    relation: AnyRelationQueryBuilder,
  ) => {
    const node = relation.toNodeSpec();
    const definition = sourceEntity.relations[node.relationName];
    if (definition?.relationKind === 'manyToMany') {
      if (definition.mapping?.type !== 'many-to-many') {
        throw new Error(
          `SQL many-to-many Relation ${sourceEntity.name}.${node.relationName} is not mapped.`,
        );
      }
      const sourceMapping = mappingFor(registry, sourceEntity);
      const targetMapping = mappingFor(registry, node.entity);
      const sourceField = Object.entries(sourceMapping.columns).find(
        ([, column]) => column === definition.mapping!.fromColumn,
      )?.[0];
      const targetField = Object.entries(targetMapping.columns).find(
        ([, column]) => column === definition.mapping!.toColumn,
      )?.[0];
      if (!sourceField || !targetField) {
        throw new Error(
          `SQL many-to-many Relation ${sourceEntity.name}.${node.relationName} does not match Entity mappings.`,
        );
      }
      const edgeResult = await executeQuery<{ target_value: unknown } & Record<string, unknown>>({
        text:
          `SELECT ${dialect.quoteIdentifier(definition.mapping.throughToColumn)} AS target_value ` +
          `FROM ${dialect.quoteIdentifier(definition.mapping.throughTable)} ` +
          `WHERE ${dialect.quoteIdentifier(definition.mapping.throughFromColumn)} = ${dialect.placeholder(1)}`,
        values: [row[sourceField]],
      });
      if (edgeResult.rows.length === 0) return [];
      return readSpec({
        kind: 'query',
        root: node.entity,
        selection: {
          kind: 'predicate',
          operator: 'in',
          fieldName: targetField,
          values: edgeResult.rows.map(edge => edge.target_value),
        },
        select: node.select,
        includes: node.includes,
        orderBy: [...node.orderBy],
        limit: node.limit,
      });
    }
    const fields = resolveRelationFields(sourceEntity, node.relationName, node);
    const targetReferenceField = getEntityReferenceField(node.entity, fields.targetField);
    const targetValue = targetReferenceField
      ? liftEntityReferenceValue(targetReferenceField, row[fields.sourceField])
      : row[fields.sourceField];
    const related = await readSpec(
      {
        kind: 'query',
        root: node.entity,
        selection: {
          kind: 'predicate',
          operator: 'eq',
          fieldName: fields.targetField,
          value: targetValue,
        },
        select: node.select,
        includes: node.includes,
        orderBy: [...node.orderBy],
        limit: node.limit,
      },
      {
        physicalOrderBy:
          definition?.ordered &&
          node.orderBy.length === 0 &&
          definition.mapping?.type === 'one-to-many'
            ? [definition.mapping.orderColumn!]
            : undefined,
      },
    );
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
            const fieldName = (value as { fieldName: string }).fieldName;
            const referenceField = getEntityReferenceField(entity, fieldName);
            return [
              key,
              referenceField
                ? liftEntityReferenceValue(referenceField, row[fieldName])
                : row[fieldName],
            ];
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
      : liftEntityReferenceRecord(
          spec.root,
          Object.fromEntries(Object.keys(spec.root.fields).map(field => [field, row[field]])),
        );

    for (const [name, relation] of Object.entries(spec.includes ?? {})) {
      materialized[name] = await loadRelation(row, spec.root, relation);
    }
    return materialized;
  };

  const readSpec = async (
    spec: QuerySpec,
    options: {
      entityRows?: boolean;
      applyLimit?: boolean;
      projectedFields?: readonly string[];
      physicalOrderBy?: readonly string[];
    } = {},
  ): Promise<Record<string, unknown>[]> => {
    const effectiveSpec =
      options.applyLimit === false
        ? {
            ...spec,
            limit: undefined,
          }
        : spec;
    const result = await executeQuery<Record<string, unknown>>(
      compiler.compileQuery(effectiveSpec, undefined, mappingFor(registry, spec.root), {
        ...(options.entityRows
          ? { projectedFields: options.projectedFields ?? Object.keys(spec.root.fields) }
          : {}),
        ...(options.physicalOrderBy ? { physicalOrderBy: options.physicalOrderBy } : {}),
      }),
    );
    if (input.normalizeRow)
      result.rows = result.rows.map(row => input.normalizeRow!(spec.root, row));
    if (spec.cardinality === 'one' && result.rows.length !== 1) {
      throw new input.Error(
        `Expected exactly one ${spec.root.name}, received ${result.rows.length}.`,
        'cardinality_mismatch',
      );
    }
    return options.entityRows
      ? result.rows
      : Promise.all(result.rows.map(row => materializeRow(row, spec)));
  };

  const uniqueNonNullValues = (
    rows: Record<string, unknown>[],
    entity: AnyEntityDefinition,
    field: string,
  ) => [
    ...new Set(
      rows
        .map(row => normalizeEntityReferenceJoinValue(entity, field, row[field]))
        .filter(value => value != null),
    ),
  ];

  const withRelatedTargetPredicate = (
    spec: RelatedRootReadSpec,
    targetField: string,
    sourceValues: readonly unknown[],
  ): QuerySpec => {
    const values = liftEntityReferenceFieldValues(spec.target.root, targetField, sourceValues);
    return {
      ...spec.target,
      selection: selectionAnd(spec.target.selection, {
        kind: 'predicate',
        operator: 'in',
        fieldName: targetField,
        values,
      }),
    };
  };

  const executeEntityRows = async (
    read: QueryOrView<any, any>,
    projectedFields: readonly string[],
  ): Promise<Record<string, unknown>[]> =>
    isRelatedRootReadSpec(read)
      ? executeRelatedRootRead({ ...read, mode: 'entityRows' }, projectedFields)
      : readSpec(resolveQuerySpec(read as PlainGraphRead<any, any>, undefined), {
          entityRows: true,
          projectedFields,
        });

  const projectedEntityRowFields = (
    projectedFields: readonly string[] | undefined,
    fallbackField: string,
  ) => {
    if (projectedFields === undefined) return undefined;
    return projectedFields.length > 0 ? projectedFields : [fallbackField];
  };

  const relatedSourceRows = async (
    spec: RelatedRootReadSpec<any, any, any, any, any>,
    sourceField: string,
  ) => {
    const entityRows = await executeEntityRows(spec.source, [sourceField]);
    const sourceRows =
      spec.mode === 'resolve' || spec.mode === 'countBySource'
        ? await executeRead(spec.source, undefined)
        : entityRows;
    return {
      sourceRows,
      sourceValues: uniqueNonNullValues(entityRows, spec.sourceEntity, sourceField),
    };
  };

  const emptyRelatedResult = (mode: string, sourceRows: unknown[]) => {
    if (mode === 'resolve') return [{ sourceRows, rows: [] }];
    if (mode === 'countBySource')
      return [{ sourceRows, countsBySource: new Map<unknown, number>() }];
    return [];
  };

  const resolveEdgeTraversal = (spec: RelatedRootReadSpec<any, any, any, any, any>) => {
    const entity = spec.relationOwner === 'source' ? spec.sourceEntity : spec.target.root;
    const relation = entity.relations[spec.relationName];
    if (relation?.mapping?.type !== 'many-to-many') {
      throw new Error(
        `SQL many-to-many Relation ${entity.name}.${spec.relationName} is not mapped.`,
      );
    }
    const mapping = relation.mapping;
    const sourceMapping = mappingFor(registry, entity);
    const targetMapping = mappingFor(registry, relation.target);
    const sourceField = Object.keys(sourceMapping.columns).find(
      field => sourceMapping.columns[field] === mapping.fromColumn,
    );
    const targetField = Object.keys(targetMapping.columns).find(
      field => targetMapping.columns[field] === mapping.toColumn,
    );
    if (!sourceField || !targetField) {
      throw new Error(
        `SQL many-to-many Relation ${entity.name}.${spec.relationName} does not match Entity mappings.`,
      );
    }
    const forward = spec.relationOwner === 'source';
    return {
      sourceField: forward ? sourceField : targetField,
      targetField: forward ? targetField : sourceField,
      throughTable: mapping.throughTable,
      throughSourceColumn: forward ? mapping.throughFromColumn : mapping.throughToColumn,
      throughTargetColumn: forward ? mapping.throughToColumn : mapping.throughFromColumn,
    };
  };

  type Edge = { source_value: unknown; target_value: unknown };
  const loadEdges = async (
    traversal: ReturnType<typeof resolveEdgeTraversal>,
    values: readonly unknown[],
  ) => {
    const placeholders = values.map((_, index) => dialect.placeholder(index + 1)).join(', ');
    const result = await executeQuery<Edge>({
      text:
        `SELECT ${dialect.quoteIdentifier(traversal.throughSourceColumn)} AS source_value, ` +
        `${dialect.quoteIdentifier(traversal.throughTargetColumn)} AS target_value ` +
        `FROM ${dialect.quoteIdentifier(traversal.throughTable)} ` +
        `WHERE ${dialect.quoteIdentifier(traversal.throughSourceColumn)} IN (${placeholders})`,
      values: [...values],
    });
    return result.rows;
  };

  const countRelatedBySource = (
    spec: RelatedRootReadSpec<any, any, any, any, any>,
    targetField: string,
    sourceValues: readonly unknown[],
    entityRows: Record<string, unknown>[],
    edges?: Edge[],
  ) => {
    const counts = new Map<unknown, number>(sourceValues.map(value => [value, 0]));
    const increment = (value: unknown) => {
      if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
    };
    if (edges) {
      const selected = new Set<unknown>(
        uniqueNonNullValues(entityRows, spec.target.root, targetField),
      );
      for (const edge of edges) if (selected.has(edge.target_value)) increment(edge.source_value);
    } else {
      for (const row of entityRows)
        increment(
          normalizeEntityReferenceJoinValue(spec.target.root, targetField, row[targetField]),
        );
    }
    return counts;
  };

  const relatedPhysicalOrder = (spec: RelatedRootReadSpec<any, any, any, any, any>) => {
    const definition = spec.sourceEntity.relations[spec.relationName];
    if (
      spec.relationOwner === 'source' &&
      definition?.ordered &&
      spec.target.orderBy.length === 0 &&
      definition.mapping?.type === 'one-to-many'
    ) {
      return [definition.mapping.orderColumn!];
    }
    return undefined;
  };

  const executeRelatedRootRead = async (
    spec: RelatedRootReadSpec<any, any, any, any, any>,
    projectedFields?: readonly string[],
  ): Promise<any[]> => {
    const relationEntity = spec.relationOwner === 'source' ? spec.sourceEntity : spec.target.root;
    const many = relationEntity.relations[spec.relationName]?.relationKind === 'manyToMany';
    const traversal = many ? resolveEdgeTraversal(spec) : undefined;
    const { sourceField, targetField } =
      traversal ??
      resolveRelatedRootFields(
        spec.target.root,
        spec.sourceEntity,
        spec.relationName,
        spec.relationOwner,
      );
    const { sourceRows, sourceValues } = await relatedSourceRows(spec, sourceField);
    if (sourceValues.length === 0) return emptyRelatedResult(spec.mode, sourceRows);
    const edges = traversal ? await loadEdges(traversal, sourceValues) : undefined;
    const targetValues = edges ? edges.map(edge => edge.target_value) : sourceValues;
    const targetSpec = withRelatedTargetPredicate(spec, targetField, targetValues);
    const physicalOrderBy = relatedPhysicalOrder(spec);
    if (spec.mode === 'entityRows') {
      return readSpec(targetSpec, {
        entityRows: true,
        projectedFields: projectedEntityRowFields(projectedFields, targetField),
        physicalOrderBy,
      });
    }
    if (spec.mode === 'countBySource') {
      const entityRows = await readSpec(targetSpec, {
        entityRows: true,
        projectedFields: [targetField],
        physicalOrderBy,
      });
      return [
        {
          sourceRows,
          countsBySource: countRelatedBySource(spec, targetField, sourceValues, entityRows, edges),
        },
      ];
    }
    const rows = await readSpec(targetSpec, { physicalOrderBy });
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
        cause instanceof input.Error
          ? cause
          : new input.Error('SQL data graph execution failed.', 'execution_failed', cause),
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
          try: () =>
            executeRelatedRootRead(
              {
                ...queryOrView,
                mode: 'entityRows',
                target: { ...queryOrView.target, limit: undefined },
              },
              [],
            ).then(rows => rows.length),
          catch: cause =>
            cause instanceof input.Error
              ? cause
              : new input.Error('SQL related-root count failed.', 'execution_failed', cause),
        });
      }
      const spec = resolveQuerySpec(queryOrView, params);
      return Effect.tryPromise({
        try: () =>
          executeQuery<{ count: number }>(
            compiler.compileQuery(queryOrView, params, mappingFor(registry, spec.root), {
              count: true,
            }),
          ),
        catch: cause => new input.Error('SQL data graph count failed.', 'execution_failed', cause),
      }).pipe(Effect.map(result => Number(result.rows[0]?.count ?? 0)));
    },
  };
};
