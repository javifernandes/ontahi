import type {
  ReflectedEntityDataReader,
  ReflectedRelatedEntityDataReader,
} from '@ontahi/core/data-graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  getReflectedEntityDataQueryKey,
  getReflectedRelatedEntityDataQueryKey,
  OntahiGraphProvider,
  useHasReflectedRelatedEntityDataReader,
  useReflectedEntityDataQuery,
  useReflectedRelatedEntityDataReader,
  useReflectedRelatedEntityDataQuery,
} from './index.js';

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

describe('reflected entity data hooks', () => {
  it('reads reflected entity data through the registered reader', async () => {
    const query = {
      entityName: 'Book',
      search: 'ontahi',
      page: 2,
      pageSize: 10,
    };
    const result = {
      entityName: 'Book',
      columns: [
        {
          field: 'title',
          type: 'string',
          nullable: false,
        },
      ],
      rows: [
        {
          title: 'Ontahi',
        },
      ],
      page: 2,
      pageSize: 10,
      totalCount: 11,
      hasPreviousPage: true,
      hasNextPage: false,
    };
    const reader = {
      readEntityData: vi.fn().mockResolvedValue(result),
    };

    const { result: hook } = renderHook(() => useReflectedEntityDataQuery(query), {
      wrapper: createWrapper(reader),
    });

    await waitFor(() => {
      expect(hook.current.data).toEqual(result);
    });
    expect(reader.readEntityData).toHaveBeenCalledWith(query);
    expect(getReflectedEntityDataQueryKey(query)).toEqual([
      'graph',
      'reflected-entity-data',
      query,
    ]);
  });

  it('reads related data only through the registered Query-backed capability', async () => {
    const query = {
      source: { kind: 'entity-ref' as const, entityName: 'Book', locator: { id: 'book-1' } },
      relationName: 'collaborators',
      sourceEntityName: 'Book',
      targetEntityName: 'Profile',
    };
    const result = {
      entityName: 'Profile',
      columns: [{ field: 'id', type: 'id', nullable: false }],
      rows: [{ id: 'profile-1' }],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    };
    const relatedReader: ReflectedRelatedEntityDataReader = {
      readRelatedEntityData: vi.fn().mockResolvedValue(result),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{ name: 'test-runtime' }}
          reflectedRelatedEntityDataReader={relatedReader}
        >
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
    const { result: hook } = renderHook(() => useReflectedRelatedEntityDataQuery(query), {
      wrapper,
    });

    await waitFor(() => expect(hook.current.data).toEqual(result));
    expect(relatedReader.readRelatedEntityData).toHaveBeenCalledWith(query);
    expect(getReflectedRelatedEntityDataQueryKey(query)).toEqual([
      'graph',
      'reflected-related-entity-data',
      query,
    ]);
  });

  it('reports and enforces the related-data capability boundary', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider runtime={{ name: 'test-runtime' }} client={false}>
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );

    expect(
      renderHook(() => useHasReflectedRelatedEntityDataReader(), { wrapper }).result.current,
    ).toBe(false);
    expect(() => renderHook(() => useReflectedRelatedEntityDataReader(), { wrapper })).toThrow(
      /reflectedRelatedEntityDataReader/,
    );
    consoleError.mockRestore();
  });
});
