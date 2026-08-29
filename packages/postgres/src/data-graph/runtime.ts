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
  type DataGraphTransactionCapability,
  type EntityMutationCommandExecutionRuntime,
  type GraphCommandSpec,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type RelationshipCommandExecutionRuntime,
  type PlainGraphRead,
  type QueryOrView,
  type QuerySpec,
  type RelatedRootReadSpec,
  type SelectionValue,
} from '@ontahi/core/data-graph';
import { Effect, Stream } from 'effect';
import type { Pool, QueryResultRow } from 'pg';

import {
  executePostgresCommand,
  executePostgresEntityMutationCommand,
  executePostgresManyToManyCommand,
  executePostgresRelationshipCommand,
} from './command-runtime.js';
import { createPostgresMappingRegistry, type PostgresEntityMapping } from './mapping.js';
import { requiresPostgresRelationshipCommandSerialization } from './relation-count-constraint.js';
import { PostgresDataGraphError } from './runtime-error.js';
import { compilePostgresQuery, quotePostgresIdentifier } from './sql.js';
import {
  createPostgresTransactionCapability,
  type PostgresTransactionClient,
} from './transaction.js';

export { PostgresDataGraphError, type PostgresDataGraphErrorReason } from './runtime-error.js';

const mappingFor = (
  registry: Map<AnyEntityDefinition, PostgresEntityMapping>,
  entity: AnyEntityDefinition,
) => {
  const mapping = registry.get(entity);
  if (!mapping) throw new Error(`Missing PostgreSQL mapping for ${entity.name}.`);
  return mapping;
};

type PostgresDataGraphRuntime = DataGraphExecutionRuntime<
  PostgresDataGraphError,
  undefined,
  undefined,
  PostgresDataGraphError
> &
  ManyToManyRelationshipCommandExecutionRuntime<PostgresDataGraphError> &
  RelationshipCommandExecutionRuntime<PostgresDataGraphError> &
  EntityMutationCommandExecutionRuntime<PostgresDataGraphError>;

export type PostgresTransactionDataGraphRuntime = PostgresDataGraphRuntime &
  DataGraphTransactionCapability<PostgresDataGraphRuntime, PostgresDataGraphError>;

type PostgresRuntimeInput = {
  pool: Pick<Pool, 'query'>;
  mappings: readonly PostgresEntityMapping[];
};

type PostgresTransactionPool = Pick<Pool, 'connect' | 'query'>;

type CreatePostgresDataGraphRuntime = {
  (
    input: Omit<PostgresRuntimeInput, 'pool'> & { pool: PostgresTransactionPool },
  ): PostgresTransactionDataGraphRuntime;
  (input: PostgresRuntimeInput): PostgresDataGraphRuntime;
};

const createPostgresBaseDataGraphRuntime = (
  input: PostgresRuntimeInput,
  execution: {
    transactionScoped?: boolean;
    transactionCapability?: DataGraphTransactionCapability<
      PostgresDataGraphRuntime,
      PostgresDataGraphError
    >;
  } = {},
): PostgresDataGraphRuntime => {
  const registry = createPostgresMappingRegistry(input.mappings);
  const executeQuery = <TRow extends QueryResultRow>(sql: { text: string; values: unknown[] }) =>
    input.pool.query<TRow>(sql.text, sql.values);

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
          `PostgreSQL many-to-many Relation ${sourceEntity.name}.${node.relationName} is not mapped.`,
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
          `PostgreSQL many-to-many Relation ${sourceEntity.name}.${node.relationName} does not match Entity mappings.`,
        );
      }
      const edgeResult = await executeQuery<{ target_value: unknown } & QueryResultRow>({
        text:
          `SELECT ${quotePostgresIdentifier(definition.mapping.throughToColumn)} AS target_value ` +
          `FROM ${quotePostgresIdentifier(definition.mapping.throughTable)} ` +
          `WHERE ${quotePostgresIdentifier(definition.mapping.throughFromColumn)} = $1`,
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
    const sourceValues = uniqueNonNullValues(sourceEntityRows, spec.sourceEntity, sourceField);

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
        const value = normalizeEntityReferenceJoinValue(
          spec.target.root,
          targetField,
          row[targetField],
        );
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
              queryOrView.sourceEntity,
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
      executePostgresCommand({
        command,
        executeQuery,
        mapping: mappingFor(registry, command.root),
      }),
    runEntityMutationCommand: command => {
      const mapping = input.mappings.find(
        candidate => candidate.entity.name === command.entityName,
      );
      return mapping
        ? executePostgresEntityMutationCommand({ command, executeQuery, mapping })
        : Effect.fail(
            new PostgresDataGraphError(
              `PostgreSQL Entity Mutation Command references unmapped Entity ${command.entityName}.`,
              'invalid_command',
            ),
          );
    },
    runManyToManyRelationshipCommand: command =>
      executePostgresManyToManyCommand({ command, executeQuery, mappings: input.mappings }),
    runRelationshipCommand: command =>
      Effect.suspend(() => {
        const source = input.mappings.find(
          mapping => mapping.entity.name === command.relation.sourceEntityName,
        );
        const target = input.mappings.find(
          mapping => mapping.entity.name === command.relation.targetEntityName,
        );
        const requiresSerialization =
          source &&
          target &&
          requiresPostgresRelationshipCommandSerialization(command, source, target);
        if (requiresSerialization && !execution.transactionScoped) {
          if (execution.transactionCapability) {
            return execution.transactionCapability.transaction(runtime =>
              runtime.runRelationshipCommand(command),
            );
          }
        }
        return executePostgresRelationshipCommand({
          command,
          executeQuery,
          mappings: input.mappings,
          authoritySerialized: execution.transactionScoped,
        });
      }),
  };
};

export const createPostgresDataGraphRuntime = ((input: PostgresRuntimeInput) => {
  const pool = input.pool as Pick<Pool, 'query'> & Partial<Pick<Pool, 'connect'>>;

  if (typeof pool.connect !== 'function') return createPostgresBaseDataGraphRuntime(input);

  const transactionCapability = createPostgresTransactionCapability(
    pool as PostgresTransactionPool,
    client =>
      createPostgresBaseDataGraphRuntime(
        {
          pool: client as PostgresTransactionClient & Pick<Pool, 'query'>,
          mappings: input.mappings,
        },
        { transactionScoped: true },
      ),
  );
  return Object.assign(
    createPostgresBaseDataGraphRuntime(input, { transactionCapability }),
    transactionCapability,
  );
}) as CreatePostgresDataGraphRuntime;
