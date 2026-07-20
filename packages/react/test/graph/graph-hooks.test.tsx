import { entity, field, query, view, type GraphCommandSpec } from '@ontahi/core/data-graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  OntahiGraphProvider,
  type ReactGraphExecutor,
  useGraphCommand,
  useGraphOperation,
  useGraphQuery,
} from '../../src/graph/index.js';

const BookEntity = entity('Book', {
  id: field.id(),
  slug: field.string(),
  title: field.string(),
})
  .locators({
    refById: 'id',
  })
  .identity('refById');

const booksIndexView = view('booksIndex', BookEntity, ({ root }) =>
  query(root).select(book => ({
    slug: book.slug,
    title: book.title,
  })),
);

type BookSummary = {
  slug: string;
  title: string;
};

const createExecutorMock = (): ReactGraphExecutor => ({
  get: vi.fn(),
  run: vi.fn(),
  count: vi.fn(),
  runCommand: vi.fn(),
});

const createWrapper = (graphExecutor: ReactGraphExecutor, queryClient = new QueryClient()) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider runtime={{ name: 'test-runtime' }} graphExecutor={graphExecutor}>
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
  };

describe('graph query and command hooks', () => {
  it('runs named reads through the configured graph executor', async () => {
    const graphExecutor = createExecutorMock();

    vi.mocked(graphExecutor.get).mockResolvedValue({
      slug: 'ontahi',
      title: 'Ontahi',
    });

    const { result } = renderHook(
      () =>
        useGraphQuery<typeof booksIndexView, 'get'>(booksIndexView, {
          mode: 'get',
        }),
      { wrapper: createWrapper(graphExecutor) },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({
        slug: 'ontahi',
        title: 'Ontahi',
      });
    });

    expect(graphExecutor.get).toHaveBeenCalledWith(booksIndexView, undefined, undefined);
  });

  it('supports exists mode without importing an Effect runtime', async () => {
    const graphExecutor = createExecutorMock();

    vi.mocked(graphExecutor.get).mockResolvedValue(null);

    const { result } = renderHook(
      () =>
        useGraphQuery<typeof booksIndexView, 'exists'>(booksIndexView, {
          mode: 'exists',
        }),
      { wrapper: createWrapper(graphExecutor) },
    );

    await waitFor(() => {
      expect(result.current.data).toBe(false);
    });
  });

  it('supports count mode for unnamed reads when a query key is provided', async () => {
    const graphExecutor = createExecutorMock();
    const selection = query(BookEntity).select(book => ({
      slug: book.slug,
    }));

    vi.mocked(graphExecutor.count).mockResolvedValue(2);

    const { result } = renderHook(
      () =>
        useGraphQuery<typeof selection, 'count'>(selection, {
          mode: 'count',
          queryKey: ['graph', 'books', 'count'],
        }),
      { wrapper: createWrapper(graphExecutor) },
    );

    await waitFor(() => {
      expect(result.current.data).toBe(2);
    });
  });

  it('runs commands and invalidates declared query keys', async () => {
    const graphExecutor = createExecutorMock();
    const queryClient = new QueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const command: GraphCommandSpec<typeof BookEntity, { title: string }, BookSummary> = {
      kind: 'command',
      operation: 'update',
      root: BookEntity,
      where: [],
      payload: {
        title: 'Ontahi Updated',
      },
    };

    vi.mocked(graphExecutor.runCommand).mockResolvedValue({
      slug: 'ontahi',
      title: 'Ontahi Updated',
    });

    const { result } = renderHook(
      () =>
        useGraphCommand(() => command, {
          invalidateQueryKeys: [['graph', 'get', 'booksIndex', null, null]],
        }),
      { wrapper: createWrapper(graphExecutor, queryClient) },
    );

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(graphExecutor.runCommand).toHaveBeenCalledWith(command, undefined);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['graph', 'get', 'booksIndex', null, null],
    });
  });

  it('runs graph operations as graph commands', async () => {
    const graphExecutor = createExecutorMock();
    const command: GraphCommandSpec<typeof BookEntity, { title: string }, BookSummary> = {
      kind: 'command',
      operation: 'update',
      root: BookEntity,
      where: [],
      payload: {
        title: 'Ontahi Updated',
      },
    };
    const operation = {
      id: 'Book.rename',
      kind: 'graph-operation',
      authority: 'client-safe',
      exposure: 'browser-direct',
      run: () => command,
    } as const;

    vi.mocked(graphExecutor.runCommand).mockResolvedValue({
      slug: 'ontahi',
      title: 'Ontahi Updated',
    });

    const { result } = renderHook(() => useGraphOperation(operation), {
      wrapper: createWrapper(graphExecutor),
    });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(graphExecutor.runCommand).toHaveBeenCalledWith(command, undefined);
  });
});
