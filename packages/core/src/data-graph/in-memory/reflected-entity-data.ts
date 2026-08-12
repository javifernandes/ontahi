import type { AnyEntityDefinition } from '../definitions.js';
import {
  createRelationAwareReflectedEntityDataReader,
  describeReflectedEntityDisplay,
  type ReflectedEntityDataFilter,
  type ReflectedEntityDataQuery,
  type ReflectedEntityDataReader,
  type ReflectedEntityDataResult,
} from '../reflection.js';

import type { InMemoryDataset } from './materialization.js';

type FieldShape = {
  fieldType?: string;
  nullable?: boolean;
};

export type InMemoryReflectedEntityDataReaderOptions = {
  entities: readonly AnyEntityDefinition[];
  dataset: InMemoryDataset;
  pageSizeOptions?: readonly number[];
};

const defaultPageSizeOptions = [10, 25, 50, 100] as const;

const getEntity = (entities: readonly AnyEntityDefinition[], entityName: string) =>
  entities.find(entity => entity.name === entityName);

const isSearchableField = (field: FieldShape | undefined) =>
  field?.fieldType === 'string' || field?.fieldType === 'enum';

const clampPage = (page: number | undefined) =>
  Number.isInteger(page) && page && page > 0 ? page : 1;

const clampPageSize = (pageSize: number | undefined, options: readonly number[]) =>
  options.find(option => option === pageSize) ?? options[0] ?? 25;

const normalizeSearch = (value: string | undefined) => value?.trim().toLocaleLowerCase() ?? '';

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

const matchesFilter = (
  entity: AnyEntityDefinition,
  row: Record<string, unknown>,
  filter: ReflectedEntityDataFilter,
) => {
  const field = entity.fields[filter.field] as FieldShape | undefined;
  if (!field) return true;

  const current = row[filter.field];
  if (filter.operator === 'isNull') return current == null;
  if (filter.operator === 'in') return filter.values?.includes(current) ?? true;

  const expected = parseFilterValue(field, filter.value);
  if (expected === undefined) return true;

  if (filter.operator === 'contains') {
    if (!isSearchableField(field)) return current === expected;

    return String(current ?? '')
      .toLocaleLowerCase()
      .includes(String(expected).toLocaleLowerCase());
  }

  return current === expected;
};

const compareValues = (left: unknown, right: unknown) => {
  if (left === right) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  return left < right ? -1 : 1;
};

const defaultSort = (entity: AnyEntityDefinition) => {
  if (entity.fields.updatedAt) return { field: 'updatedAt', direction: 'desc' as const };
  if (entity.fields.createdAt) return { field: 'createdAt', direction: 'desc' as const };
  if (entity.fields.id) return { field: 'id', direction: 'asc' as const };
  return undefined;
};

export const listInMemoryReflectedEntityData = (
  options: InMemoryReflectedEntityDataReaderOptions,
  query: ReflectedEntityDataQuery,
): ReflectedEntityDataResult => {
  const entity = getEntity(options.entities, query.entityName);
  if (!entity) throw new Error(`Unknown graph entity: ${query.entityName}`);

  const pageSizeOptions = options.pageSizeOptions ?? defaultPageSizeOptions;
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, pageSizeOptions);
  const display = describeReflectedEntityDisplay(entity);
  const fieldNames = Object.keys(entity.fields);
  const requestedSearchFields = display?.search?.filter(field => entity.fields[field]);
  const searchFields =
    requestedSearchFields && requestedSearchFields.length > 0
      ? requestedSearchFields.filter(field => isSearchableField(entity.fields[field] as FieldShape))
      : fieldNames.filter(field => isSearchableField(entity.fields[field] as FieldShape));
  const search = normalizeSearch(query.search);
  const rows = (options.dataset[entity.name] ?? [])
    .filter(row =>
      search
        ? searchFields.some(field =>
            String(row[field] ?? '')
              .toLocaleLowerCase()
              .includes(search),
          )
        : true,
    )
    .filter(row => (query.filters ?? []).every(filter => matchesFilter(entity, row, filter)))
    .map(row => Object.fromEntries(fieldNames.map(field => [field, row[field]])));
  const sort =
    query.sort?.field && entity.fields[query.sort.field] ? query.sort : defaultSort(entity);

  if (sort) {
    rows.sort((left, right) => {
      const comparison = compareValues(left[sort.field], right[sort.field]);
      return sort.direction === 'asc' ? comparison : comparison * -1;
    });
  }

  const totalCount = rows.length;
  const offset = (page - 1) * pageSize;
  const pageRows = rows.slice(offset, offset + pageSize);

  return {
    entityName: entity.name,
    columns: Object.entries(entity.fields).map(([field, definition]) => ({
      field,
      type: (definition as FieldShape).fieldType ?? 'unknown',
      nullable: Boolean((definition as FieldShape).nullable),
    })),
    display,
    omittedColumns: [],
    rows: pageRows,
    page,
    pageSize,
    totalCount,
    hasPreviousPage: page > 1,
    hasNextPage: offset + pageRows.length < totalCount,
  };
};

export const createInMemoryReflectedEntityDataReader = (
  options: InMemoryReflectedEntityDataReaderOptions,
): ReflectedEntityDataReader =>
  createRelationAwareReflectedEntityDataReader({
    entities: options.entities,
    readEntityData: async query => listInMemoryReflectedEntityData(options, query),
  });
