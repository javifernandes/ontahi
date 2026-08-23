import {
  defineClientEntity,
  entity,
  field,
  graphSchema,
  query,
  view,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import type { ExecutionIdentity } from '@ontahi/core/runtime/identity';
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
} from './index.js';

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

const ReadingProgressEntity = entity('ReadingProgress', {
  userId: field.id(),
  bookId: field.id(),
})
  .locators({ refByUserAndBook: ['userId', 'bookId'] })
  .identity('refByUserAndBook');

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

const createWrapper = (
  graphExecutor: ReactGraphExecutor,
  queryClient = new QueryClient(),
  identity?: ExecutionIdentity,
) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{ name: 'test-runtime' }}
          graphExecutor={graphExecutor}
          identity={identity}
        >
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
  };

describe('graph query and command hooks', () => {
  it('infers a many read and a canonical identity-scoped key from a client Entity Query', async () => {
    const graphExecutor = createExecutorMock();
    const queryClient = new QueryClient();
    const Book = defineClientEntity(BookEntity);
    const BookListItem = Book.view('BookListItem', { slug: true, title: true });
    const books = Book.all()
      .as(BookListItem)
      .orderBy(book => book.title);
    const identity: ExecutionIdentity = {
      principal: { subject: 'github:123', kind: 'user', issuer: 'https://github.com' },
      cacheScope: { workspaceId: 'workspace-1' },
    };

    vi.mocked(graphExecutor.run).mockResolvedValue([{ slug: 'ontahi', title: 'Ontahi' }]);

    const { result } = renderHook(() => useGraphQuery(books), {
      wrapper: createWrapper(graphExecutor, queryClient, identity),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ slug: 'ontahi', title: 'Ontahi' }]);
    });

    expect(graphExecutor.run).toHaveBeenCalledWith(books.build(), undefined, undefined);
    expect(queryClient.getQueryCache().getAll()[0]?.queryKey).toMatchObject([
      'Book',
      'graph-read',
      ['principal', 'user', 'https://github.com', 'github:123', { workspaceId: 'workspace-1' }],
      'many',
      {
        kind: 'graph-read',
        mode: 'run',
        selection: { entityName: 'Book' },
        view: { kind: 'entity-view', name: 'BookListItem', entity: 'Book' },
      },
    ]);
  });

  it('infers scalar and singular execution from terminal Query intent', async () => {
    const graphExecutor = createExecutorMock();
    const Book = defineClientEntity(BookEntity);
    const Wrapper = createWrapper(graphExecutor);

    vi.mocked(graphExecutor.count).mockResolvedValue(2);
    vi.mocked(graphExecutor.get).mockResolvedValueOnce({
      id: 'book-1',
      slug: 'ontahi',
      title: 'Ontahi',
    });

    const count = renderHook(() => useGraphQuery(Book.all().count()), { wrapper: Wrapper });
    const first = renderHook(() => useGraphQuery(Book.all().first()), { wrapper: Wrapper });

    await waitFor(() => {
      expect(count.result.current.data).toBe(2);
      expect(first.result.current.data).toMatchObject({ id: 'book-1' });
    });

    expect(graphExecutor.count).toHaveBeenCalledOnce();
    expect(graphExecutor.get).toHaveBeenCalledOnce();
  });

  it('uses strict cardinality for one and derives exists from get', async () => {
    const graphExecutor = createExecutorMock();
    const Book = defineClientEntity(BookEntity);
    const Wrapper = createWrapper(graphExecutor);

    vi.mocked(graphExecutor.get).mockImplementation(async read =>
      (read as { cardinality?: string }).cardinality === 'one'
        ? {
            id: 'book-1',
            slug: 'ontahi',
            title: 'Ontahi',
          }
        : null,
    );

    const exists = renderHook(() => useGraphQuery(Book.all().exists()), { wrapper: Wrapper });
    const one = renderHook(() => useGraphQuery(Book.all().one()), { wrapper: Wrapper });

    await waitFor(() => {
      expect(exists.result.current.data).toBe(false);
      expect(one.result.current.data).toMatchObject({ id: 'book-1' });
    });

    const oneRead = vi
      .mocked(graphExecutor.get)
      .mock.calls.map(call => call[0] as { cardinality?: string })
      .find(read => read.cardinality === 'one');
    expect((oneRead as { cardinality?: string }).cardinality).toBe('one');
  });

  it('runs named reads through the configured graph executor', async () => {
    const graphExecutor = createExecutorMock();

    vi.mocked(graphExecutor.get).mockResolvedValue({
      slug: 'ontahi',
      title: 'Ontahi',
    });

    const { result } = renderHook(
      () =>
        useGraphQuery(booksIndexView, {
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
      selection: { kind: 'all' },
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
      selection: { kind: 'all' },
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

  it('normalizes composite identity records into graph operation selections', async () => {
    const graphExecutor = createExecutorMock();
    const operation = {
      id: 'ReadingProgress.reset',
      kind: 'graph-operation',
      authority: 'client-safe',
      exposure: 'browser-direct',
      input: graphSchema.object({
        progress: graphSchema.selection(ReadingProgressEntity, { cardinality: 'one' }),
      }),
      run: ({
        progress,
      }: {
        progress: import('@ontahi/core/data-graph').Selection<typeof ReadingProgressEntity>;
      }) => progress.delete(),
    } as const;

    const { result } = renderHook(() => useGraphOperation(operation), {
      wrapper: createWrapper(graphExecutor),
    });

    await act(async () => {
      await result.current.mutateAsync({
        progress: { userId: 'user-1', bookId: 'book-1' },
      });
    });

    expect(graphExecutor.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'delete',
        cardinality: 'one',
        selection: {
          kind: 'references',
          refs: [
            {
              kind: 'entity-ref',
              entityName: 'ReadingProgress',
              locator: { userId: 'user-1', bookId: 'book-1' },
            },
          ],
        },
      }),
      undefined,
    );
  });
});
