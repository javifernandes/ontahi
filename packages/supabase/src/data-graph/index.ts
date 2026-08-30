import {
  type CompiledOrderBy,
  type CompiledPredicate,
  type CompiledSelectionExpression,
  getEntityMapping,
  liftEntityReferenceRecord,
  lowerEntityReferenceRecord,
  lowerEntityReferenceSelection,
  resolveColumnNameForEntity,
  resolveFieldNameForEntity,
  type AnyEntityDefinition,
} from '@ontahi/core/data-graph';

export {
  applySupabaseDataGraphMappings,
  supabaseNaming,
  type ApplySupabaseDataGraphMappingsOptions,
  type SupabaseDataGraphMappingOverrides,
  type SupabaseDataGraphNaming,
} from './mapping.js';
export * from './many-to-many.js';
export * from './many-to-many-rpc-sql.js';
export * from './relationship-command.js';
export * from './relationship-rpc-sql.js';

export type SupabaseFieldPredicate =
  | { operator: 'eq'; fieldName: string; value: unknown }
  | { operator: 'in'; fieldName: string; values: readonly unknown[] }
  | { operator: 'isNull'; fieldName: string }
  | { operator: 'lte'; fieldName: string; value: unknown }
  | { operator: 'lt'; fieldName: string; value: unknown }
  | { operator: 'gte'; fieldName: string; value: unknown }
  | { operator: 'gt'; fieldName: string; value: unknown };

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
  | { operator: 'lt'; column: string; value: unknown }
  | { operator: 'gte'; column: string; value: unknown }
  | { operator: 'gt'; column: string; value: unknown };

type SupabaseOrderLike = SupabaseFieldOrder | CompiledOrderBy;

export type SupabasePredicateQuery<TQuery> = {
  eq: (column: string, value: unknown) => TQuery;
  in: (column: string, values: readonly unknown[]) => TQuery;
  is: (column: string, value: null) => TQuery;
  lte: (column: string, value: unknown) => TQuery;
  lt: (column: string, value: unknown) => TQuery;
  gte: (column: string, value: unknown) => TQuery;
  gt: (column: string, value: unknown) => TQuery;
};

export type SupabaseSelectionQuery<TQuery> = SupabasePredicateQuery<TQuery> & {
  or: (filters: string) => TQuery;
};

export type CompiledSupabaseSelection =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'predicates'; predicates: CompiledPredicate[] }
  | { kind: 'logic'; filter: string };

const quotePostgrestValue = (value: unknown) => {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);

  const text = value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
};

const serializeSupabasePredicate = (predicate: CompiledPredicate): SerializedSelection => {
  if (predicate.operator === 'isNull') return `${predicate.column}.is.null`;
  if (predicate.operator === 'in') {
    if (predicate.values.length === 0) return false;
    return `${predicate.column}.in.(${predicate.values.map(quotePostgrestValue).join(',')})`;
  }
  return `${predicate.column}.${predicate.operator}.${quotePostgrestValue(predicate.value)}`;
};

type SerializedSelection = string | boolean;

const serializeSupabaseSelection = (
  selection: CompiledSelectionExpression,
): SerializedSelection => {
  if (!('kind' in selection)) return serializeSupabasePredicate(selection);
  if (selection.kind === 'all') return true;
  if (selection.kind === 'none') return false;
  if (selection.kind === 'not') {
    const operand = serializeSupabaseSelection(selection.operand);
    return typeof operand === 'boolean' ? !operand : `not.${operand}`;
  }
  if (selection.kind === 'and' || selection.kind === 'or') {
    const operands = selection.operands.map(serializeSupabaseSelection);
    const identity = selection.kind === 'and';
    if (operands.some(operand => operand === !identity)) return !identity;
    const filters = operands.filter((operand): operand is string => typeof operand === 'string');
    if (filters.length === 0) return identity;
    if (filters.length === 1) return filters[0]!;
    return `${selection.kind}(${filters.join(',')})`;
  }
  throw new Error('Unsupported compiled selection expression.');
};

const collectConjunctiveCompiledPredicates = (
  selection: CompiledSelectionExpression,
): CompiledPredicate[] | undefined => {
  if (!('kind' in selection)) return [selection];
  if (selection.kind === 'all') return [];
  if (selection.kind === 'none' || selection.kind === 'or' || selection.kind === 'not') {
    return undefined;
  }
  if (selection.kind === 'and') {
    const operands = selection.operands.map(collectConjunctiveCompiledPredicates);
    return operands.some(operand => operand == null) ? undefined : operands.flatMap(x => x!);
  }
  throw new Error('Unsupported compiled selection expression.');
};

export const compileSupabaseSelection = (
  selection: CompiledSelectionExpression,
): CompiledSupabaseSelection => {
  const filter = serializeSupabaseSelection(selection);
  if (filter === true) return { kind: 'all' };
  if (filter === false) return { kind: 'none' };

  const predicates = collectConjunctiveCompiledPredicates(selection);
  if (predicates) return { kind: 'predicates', predicates };
  return {
    kind: 'logic',
    filter: 'kind' in selection && selection.kind === 'or' ? filter.slice(3, -1) : filter,
  };
};

export const applySupabaseSelection = <TQuery extends SupabaseSelectionQuery<TQuery>>(
  query: TQuery,
  selection: CompiledSupabaseSelection,
) => {
  if (selection.kind === 'logic') return query.or(selection.filter);
  if (selection.kind === 'predicates') {
    let nextQuery = query;
    for (const predicate of selection.predicates) {
      nextQuery = applySupabasePredicate(nextQuery, predicate.column, predicate);
    }
    return nextQuery;
  }
  return query;
};

const applySupabasePredicate = <TQuery extends SupabasePredicateQuery<TQuery>>(
  query: TQuery,
  columnName: string,
  predicate: SupabasePredicateLike,
) => {
  if (predicate.operator === 'eq') return query.eq(columnName, predicate.value);
  if (predicate.operator === 'in') {
    return predicate.values.length === 0 ? query : query.in(columnName, predicate.values);
  }
  if (predicate.operator === 'lte') return query.lte(columnName, predicate.value);
  if (predicate.operator === 'lt') return query.lt(columnName, predicate.value);
  if (predicate.operator === 'gte') return query.gte(columnName, predicate.value);
  if (predicate.operator === 'gt') return query.gt(columnName, predicate.value);
  return query.is(columnName, null);
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
    Object.entries(lowerEntityReferenceRecord(entityDefinition, payload)).map(
      ([fieldName, value]) => [resolveColumnNameForEntity(entityDefinition, fieldName), value],
    ),
  );

export const mapSupabaseRowToEntityFields = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
  row: Record<string, unknown>,
) =>
  liftEntityReferenceRecord(
    entityDefinition,
    Object.fromEntries(
      Object.entries(row).map(([columnName, value]) => [
        resolveFieldNameForEntity(entityDefinition, columnName),
        value,
      ]),
    ),
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
    let loweredPredicate: SupabasePredicateLike = predicate;
    if ('fieldName' in predicate) {
      const lowered = lowerEntityReferenceSelection(entityDefinition, {
        kind: 'predicate',
        ...predicate,
      });
      if (lowered.kind !== 'predicate') {
        throw new Error('Expected a Supabase selection predicate.');
      }
      loweredPredicate = lowered;
    }
    const columnName =
      'column' in loweredPredicate
        ? loweredPredicate.column
        : resolveColumnNameForEntity(entityDefinition, loweredPredicate.fieldName);

    nextQuery = applySupabasePredicate(nextQuery, columnName, loweredPredicate);
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
  Object.values(getEntityMapping(entityDefinition).columns)[0] ?? 'id';

export * from './command.js';
export * from './entity-mutation-command.js';
export * from './materialization.js';
export * from './query.js';
export * from './reflected-entity-data.js';
export * from './runtime.js';
export * from './types.js';
