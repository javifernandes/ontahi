import {
  describeReflectedEntityDisplay,
  getEntityMapping,
  resolveColumnNameForEntity,
  resolveFieldNameForEntity,
  type AnyEntityDefinition,
  type ReflectedEntityDataFilter,
  type ReflectedEntityDataOmittedColumn,
  type ReflectedEntityDataQuery,
  type ReflectedEntityDataReader,
  type ReflectedEntityDataResult,
} from '@ontahi/core/data-graph';

import type { SupabaseLikeClient } from './types.js';

type FieldShape = {
  fieldType?: string;
  nullable?: boolean;
};

type EntityDataColumn = {
  field: string;
  column: string;
  type: string;
  nullable: boolean;
};

export type SupabaseReflectedEntityDataReaderOptions<TClient extends SupabaseLikeClient> = {
  entities: readonly unknown[];
  getClient: () => TClient;
  pageSizeOptions?: readonly number[];
};

const defaultPageSizeOptions = [10, 25, 50, 100] as const;

const getEntityDefinition = (entities: readonly unknown[], entityName: string) =>
  entities.map(entity => entity as AnyEntityDefinition).find(entity => entity.name === entityName);

const mapSupabaseRowToEntityFields = (
  entityDefinition: AnyEntityDefinition,
  row: Record<string, unknown>,
) =>
  Object.fromEntries(
    Object.entries(row).map(([columnName, value]) => [
      resolveFieldNameForEntity(entityDefinition, columnName),
      value,
    ]),
  );

const clampPage = (page: number | undefined) =>
  Number.isInteger(page) && page && page > 0 ? page : 1;

const clampPageSize = (pageSize: number | undefined, pageSizeOptions: readonly number[]) =>
  pageSizeOptions.find(option => option === pageSize) ?? pageSizeOptions[0] ?? 25;

const normalizeSearchTerm = (value: string | undefined) =>
  value
    ?.trim()
    .replaceAll(/[(),*]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .slice(0, 80) ?? '';

const containsFilterFieldTypes = new Set(['string', 'enum']);
const freeTextSearchFieldTypes = new Set(['string', 'enum']);

const parseFilterValue = (field: FieldShape | undefined, value: string | undefined) => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (field?.fieldType === 'number') {
    const numberValue = Number(trimmedValue);

    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  if (field?.fieldType === 'boolean') {
    if (trimmedValue.toLowerCase() === 'true') {
      return true;
    }

    if (trimmedValue.toLowerCase() === 'false') {
      return false;
    }

    return undefined;
  }

  return trimmedValue;
};

const applyFilter = (
  entity: AnyEntityDefinition,
  query: any,
  filter: ReflectedEntityDataFilter,
  availableColumnNames: Set<string>,
) => {
  const field = entity.fields[filter.field] as FieldShape | undefined;

  if (!field) {
    return query;
  }

  const columnName = resolveColumnNameForEntity(entity, filter.field);
  if (!availableColumnNames.has(columnName)) {
    return query;
  }

  if (filter.operator === 'isNull') {
    return query.is(columnName, null);
  }

  const value = parseFilterValue(field, filter.value);

  if (value == null) {
    return query;
  }

  if (
    filter.operator === 'contains' &&
    containsFilterFieldTypes.has(field.fieldType ?? '') &&
    typeof value === 'string'
  ) {
    return query.ilike(columnName, `%${value}%`);
  }

  return query.eq(columnName, value);
};

const getMissingColumnFromError = (message: string) => {
  const match = message.match(/column\s+(?:(?:["\w]+)\.)?["]?([\w]+)["]?\s+does not exist/i);

  return match?.[1];
};

const listEntityDataWithKnownColumns = async <TClient extends SupabaseLikeClient>(input: {
  client: TClient;
  entity: AnyEntityDefinition;
  query: ReflectedEntityDataQuery;
  excludedColumnNames: Set<string>;
  pageSizeOptions: readonly number[];
}): Promise<ReflectedEntityDataResult> => {
  const { entity } = input;
  const page = clampPage(input.query.page);
  const pageSize = clampPageSize(input.query.pageSize, input.pageSizeOptions);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const mapping = getEntityMapping(entity);
  const allColumns: EntityDataColumn[] = Object.entries(entity.fields).map(([fieldName, field]) => {
    const fieldShape = field as FieldShape;
    const column = mapping.columns[fieldName] ?? fieldName;

    return {
      field: fieldName,
      column,
      type: fieldShape.fieldType ?? 'unknown',
      nullable: Boolean(fieldShape.nullable),
    };
  });
  const columns = allColumns.filter(column => !input.excludedColumnNames.has(column.column));
  const availableColumnNames = new Set(columns.map(column => column.column));
  const display = describeReflectedEntityDisplay(entity);
  const omittedColumns: ReflectedEntityDataOmittedColumn[] = allColumns
    .filter(column => input.excludedColumnNames.has(column.column))
    .map(column => ({
      field: column.field,
      column: column.column,
      reason: 'The mapped database column was not found in the live table.',
    }));
  const selectColumns = columns.map(column => column.column);
  let query = input.client
    .from(mapping.tableName)
    .select(selectColumns.join(', '), { count: 'exact' });

  const searchTerm = normalizeSearchTerm(input.query.search);
  const displaySearchFields = new Set(display?.search ?? []);
  const searchClauses = searchTerm
    ? columns
        .filter(
          column =>
            freeTextSearchFieldTypes.has(column.type) &&
            (displaySearchFields.size === 0 || displaySearchFields.has(column.field)),
        )
        .map(column => `${column.column}.ilike.*${searchTerm}*`)
    : [];

  if (searchClauses.length > 0) {
    query = query.or(searchClauses.join(','));
  }

  for (const filter of input.query.filters ?? []) {
    query = applyFilter(entity, query, filter, availableColumnNames);
  }

  const sortColumn = input.query.sort?.field
    ? resolveColumnNameForEntity(entity, input.query.sort.field)
    : undefined;

  if (sortColumn && availableColumnNames.has(sortColumn)) {
    query = query.order(sortColumn, {
      ascending: input.query.sort?.direction === 'asc',
    });
  } else if (
    entity.fields.updatedAt &&
    availableColumnNames.has(resolveColumnNameForEntity(entity, 'updatedAt'))
  ) {
    query = query.order(resolveColumnNameForEntity(entity, 'updatedAt'), { ascending: false });
  } else if (
    entity.fields.createdAt &&
    availableColumnNames.has(resolveColumnNameForEntity(entity, 'createdAt'))
  ) {
    query = query.order(resolveColumnNameForEntity(entity, 'createdAt'), { ascending: false });
  } else if (
    entity.fields.id &&
    availableColumnNames.has(resolveColumnNameForEntity(entity, 'id'))
  ) {
    query = query.order(resolveColumnNameForEntity(entity, 'id'), { ascending: true });
  }

  const result = await query.range(from, to);

  if (result.error) {
    throw new Error(result.error.message);
  }

  const rows = ((result.data ?? []) as unknown as Array<Record<string, unknown>>).map(row =>
    mapSupabaseRowToEntityFields(entity, row),
  );
  const totalCount = result.count ?? rows.length;

  return {
    entityName: entity.name,
    columns: columns.map(column => ({
      field: column.field,
      type: column.type,
      nullable: column.nullable,
    })),
    display,
    omittedColumns,
    rows,
    page,
    pageSize,
    totalCount,
    hasPreviousPage: page > 1,
    hasNextPage: from + rows.length < totalCount,
  };
};

export const listSupabaseReflectedEntityData = async <TClient extends SupabaseLikeClient>(
  options: SupabaseReflectedEntityDataReaderOptions<TClient>,
  query: ReflectedEntityDataQuery,
): Promise<ReflectedEntityDataResult> => {
  const entity = getEntityDefinition(options.entities, query.entityName);

  if (!entity) {
    throw new Error(`Unknown graph entity: ${query.entityName}`);
  }

  const excludedColumnNames = new Set<string>();
  const pageSizeOptions = options.pageSizeOptions ?? defaultPageSizeOptions;

  for (let attempt = 0; attempt < Object.keys(entity.fields).length + 1; attempt += 1) {
    try {
      return await listEntityDataWithKnownColumns({
        client: options.getClient(),
        entity,
        query,
        excludedColumnNames,
        pageSizeOptions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missingColumn = getMissingColumnFromError(message);

      if (!missingColumn || excludedColumnNames.has(missingColumn)) {
        throw error;
      }

      excludedColumnNames.add(missingColumn);
    }
  }

  throw new Error(`Could not resolve queryable columns for ${entity.name}.`);
};

export const createSupabaseReflectedEntityDataReader = <TClient extends SupabaseLikeClient>(
  options: SupabaseReflectedEntityDataReaderOptions<TClient>,
): ReflectedEntityDataReader => ({
  readEntityData: query => listSupabaseReflectedEntityData(options, query),
});
