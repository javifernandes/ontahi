import {
  describeReflectedEntityDisplay,
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type ReflectedEntityDataFilter,
  type ReflectedEntityDataOmittedColumn,
  type ReflectedEntityDataQuery,
  type ReflectedEntityDataReader,
  type ReflectedEntityDataResult,
} from '@ontahi/core/data-graph';
import type { Pool, QueryResultRow } from 'pg';

import { compilePostgresDerivedField } from './derived-field.js';
import { createPostgresMappingRegistry, type PostgresEntityMapping } from './mapping.js';

type FieldShape = {
  fieldType?: string;
  valueType?: string;
  nullable?: boolean;
};

export type PostgresReflectedEntityDataReaderOptions = {
  pool: Pick<Pool, 'query'>;
  mappings: readonly PostgresEntityMapping[];
  pageSizeOptions?: readonly number[];
};

const defaultPageSizeOptions = [10, 25, 50, 100] as const;
const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const clampPage = (page: number | undefined) =>
  Number.isInteger(page) && page && page > 0 ? page : 1;
const clampPageSize = (pageSize: number | undefined, options: readonly number[]) =>
  options.find(option => option === pageSize) ?? options[0] ?? 25;
const searchableTypes = new Set(['string', 'enum']);

const parseFilterValue = (field: FieldShape | undefined, value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (field?.fieldType === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (field?.fieldType === 'boolean') {
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    return undefined;
  }
  return trimmed;
};

const compileFilter = (
  entity: AnyEntityDefinition,
  filter: ReflectedEntityDataFilter,
  columns: readonly { field: string; sql: string }[],
  values: unknown[],
) => {
  const field = entity.fields[filter.field] as FieldShape | undefined;
  const column = columns.find(candidate => candidate.field === filter.field);
  if (!field || !column) return undefined;
  if (filter.operator === 'isNull') return `${column.sql} IS NULL`;

  const value = parseFilterValue(field, filter.value);
  if (value === undefined) return undefined;
  values.push(value);
  if (filter.operator === 'contains' && searchableTypes.has(field.fieldType ?? '')) {
    return `${column.sql} ILIKE '%' || $${values.length} || '%'`;
  }
  return `${column.sql} = $${values.length}`;
};

export const listPostgresReflectedEntityData = async (
  options: PostgresReflectedEntityDataReaderOptions,
  query: ReflectedEntityDataQuery,
): Promise<ReflectedEntityDataResult> => {
  const registry = createPostgresMappingRegistry(options.mappings);
  const mapping = options.mappings.find(candidate => candidate.entity.name === query.entityName);
  if (!mapping) throw new Error(`Unknown graph entity: ${query.entityName}`);

  const entity = mapping.entity;
  const registered = registry.get(entity);
  if (!registered) throw new Error(`Missing PostgreSQL mapping for ${entity.name}.`);

  const physicalColumns = await options.pool.query<{ column_name: string } & QueryResultRow>(
    'SELECT column_name FROM information_schema.columns' +
      ' WHERE table_schema = current_schema() AND table_name = $1',
    [mapping.table],
  );
  const availableColumns = new Set(physicalColumns.rows.map(row => row.column_name));
  const storedColumns = Object.entries(mapping.columns).map(([field, column]) => ({
    field,
    column,
    sql: quoteIdentifier(column),
    type:
      (entity.fields[field] as FieldShape | undefined)?.valueType ??
      (entity.fields[field] as FieldShape | undefined)?.fieldType ??
      'unknown',
    nullable: Boolean((entity.fields[field] as FieldShape | undefined)?.nullable),
  }));
  const derivedColumns = Object.entries(entity.fields).flatMap(([field, definition]) => {
    if (!isDerivedFieldDefinition(definition) || !definition.derived.expression) return [];
    return [
      {
        field,
        sql: compilePostgresDerivedField(entity, mapping, definition.derived.expression),
        type:
          (definition as FieldShape).valueType ?? (definition as FieldShape).fieldType ?? 'unknown',
        nullable: Boolean((definition as FieldShape).nullable),
      },
    ];
  });
  const columns = [
    ...storedColumns.filter(column => availableColumns.has(column.column)),
    ...derivedColumns,
  ];
  const omittedColumns: ReflectedEntityDataOmittedColumn[] = storedColumns
    .filter(column => !availableColumns.has(column.column))
    .map(column => ({
      field: column.field,
      column: column.column,
      reason: 'The mapped database column was not found in the live table.',
    }));

  const values: unknown[] = [];
  const predicates: string[] = [];
  const display = describeReflectedEntityDisplay(entity);
  const search = query.search?.trim();
  const configuredSearchFields = new Set(display?.search ?? []);
  const searchColumns = columns.filter(
    column =>
      searchableTypes.has(column.type) &&
      (configuredSearchFields.size === 0 || configuredSearchFields.has(column.field)),
  );
  if (search && searchColumns.length > 0) {
    values.push(search);
    predicates.push(
      `(${searchColumns
        .map(column => `${column.sql} ILIKE '%' || $${values.length} || '%'`)
        .join(' OR ')})`,
    );
  }
  for (const filter of query.filters ?? []) {
    const predicate = compileFilter(entity, filter, columns, values);
    if (predicate) predicates.push(predicate);
  }

  const where = predicates.length > 0 ? ` WHERE ${predicates.join(' AND ')}` : '';
  const requestedSort = query.sort?.field
    ? columns.find(column => column.field === query.sort?.field)
    : undefined;
  const defaultSortField = entity.fields.updatedAt
    ? 'updatedAt'
    : entity.fields.createdAt
      ? 'createdAt'
      : entity.fields.id
        ? 'id'
        : undefined;
  const sort = requestedSort ?? columns.find(column => column.field === defaultSortField);
  const defaultDirection = defaultSortField === 'id' ? 'asc' : 'desc';
  const direction = requestedSort ? query.sort?.direction : defaultDirection;
  const order = sort
    ? ` ORDER BY ${sort.sql} ${direction?.toUpperCase()}` +
      (direction === 'asc' ? ' NULLS FIRST' : ' NULLS LAST')
    : '';
  const pageSizeOptions = options.pageSizeOptions ?? defaultPageSizeOptions;
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, pageSizeOptions);
  const offset = (page - 1) * pageSize;
  const selected = columns
    .map(column => `${column.sql} AS ${quoteIdentifier(column.field)}`)
    .join(', ');
  const countResult = await options.pool.query<{ count: number } & QueryResultRow>(
    `SELECT COUNT(*)::int AS "count" FROM ${quoteIdentifier(mapping.table)}${where}`,
    values,
  );
  const rowValues = [...values, pageSize, offset];
  const rowsResult = await options.pool.query<Record<string, unknown> & QueryResultRow>(
    `SELECT ${selected} FROM ${quoteIdentifier(mapping.table)}${where}${order}` +
      ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    rowValues,
  );
  const totalCount = countResult.rows[0]?.count ?? 0;

  return {
    entityName: entity.name,
    columns: columns.map(({ field, type, nullable }) => ({ field, type, nullable })),
    display,
    omittedColumns,
    rows: rowsResult.rows,
    page,
    pageSize,
    totalCount,
    hasPreviousPage: page > 1,
    hasNextPage: offset + rowsResult.rows.length < totalCount,
  };
};

export const createPostgresReflectedEntityDataReader = (
  options: PostgresReflectedEntityDataReaderOptions,
): ReflectedEntityDataReader => ({
  readEntityData: query => listPostgresReflectedEntityData(options, query),
});
