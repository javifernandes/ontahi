import type { ReflectedEntityDataReader } from '@ontahi/core/data-graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  getReflectedEntityDataQueryKey,
  OntahiGraphProvider,
  useReflectedEntityDataQuery,
} from '../../src/graph/index.js';

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
});
