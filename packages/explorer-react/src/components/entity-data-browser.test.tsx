import type { ReflectedEntityDataReader, ReflectedEntityDataResult } from '@ontahi/core/data-graph';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ExplorerEntityDetail } from '../contracts/index.js';

import { useExplorerEntityDataBrowser } from './index.js';

const entity: ExplorerEntityDetail = {
  name: 'Book',
  fieldCount: 3,
  relationCount: 0,
  graphOperationCount: 0,
  domainOperationCount: 0,
  durableOperationCount: 0,
  taskCount: 0,
  diagram: 'graph TD',
  fields: [
    { name: 'id', type: 'id', nullable: false },
    { name: 'title', type: 'string', nullable: false },
    { name: 'version', type: 'number', nullable: false },
  ],
  relations: [],
};

const buildResult = (
  overrides: Partial<ReflectedEntityDataResult> = {},
): ReflectedEntityDataResult => ({
  entityName: 'Book',
  columns: entity.fields.map(field => ({ ...field, field: field.name })),
  rows: [{ id: 'book-1', title: 'Progbook', version: 1 }],
  page: 1,
  pageSize: 25,
  totalCount: 1,
  hasPreviousPage: false,
  hasNextPage: false,
  ...overrides,
});

const createWrapper = (reader: ReflectedEntityDataReader) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider runtime={{ name: 'test-runtime' }} reflectedEntityDataReader={reader}>
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
  };
};

describe('useExplorerEntityDataBrowser', () => {
  it('loads the first page with entity defaults', async () => {
    const reader = {
      readEntityData: vi.fn().mockResolvedValue(buildResult()),
    };
    const { result } = renderHook(() => useExplorerEntityDataBrowser({ entity }), {
      wrapper: createWrapper(reader),
    });

    await waitFor(() => {
      expect(reader.readEntityData).toHaveBeenCalledWith({
        entityName: 'Book',
        search: '',
        filters: [],
        sort: { field: 'id', direction: 'desc' },
        page: 1,
        pageSize: 25,
      });
    });

    await waitFor(() => {
      expect(result.current.result?.rows).toEqual([
        { id: 'book-1', title: 'Progbook', version: 1 },
      ]);
    });
  });

  it('loads a linked Entity instance through its portable locator', async () => {
    const reader = {
      readEntityData: vi.fn().mockResolvedValue(buildResult()),
    };
    renderHook(() => useExplorerEntityDataBrowser({ entity, initialRef: { id: 'book-1' } }), {
      wrapper: createWrapper(reader),
    });

    await waitFor(() =>
      expect(reader.readEntityData).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [{ field: 'id', operator: 'equals', value: 'book-1' }],
        }),
      ),
    );
  });

  it('does not partially apply a composite locator to the single-filter browser', async () => {
    const reader = {
      readEntityData: vi.fn().mockResolvedValue(buildResult()),
    };
    renderHook(
      () =>
        useExplorerEntityDataBrowser({
          entity,
          initialRef: { id: 'book-1', version: 1 },
        }),
      { wrapper: createWrapper(reader) },
    );

    await waitFor(() =>
      expect(reader.readEntityData).toHaveBeenCalledWith(expect.objectContaining({ filters: [] })),
    );
  });

  it('normalizes unsupported contains filters and resets pagination when filters change', async () => {
    const reader = {
      readEntityData: vi.fn().mockResolvedValue(buildResult({ hasNextPage: true })),
    };
    const { result } = renderHook(() => useExplorerEntityDataBrowser({ entity }), {
      wrapper: createWrapper(reader),
    });

    await waitFor(() => {
      expect(reader.readEntityData).toHaveBeenCalled();
    });

    act(() => {
      result.current.goToNextPage();
    });

    await waitFor(() => {
      expect(reader.readEntityData).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    act(() => {
      result.current.setFilterField('version');
      result.current.setFilterValue('1');
    });

    await waitFor(() => {
      expect(result.current.filterOperator).toBe('equals');
      expect(result.current.page).toBe(1);
      expect(result.current.availableFilterOperators.map(operator => operator.value)).toEqual([
        'equals',
        'isNull',
      ]);
    });
  });
});
