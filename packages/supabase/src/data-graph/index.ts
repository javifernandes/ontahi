import {
  type CompiledOrderBy,
  type CompiledPredicate,
  getEntityMapping,
  resolveColumnNameForEntity,
  resolveFieldNameForEntity,
  type AnyEntityDefinition,
} from '@ontahi/core/data-graph';

export type SupabaseFieldPredicate =
  | { operator: 'eq'; fieldName: string; value: unknown }
  | { operator: 'in'; fieldName: string; values: readonly unknown[] }
  | { operator: 'isNull'; fieldName: string }
  | { operator: 'lte'; fieldName: string; value: unknown }
  | { operator: 'lt'; fieldName: string; value: unknown };

export type SupabaseFieldOrder = {
  fieldName: string;
  direction: 'asc' | 'desc';
};

type SupabasePredicateLike =
  | SupabaseFieldPredicate
  | CompiledPredicate
  | { operator: 'eq'; column: string; value: unknown }
  | { operator: 'in'; column: string; values: readonly unknown[] }
  | { operator: 'isNull'; column: string }
  | { operator: 'lte'; column: string; value: unknown }
  | { operator: 'lt'; column: string; value: unknown };

type SupabaseOrderLike = SupabaseFieldOrder | CompiledOrderBy;

export type SupabasePredicateQuery<TQuery> = {
  eq: (column: string, value: unknown) => TQuery;
  in: (column: string, values: readonly unknown[]) => TQuery;
  is: (column: string, value: null) => TQuery;
  lte: (column: string, value: unknown) => TQuery;
  lt: (column: string, value: unknown) => TQuery;
};

export type SupabaseOrderQuery<TQuery> = {
  order: (column: string, options: { ascending: boolean }) => TQuery;
  limit: (value: number) => TQuery;
};

export const mapEntityPayloadToSupabaseColumns = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
  payload: Record<string, unknown>,
) =>
  Object.fromEntries(
    Object.entries(payload).map(([fieldName, value]) => [
      resolveColumnNameForEntity(entityDefinition, fieldName),
      value,
    ]),
  );

export const mapSupabaseRowToEntityFields = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
  row: Record<string, unknown>,
) =>
  Object.fromEntries(
    Object.entries(row).map(([columnName, value]) => [
      resolveFieldNameForEntity(entityDefinition, columnName),
      value,
    ]),
  );

export const applySupabasePredicates = <
  TEntity extends AnyEntityDefinition,
  TQuery extends SupabasePredicateQuery<TQuery>,
>(
  entityDefinition: TEntity,
  query: TQuery,
  predicates: readonly SupabasePredicateLike[],
) => {
  let nextQuery = query;

  for (const predicate of predicates) {
    const columnName =
      'column' in predicate
        ? predicate.column
        : resolveColumnNameForEntity(entityDefinition, predicate.fieldName);

    if (predicate.operator === 'eq') {
      nextQuery = nextQuery.eq(columnName, predicate.value);
      continue;
    }

    if (predicate.operator === 'in') {
      if (predicate.values.length === 0) {
        continue;
      }
      nextQuery = nextQuery.in(columnName, predicate.values);
      continue;
    }

    if (predicate.operator === 'lte') {
      nextQuery = nextQuery.lte(columnName, predicate.value);
      continue;
    }

    if (predicate.operator === 'lt') {
      nextQuery = nextQuery.lt(columnName, predicate.value);
      continue;
    }

    nextQuery = nextQuery.is(columnName, null);
  }

  return nextQuery;
};

export const hasEmptySupabaseInPredicate = (predicates: readonly SupabasePredicateLike[]) =>
  predicates.some(
    predicate =>
      predicate.operator === 'in' &&
      Array.isArray(predicate.values) &&
      predicate.values.length === 0,
  );

export const applySupabaseOrderBy = <
  TEntity extends AnyEntityDefinition,
  TQuery extends SupabaseOrderQuery<TQuery>,
>(
  entityDefinition: TEntity,
  query: TQuery,
  orderBy: readonly SupabaseOrderLike[],
) => {
  let nextQuery = query;

  for (const order of orderBy) {
    nextQuery = nextQuery.order(
      'column' in order
        ? order.column
        : resolveColumnNameForEntity(entityDefinition, order.fieldName),
      { ascending: order.direction === 'asc' },
    );
  }

  return nextQuery;
};

export const applySupabaseLimit = <TQuery extends SupabaseOrderQuery<TQuery>>(
  query: TQuery,
  limit?: number,
) => (limit == null ? query : query.limit(limit));

export const getProbeColumnForEntity = (entityDefinition: AnyEntityDefinition) =>
  getEntityMapping(entityDefinition).columns[Object.keys(entityDefinition.fields)[0] ?? 'id'] ??
  'id';

export * from './command.js';
export * from './materialization.js';
export * from './query.js';
export * from './reflected-entity-data.js';
export * from './runtime.js';
export * from './types.js';
