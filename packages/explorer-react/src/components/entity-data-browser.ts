'use client';

import type {
  ReflectedEntityDataColumn,
  ReflectedEntityDataFilterOperator,
} from '@ontahi/core/data-graph';
import { useReflectedEntityDataQuery } from '@ontahi/react/graph';
import { useEffect, useMemo, useState } from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';

export const explorerEntityDataPageSizeOptions = [10, 25, 50, 100] as const;

export type ExplorerEntityDataPageSize = (typeof explorerEntityDataPageSizeOptions)[number];

export const explorerEntityDataFilterOperators: Array<{
  value: ReflectedEntityDataFilterOperator;
  label: string;
}> = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: '=' },
  { value: 'isNull', label: 'is null' },
];

export const explorerEntityDataFieldSupportsContains = (type: string) =>
  ['id', 'string', 'enum'].includes(type);

const getDefaultFilterField = (entity: ExplorerEntityDetail) => entity.fields[0]?.name ?? '';

const getDefaultSortField = (entity: ExplorerEntityDetail) =>
  entity.fields.find(field => field.name === 'updatedAt')?.name ??
  entity.fields.find(field => field.name === 'createdAt')?.name ??
  entity.fields.find(field => field.name === 'id')?.name ??
  getDefaultFilterField(entity);

const getFallbackColumns = (entity: ExplorerEntityDetail): ReflectedEntityDataColumn[] =>
  entity.fields.map(field => ({ ...field, field: field.name }));

type UseExplorerEntityDataBrowserOptions = {
  entity: ExplorerEntityDetail;
  initialRef?: Record<string, unknown>;
};

export function useExplorerEntityDataBrowser({
  entity,
  initialRef,
}: UseExplorerEntityDataBrowserOptions) {
  const initialRefEntry = Object.entries(initialRef ?? {}).find(([field]) =>
    entity.fields.some(candidate => candidate.name === field),
  );
  const defaultFilterField = initialRefEntry?.[0] ?? getDefaultFilterField(entity);
  const defaultFilterOperator = initialRefEntry ? 'equals' : 'contains';
  const defaultFilterValue = initialRefEntry ? String(initialRefEntry[1]) : '';
  const defaultSortField = getDefaultSortField(entity);
  const [search, setSearchState] = useState('');
  const [filterField, setFilterFieldState] = useState(defaultFilterField);
  const [filterOperator, setFilterOperatorState] =
    useState<ReflectedEntityDataFilterOperator>(defaultFilterOperator);
  const [filterValue, setFilterValueState] = useState(defaultFilterValue);
  const [sortField, setSortFieldState] = useState(defaultSortField);
  const [sortDirection, setSortDirectionState] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<ExplorerEntityDataPageSize>(25);

  useEffect(() => {
    setSearchState('');
    setFilterFieldState(defaultFilterField);
    setFilterOperatorState(defaultFilterOperator);
    setFilterValueState(defaultFilterValue);
    setSortFieldState(defaultSortField);
    setSortDirectionState('desc');
    setPage(1);
  }, [
    defaultFilterField,
    defaultFilterOperator,
    defaultFilterValue,
    defaultSortField,
    entity.name,
  ]);

  const selectedFilterField = useMemo(
    () => entity.fields.find(field => field.name === filterField),
    [entity.fields, filterField],
  );

  useEffect(() => {
    if (
      selectedFilterField &&
      !explorerEntityDataFieldSupportsContains(selectedFilterField.type) &&
      filterOperator === 'contains'
    ) {
      setFilterOperatorState('equals');
    }
  }, [filterOperator, selectedFilterField]);

  const query = useMemo(
    () => ({
      entityName: entity.name,
      search,
      filters:
        filterField && (filterValue.trim() || filterOperator === 'isNull')
          ? [
              {
                field: filterField,
                operator: filterOperator,
                value: filterValue,
              },
            ]
          : [],
      sort: sortField
        ? {
            field: sortField,
            direction: sortDirection,
          }
        : undefined,
      page,
      pageSize,
    }),
    [
      entity.name,
      filterField,
      filterOperator,
      filterValue,
      page,
      pageSize,
      search,
      sortDirection,
      sortField,
    ],
  );
  const dataQuery = useReflectedEntityDataQuery(query);
  const result = dataQuery.data ?? null;
  const columns = result?.columns ?? getFallbackColumns(entity);
  const totalPages = Math.max(1, Math.ceil((result?.totalCount ?? 0) / pageSize));
  const availableFilterOperators = explorerEntityDataFilterOperators.filter(
    operator =>
      operator.value !== 'contains' ||
      explorerEntityDataFieldSupportsContains(selectedFilterField?.type ?? ''),
  );
  const resetPage = () => setPage(1);

  return {
    availableFilterOperators,
    columns,
    error: dataQuery.error?.message ?? null,
    filterField,
    filterOperator,
    filterValue,
    isLoading: dataQuery.isLoading || dataQuery.isFetching,
    page,
    pageSize,
    pageSizeOptions: explorerEntityDataPageSizeOptions,
    result,
    search,
    selectedFilterField,
    sortDirection,
    sortField,
    totalPages,
    goToNextPage: () => setPage(previousPage => previousPage + 1),
    goToPreviousPage: () => setPage(previousPage => Math.max(1, previousPage - 1)),
    setFilterField: (nextFilterField: string) => {
      setFilterFieldState(nextFilterField);
      resetPage();
    },
    setFilterOperator: (nextFilterOperator: ReflectedEntityDataFilterOperator) => {
      setFilterOperatorState(nextFilterOperator);
      resetPage();
    },
    setFilterValue: (nextFilterValue: string) => {
      setFilterValueState(nextFilterValue);
      resetPage();
    },
    setPageSize: (nextPageSize: ExplorerEntityDataPageSize) => {
      setPageSizeState(nextPageSize);
      resetPage();
    },
    setSearch: (nextSearch: string) => {
      setSearchState(nextSearch);
      resetPage();
    },
    setSortDirection: (nextSortDirection: 'asc' | 'desc') => {
      setSortDirectionState(nextSortDirection);
      resetPage();
    },
    setSortField: (nextSortField: string) => {
      setSortFieldState(nextSortField);
      resetPage();
    },
  };
}
