import { getEntityMapping, isEntityRef, type CompiledIncludePlan } from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import {
  materializeSupabaseEntityRow,
  selectColumnsForQuery,
  toSupabaseEntityRow,
} from './materialization.js';
import type {
  EntityRow,
  FetchEntityRowsInput,
  IncludeShape,
  SupabaseErrorFactory,
  SupabaseLikeClient,
} from './types.js';

import {
  applySupabaseLimit,
  applySupabaseOrderBy,
  applySupabasePredicates,
  applySupabaseSelection,
  compileSupabaseSelection,
  hasEmptySupabaseInPredicate,
} from './index.js';

export const fetchSupabaseEntityRowsEffect = <TClient extends SupabaseLikeClient, TError>(
  input: FetchEntityRowsInput<TClient> & {
    createError: SupabaseErrorFactory<TError>;
  },
): Effect.Effect<EntityRow[], TError> =>
  input.compiledSelection && compileSupabaseSelection(input.compiledSelection).kind === 'none'
    ? Effect.succeed([])
    : hasEmptySupabaseInPredicate(input.compiledWhere ?? input.predicates)
      ? Effect.succeed([])
      : Effect.tryPromise({
          try: async () => {
            const selectColumns = selectColumnsForQuery({
              entityDefinition: input.entityDefinition,
              selectShape: input.selectShape,
              includeShape: input.includeShape,
            });

            let query = input.supabase
              .from(input.tableName ?? getEntityMapping(input.entityDefinition).tableName)
              .select(selectColumns.join(', '));

            query = input.compiledSelection
              ? applySupabaseSelection(query, compileSupabaseSelection(input.compiledSelection))
              : applySupabasePredicates(
                  input.entityDefinition,
                  query,
                  input.compiledWhere ?? input.predicates,
                );

            query = applySupabaseOrderBy(
              input.entityDefinition,
              query,
              input.compiledOrderBy ?? input.orderBy,
            );

            query = applySupabaseLimit(query, input.limit);

            const result = await query;
            if (result.error) {
              throw result.error.message;
            }

            return (result.data ?? []).map((row: Record<string, unknown>) =>
              toSupabaseEntityRow(input.entityDefinition, row),
            );
          },
          catch: cause =>
            input.createError({
              message: input.message,
              logMessage: input.message,
              cause,
            }),
        });

type HydrateSupabaseEntityRowsInput<TClient extends SupabaseLikeClient, TError> = {
  supabase: TClient;
  rows: EntityRow[];
  includeShape: IncludeShape | undefined;
  includePlans: CompiledIncludePlan[];
  fetchEntityRowsEffect: (
    input: Omit<FetchEntityRowsInput<TClient>, 'createError'> & {
      createError: SupabaseErrorFactory<TError>;
    },
  ) => Effect.Effect<EntityRow[], TError>;
  createError: SupabaseErrorFactory<TError>;
};

type RelationNode = ReturnType<IncludeShape[string]['toNodeSpec']>;
type RelationSourceValue = string | number | boolean;

const relationKey = (value: unknown): unknown => {
  if (!isEntityRef(value)) return value;
  const locatorValues = Object.values(value.locator);
  return locatorValues.length === 1 ? locatorValues[0] : value;
};

const collectRelationSourceValues = (
  rows: EntityRow[],
  sourceField: string,
): RelationSourceValue[] =>
  Array.from(
    new Set(
      rows
        .map(row => relationKey(row[sourceField]))
        .filter((value): value is RelationSourceValue => value != null),
    ),
  );

const emptyRelationValue = (relationKind: RelationNode['relationKind']) =>
  relationKind === 'belongsTo' ? null : [];

const assignEmptyRelation = (
  rows: EntityRow[],
  relationName: string,
  relationKind: RelationNode['relationKind'],
) => {
  for (const row of rows) {
    row[relationName] = emptyRelationValue(relationKind);
  }
};

const fetchRelationRowsEffect = <TClient extends SupabaseLikeClient, TError>(
  input: HydrateSupabaseEntityRowsInput<TClient, TError>,
  includePlan: CompiledIncludePlan,
  relationNode: RelationNode,
  sourceValues: RelationSourceValue[],
) =>
  input.fetchEntityRowsEffect({
    supabase: input.supabase,
    entityDefinition: relationNode.entity,
    predicates: [{ operator: 'in', fieldName: includePlan.targetField, values: sourceValues }],
    orderBy: relationNode.orderBy,
    limit: undefined,
    selectShape: relationNode.select,
    includeShape: relationNode.includes,
    tableName: includePlan.targetTable,
    message: `Failed to load ${relationNode.entity.name} records`,
    createError: input.createError,
    compiledWhere: [
      {
        operator: 'in',
        field: includePlan.targetField,
        column: includePlan.targetColumn,
        values: sourceValues,
      },
    ],
    compiledOrderBy: includePlan.orderBy,
  });

const groupRelationRows = (
  rows: EntityRow[],
  includePlan: CompiledIncludePlan,
  relationNode: RelationNode,
) => {
  const grouped = new Map<unknown, unknown[]>();

  for (const row of rows) {
    const key = relationKey(row[includePlan.targetField]);
    const materialized = materializeSupabaseEntityRow(
      row,
      relationNode.entity,
      relationNode.select,
      relationNode.includes,
    );
    const existing = grouped.get(key) ?? [];
    existing.push(materialized);
    grouped.set(key, existing);
  }

  return grouped;
};

const assignRelationRows = (
  rows: EntityRow[],
  includePlan: CompiledIncludePlan,
  relationNode: RelationNode,
  grouped: Map<unknown, unknown[]>,
) => {
  for (const row of rows) {
    const groupedRows = grouped.get(relationKey(row[includePlan.sourceField])) ?? [];
    const limitedRows =
      relationNode.limit != null ? groupedRows.slice(0, relationNode.limit) : groupedRows;

    row[includePlan.relationName] =
      relationNode.relationKind === 'belongsTo' ? (limitedRows[0] ?? null) : limitedRows;
  }
};

const hydrateManyToManyRelationEffect = <TClient extends SupabaseLikeClient, TError>(
  input: HydrateSupabaseEntityRowsInput<TClient, TError>,
  hydratedRows: EntityRow[],
  includePlan: CompiledIncludePlan,
  relationNode: RelationNode,
  sourceValues: RelationSourceValue[],
): Effect.Effect<void, TError> =>
  Effect.gen(function* () {
    const through = includePlan.through;
    if (!through) {
      return yield* Effect.fail(
        input.createError({
          message: `Missing edge mapping for ${includePlan.relationName}`,
          logMessage: `Missing many-to-many edge mapping for ${includePlan.relationName}`,
          cause: 'missing_many_to_many_edge_mapping',
        }),
      );
    }
    const edges = yield* Effect.tryPromise({
      try: async () => {
        const result = await input.supabase
          .from(through.table)
          .select(`${through.sourceColumn}, ${through.targetColumn}`)
          .in(through.sourceColumn, sourceValues);
        if (result.error) throw result.error.message;
        return (result.data ?? []) as Array<Record<string, unknown>>;
      },
      catch: cause =>
        input.createError({
          message: `Failed to load ${includePlan.relationName} edges`,
          logMessage: `Failed to load many-to-many edges for ${includePlan.relationName}`,
          cause,
        }),
    });
    const targetValues = [
      ...new Set(edges.map(edge => edge[through.targetColumn]).filter(value => value != null)),
    ];
    if (targetValues.length === 0) {
      assignEmptyRelation(hydratedRows, includePlan.relationName, relationNode.relationKind);
      return;
    }
    const relatedRows = yield* input.fetchEntityRowsEffect({
      supabase: input.supabase,
      entityDefinition: relationNode.entity,
      predicates: [{ operator: 'in', fieldName: includePlan.targetField, values: targetValues }],
      orderBy: relationNode.orderBy,
      limit: undefined,
      selectShape: relationNode.select,
      includeShape: relationNode.includes,
      tableName: includePlan.targetTable,
      message: `Failed to load ${relationNode.entity.name} records`,
      createError: input.createError,
      compiledWhere: [
        {
          operator: 'in',
          field: includePlan.targetField,
          column: includePlan.targetColumn,
          values: targetValues,
        },
      ],
      compiledOrderBy: includePlan.orderBy,
    });
    const nestedRows = yield* hydrateSupabaseEntityRowsEffect({
      supabase: input.supabase,
      rows: relatedRows,
      includeShape: relationNode.includes,
      includePlans: includePlan.includes,
      fetchEntityRowsEffect: input.fetchEntityRowsEffect,
      createError: input.createError,
    });
    const targets = new Map(
      nestedRows.map(row => [
        relationKey(row[includePlan.targetField]),
        materializeSupabaseEntityRow(
          row,
          relationNode.entity,
          relationNode.select,
          relationNode.includes,
        ),
      ]),
    );
    const targetKeysBySource = new Map<unknown, Set<unknown>>();
    for (const edge of edges) {
      const source = edge[through.sourceColumn];
      const keys = targetKeysBySource.get(source) ?? new Set<unknown>();
      keys.add(edge[through.targetColumn]);
      targetKeysBySource.set(source, keys);
    }
    for (const row of hydratedRows) {
      const keys = targetKeysBySource.get(relationKey(row[includePlan.sourceField]));
      const targetsForRow = keys
        ? [...targets.entries()].filter(([key]) => keys.has(key)).map(([, value]) => value)
        : [];
      row[includePlan.relationName] =
        relationNode.limit == null ? targetsForRow : targetsForRow.slice(0, relationNode.limit);
    }
  });

const hydrateRelationPlanEffect = <TClient extends SupabaseLikeClient, TError>(
  input: HydrateSupabaseEntityRowsInput<TClient, TError>,
  hydratedRows: EntityRow[],
  includePlan: CompiledIncludePlan,
): Effect.Effect<void, TError> =>
  Effect.gen(function* () {
    const relationBuilder = input.includeShape?.[includePlan.relationName];

    if (!relationBuilder) {
      return;
    }

    const relationNode = relationBuilder.toNodeSpec();
    const sourceValues = collectRelationSourceValues(hydratedRows, includePlan.sourceField);

    if (sourceValues.length === 0) {
      assignEmptyRelation(hydratedRows, includePlan.relationName, relationNode.relationKind);
      return;
    }

    if (relationNode.relationKind === 'manyToMany') {
      return yield* hydrateManyToManyRelationEffect(
        input,
        hydratedRows,
        includePlan,
        relationNode,
        sourceValues,
      );
    }

    const relatedRows = yield* fetchRelationRowsEffect(
      input,
      includePlan,
      relationNode,
      sourceValues,
    );
    const hydratedRelatedRows = yield* hydrateSupabaseEntityRowsEffect({
      supabase: input.supabase,
      rows: relatedRows,
      includeShape: relationNode.includes,
      includePlans: includePlan.includes,
      fetchEntityRowsEffect: input.fetchEntityRowsEffect,
      createError: input.createError,
    });

    assignRelationRows(
      hydratedRows,
      includePlan,
      relationNode,
      groupRelationRows(hydratedRelatedRows, includePlan, relationNode),
    );
  });

export const hydrateSupabaseEntityRowsEffect = <TClient extends SupabaseLikeClient, TError>(
  input: HydrateSupabaseEntityRowsInput<TClient, TError>,
): Effect.Effect<EntityRow[], TError> =>
  Effect.gen(function* () {
    const hydratedRows = input.rows.map(row => ({ ...row }));

    for (const includePlan of input.includePlans) {
      yield* hydrateRelationPlanEffect(input, hydratedRows, includePlan);
    }

    return hydratedRows;
  });
