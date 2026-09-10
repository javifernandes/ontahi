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
import { createSqlDerivedFieldCompiler } from '@ontahi/sql';
import type { RowDataPacket } from 'mysql2/promise';

import type { MysqlQueryClient } from './client.js';
import { normalizeMysqlRecord, executeMysql } from './client.js';
import { createMysqlMappingRegistry, type MysqlEntityMapping } from './mapping.js';
import { mysqlDialect, quoteMysqlIdentifier } from './sql.js';

const compileMysqlDerivedField = createSqlDerivedFieldCompiler(mysqlDialect);

type FieldShape = {
  fieldType?: string;
  valueType?: string;
  nullable?: boolean;
};

export type MysqlReflectedEntityDataReaderOptions = {
  pool: MysqlQueryClient;
  mappings: readonly MysqlEntityMapping[];
  pageSizeOptions?: readonly number[];
};

const defaultPageSizeOptions = [10, 25, 50, 100] as const;
const quoteIdentifier = quoteMysqlIdentifier;
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

  if (filter.operator === 'in') {
    const members = filter.values ?? [];
    if (!members.length) return 'FALSE';
    values.push(...members);
    return `${column.sql} IN (${members.map(() => '?').join(', ')})`;
  }
  const value = parseFilterValue(field, filter.value);
  if (value === undefined) return undefined;
  values.push(value);
  if (filter.operator === 'contains' && searchableTypes.has(field.fieldType ?? '')) {
    return `LOWER(${column.sql}) LIKE CONCAT('%', LOWER(?), '%')`;
  }
  return `${column.sql} = ?`;
};

const reflectedOrder = (
  entity: AnyEntityDefinition,
  query: ReflectedEntityDataQuery,
  columns: readonly { field: string; sql: string }[],
) => {
  const requested = columns.find(column => column.field === query.sort?.field);
  const defaultField = ['updatedAt', 'createdAt', 'id'].find(field => entity.fields[field]);
  const sort = requested ?? columns.find(column => column.field === defaultField);
  if (!sort) return '';
  const fallback = defaultField === 'id' ? 'asc' : 'desc';
  const requestedDirection = requested ? query.sort?.direction : fallback;
  const direction = requestedDirection === 'asc' ? 'asc' : 'desc';
  const ordering = mysqlDialect.order(sort.sql, direction, direction === 'asc' ? 'first' : 'last');
  return ` ORDER BY ${ordering}`;
};

export const listMysqlReflectedEntityData = async (
  options: MysqlReflectedEntityDataReaderOptions,
  query: ReflectedEntityDataQuery,
): Promise<ReflectedEntityDataResult> => {
  const executeQuery = async <TRow extends Record<string, unknown>>(
    text: string,
    values: unknown[],
  ) => {
    const [rows] = await executeMysql<RowDataPacket[]>(options.pool, text, values);
    return { rows: rows as TRow[] };
  };
  const registry = createMysqlMappingRegistry(options.mappings);
  const mapping = options.mappings.find(candidate => candidate.entity.name === query.entityName);
  if (!mapping) throw new Error(`Unknown graph entity: ${query.entityName}`);

  const entity = mapping.entity;
  const registered = registry.get(entity);
  if (!registered) throw new Error(`Missing MySQL mapping for ${entity.name}.`);

  const physicalColumns = await executeQuery<{ column_name: string }>(
    'SELECT COLUMN_NAME AS column_name FROM information_schema.columns' +
      ' WHERE table_schema = DATABASE() AND table_name = ?',
    [mapping.table],
  );
  const availableColumns = new Set(physicalColumns.rows.map(row => row.column_name));
  const storedColumns = Object.entries(mapping.columns).map(([field, column]) => {
    const definition = entity.fields[field] as FieldShape | undefined;

    return {
      field,
      column,
      sql: quoteIdentifier(column),
      type: definition?.fieldType ?? 'unknown',
      ...(definition?.valueType ? { valueType: definition.valueType } : {}),
      nullable: Boolean(definition?.nullable),
    };
  });
  const derivedColumns = Object.entries(entity.fields).flatMap(([field, definition]) => {
    if (!isDerivedFieldDefinition(definition) || !definition.derived.expression) return [];
    return [
      {
        field,
        sql: compileMysqlDerivedField(entity, mapping, definition.derived.expression),
        type: (definition as FieldShape).fieldType ?? 'unknown',
        ...((definition as FieldShape).valueType
          ? { valueType: (definition as FieldShape).valueType }
          : {}),
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
    predicates.push(
      `(${searchColumns
        .map(column => {
          values.push(search);
          return `LOWER(${column.sql}) LIKE CONCAT('%', LOWER(?), '%')`;
        })
        .join(' OR ')})`,
    );
  }
  for (const filter of query.filters ?? []) {
    const predicate = compileFilter(entity, filter, columns, values);
    if (predicate) predicates.push(predicate);
  }

  const where = predicates.length > 0 ? ` WHERE ${predicates.join(' AND ')}` : '';
  const order = reflectedOrder(entity, query, columns);
  const pageSizeOptions = options.pageSizeOptions ?? defaultPageSizeOptions;
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, pageSizeOptions);
  const offset = (page - 1) * pageSize;
  const selected = columns
    .map(column => `${column.sql} AS ${quoteIdentifier(column.field)}`)
    .join(', ');
  const countResult = await executeQuery<{ count: number }>(
    `SELECT COUNT(*) AS \`count\` FROM ${quoteIdentifier(mapping.table)}${where}`,
    values,
  );
  const rowValues = [...values, String(pageSize), String(offset)];
  const rowsResult = await executeQuery<Record<string, unknown>>(
    `SELECT ${selected || '1 AS __ontahi_row'} FROM ${quoteIdentifier(mapping.table)}${where}${order}` +
      ` LIMIT ? OFFSET ?`,
    rowValues,
  );
  const totalCount = Number(countResult.rows[0]?.count ?? 0);

  return {
    entityName: entity.name,
    columns: columns.map(({ field, type, valueType, nullable }) => ({
      field,
      type,
      ...(valueType ? { valueType } : {}),
      nullable,
    })),
    display,
    omittedColumns,
    rows: rowsResult.rows.map(row => normalizeMysqlRecord(entity, columns.length ? row : {})),
    page,
    pageSize,
    totalCount,
    hasPreviousPage: page > 1,
    hasNextPage: offset + rowsResult.rows.length < totalCount,
  };
};

export const createMysqlReflectedEntityDataReader = (
  options: MysqlReflectedEntityDataReaderOptions,
): ReflectedEntityDataReader => ({
  readEntityData: query => listMysqlReflectedEntityData(options, query),
});
