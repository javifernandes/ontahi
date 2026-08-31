import {
  createEntityRef,
  createGraphClientCache,
  defineClientDomainOperation,
  defineClientDomainOperationsForEntity,
  defineClientEntity,
  entity,
  field,
  graphOutput,
  graphSchema,
} from '@ontahi/core/data-graph';
import type { RuntimeTransport } from '@ontahi/core/runtime/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createNextActionOperationBridgeAdapter } from '../actions/index.js';

import {
  OntahiGraphProvider,
  useDurableOperation,
  useOperation,
  useOperationQuery,
  useReflectedOperationRunner,
} from './index.js';

const createWrapper = (
  bridgeAction = vi.fn(),
  clientCache = createGraphClientCache(),
  queryClient = new QueryClient(),
  reflectedOperationInvoker?: Parameters<
    typeof OntahiGraphProvider
  >[0]['reflectedOperationInvoker'],
  runtimeTransport?: RuntimeTransport,
) => {
  const bridgeAdapter = createNextActionOperationBridgeAdapter(bridgeAction);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{ name: 'test-runtime' }}
          operationBridgeAdapters={[bridgeAdapter]}
          runtimeTransport={runtimeTransport}
          clientCache={clientCache}
          reflectedOperationInvoker={reflectedOperationInvoker}
        >
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
  }

  return { Wrapper, clientCache };
};

const defineBookEntity = () =>
  entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  })
    .locators({
      refById: 'id',
      refBySlug: 'slug',
    })
    .identity('refById');

describe('operation hooks', () => {
  it('binds a first-class operation invocation to the latest render input', async () => {
    const TodoSchema = entity('Todo', {
      id: field.id(),
      completed: field.boolean(),
    });
    const Todo = defineClientEntity(TodoSchema, {
      domainOperations: {
        complete: defineClientDomainOperation({
          authority: 'server',
          exposure: 'bridge',
          bridge: {},
          input: graphSchema.object({ ids: graphSchema.array(field.id()) }),
          output: graphSchema.object({ completed: field.nonNegativeInteger() }),
        }),
      },
    });
    const bridgeAction = vi.fn().mockResolvedValue({ data: { completed: 2 } });
    const { Wrapper } = createWrapper(bridgeAction);
    const { result, rerender } = renderHook(
      ({ ids }) => useOperation(Todo.domain.complete({ ids })),
      { wrapper: Wrapper, initialProps: { ids: ['todo-1'] } },
    );

    rerender({ ids: ['todo-1', 'todo-2'] });
    await act(async () => {
      await result.current.executeAsync();
    });

    expect(bridgeAction).toHaveBeenCalledWith({
      operationId: 'Todo.complete',
      input: { ids: ['todo-1', 'todo-2'] },
    });
    expect(result.current.value).toEqual({ completed: 2 });
    expectTypeOf(result.current.value).toEqualTypeOf<{ completed: number } | undefined>();
  });

  it('manages and validates one operation input before executing it', async () => {
    const TodoList = entity('TodoList', {
      id: field.id(),
      name: field.nonEmptyString({
        trim: true,
        exclude: { values: ['archive'], caseInsensitive: true },
        messages: { exclude: 'Archive is reserved for system use.' },
      }),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const operation = defineClientDomainOperationsForEntity(TodoList, {
      rename: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        input: graphSchema.object({
          list: graphSchema.selection(TodoList, { cardinality: 'one' }),
          name: TodoList.fields.name,
        }),
        output: TodoList,
      }),
    }).rename;
    const bridgeAction = vi.fn().mockResolvedValue({
      data: { id: 'list-1', name: 'Reading queue' },
    });
    const { Wrapper } = createWrapper(bridgeAction);
    const { result } = renderHook(
      () => useOperation(operation, { list: 'list-1', name: 'Archive' }),
      { wrapper: Wrapper },
    );

    expect(result.current.input.isValid).toBe(false);
    expect(result.current.input.issue('name')?.message).toBe('Archive is reserved for system use.');

    await act(async () => {
      await result.current.executeAsync();
    });

    expect(bridgeAction).not.toHaveBeenCalled();
    expect(result.current.result).toMatchObject({
      ok: false,
      kind: 'input_invalid',
      executed: false,
    });

    act(() => result.current.input.setField('name', '  Reading queue  '));
    await waitFor(() => expect(result.current.input.isValid).toBe(true));
    expect(result.current.input.value).toMatchObject({ name: 'Reading queue' });

    await act(async () => {
      await result.current.executeAsync();
    });

    expect(JSON.parse(JSON.stringify(bridgeAction.mock.calls[0]?.[0]))).toEqual({
      operationId: 'TodoList.rename',
      input: {
        list: {
          kind: 'selection',
          entityName: 'TodoList',
          expression: {
            kind: 'references',
            refs: [
              {
                kind: 'entity-ref',
                entityName: 'TodoList',
                locator: { id: 'list-1' },
              },
            ],
          },
        },
        name: 'Reading queue',
      },
    });
  });

  it('preserves legacy query inputs when generated schema metadata is absent', async () => {
    const bridgeAction = vi.fn().mockResolvedValue({ data: { title: 'Ontahi' } });
    const operation = defineClientDomainOperationsForEntity('Book', {
      fetchBook: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {
          query: [({ slug }: { slug: string }) => slug],
        },
      }),
    }).fetchBook;
    const { Wrapper } = createWrapper(bridgeAction);
    const { result } = renderHook(() => useOperationQuery(operation, { slug: 'ontahi' }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual({ title: 'Ontahi' }));
    expect(bridgeAction).toHaveBeenCalledWith({
      operationId: 'Book.fetchBook',
      input: { slug: 'ontahi' },
    });
  });

  it('omits transport input only for an explicit void schema', async () => {
    const bridgeAction = vi.fn().mockResolvedValue({ data: [{ title: 'Ontahi' }] });
    const operation = defineClientDomainOperationsForEntity('Book', {
      listBooks: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        input: graphSchema.void(),
      }),
    }).listBooks;
    const { Wrapper } = createWrapper(bridgeAction);
    const { result } = renderHook(() => useOperationQuery(operation), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([{ title: 'Ontahi' }]));
    expect(bridgeAction).toHaveBeenCalledWith({
      operationId: 'Book.listBooks',
      input: undefined,
    });
  });

  it('carries a caller-authored View for a projectable Operation query', async () => {
    const Trip = entity('Trip', { id: field.id(), status: field.string() });
    const TripList = Trip.view('TripList', { id: true });
    const bridgeAction = vi.fn().mockResolvedValue({
      data: { ok: true, kind: 'success', value: [{ id: 'trip-1' }] },
    });
    const operation = defineClientDomainOperationsForEntity(Trip, {
      available: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        input: graphSchema.void(),
        output: graphSchema.selection(Trip, { cardinality: 'many' }),
      }),
    }).available.as(TripList);
    const { Wrapper } = createWrapper(bridgeAction);
    const { result } = renderHook(() => useOperationQuery(operation), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 'trip-1' }]));
    expect(bridgeAction).toHaveBeenCalledWith({
      operationId: 'Trip.available',
      input: undefined,
      view: TripList.toJSON(),
    });
  });

  it('runs bridge domain operations and reconciles graph outputs in the client cache', async () => {
    const BookEntity = defineBookEntity();
    const book = {
      id: 'book-1',
      slug: 'ontahi',
      title: 'Ontahi',
    };
    const bridgeAction = vi.fn().mockResolvedValue({
      data: book,
    });
    const operation = defineClientDomainOperationsForEntity(BookEntity, {
      createBook: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        graphOutput: graphOutput.entity(BookEntity),
      }),
    }).createBook;
    const { Wrapper, clientCache } = createWrapper(bridgeAction);
    const { result } = renderHook(
      () =>
        useOperation(operation, {
          invalidateOnSuccess: false,
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.executeAsync({
        slug: 'ontahi',
      });
    });

    expect(bridgeAction).toHaveBeenCalledWith({
      operationId: 'Book.createBook',
      input: {
        slug: 'ontahi',
      },
    });
    expect(clientCache.readEntity(createEntityRef(BookEntity, { id: 'book-1' }))).toBe(book);
  });

  it('normalizes ids and entity records into selection refs before transport', async () => {
    const TodoEntity = entity('Todo', {
      id: field.id(),
      title: field.string(),
      completed: field.boolean(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const operation = defineClientDomainOperationsForEntity(TodoEntity, {
      complete: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: { invalidate: [['Todo']] },
        input: graphSchema.object({
          todos: graphSchema.selection(TodoEntity, { cardinality: 'many' }),
        }),
      }),
    }).complete;
    const bridgeAction = vi.fn().mockResolvedValue({ data: undefined });
    const { Wrapper } = createWrapper(bridgeAction);
    const { result } = renderHook(() => useOperation(operation), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.executeAsync({
        todos: ['todo-1', { id: 'todo-2', title: 'Second', completed: false }],
      });
    });

    expect(JSON.parse(JSON.stringify(bridgeAction.mock.calls[0]?.[0]))).toEqual({
      operationId: 'Todo.complete',
      input: {
        todos: {
          kind: 'selection',
          entityName: 'Todo',
          expression: {
            kind: 'references',
            refs: [
              {
                kind: 'entity-ref',
                entityName: 'Todo',
                locator: { id: 'todo-1' },
              },
              {
                kind: 'entity-ref',
                entityName: 'Todo',
                locator: { id: 'todo-2' },
              },
            ],
          },
        },
      },
    });
    expect(result.current.input).toEqual({
      todos: ['todo-1', { id: 'todo-2', title: 'Second', completed: false }],
    });
  });

  it('accepts an entity ref for a singleton selection query input', async () => {
    const TodoListSchema = entity('TodoList', {
      id: field.id(),
      name: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const TodoList = defineClientEntity(TodoListSchema);
    const operation = defineClientDomainOperationsForEntity('Todo', {
      listForList: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: { query: [(input: { list: unknown }) => input.list] },
        input: graphSchema.object({
          list: graphSchema.selection(TodoListSchema, { cardinality: 'one' }),
        }),
        output: graphSchema.array(
          entity('Todo', {
            id: field.id(),
            listId: field.id(),
            title: field.string(),
          }),
        ),
      }),
    }).listForList;
    const bridgeAction = vi.fn().mockResolvedValue({ data: [] });
    const { Wrapper } = createWrapper(bridgeAction);
    const { result } = renderHook(
      () => useOperationQuery(operation, { list: TodoList.refById('list-research') }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(JSON.parse(JSON.stringify(bridgeAction.mock.calls[0]?.[0]))).toEqual({
      operationId: 'Todo.listForList',
      input: {
        list: {
          kind: 'selection',
          entityName: 'TodoList',
          expression: {
            kind: 'references',
            refs: [
              {
                kind: 'entity-ref',
                entityName: 'TodoList',
                locator: { id: 'list-research' },
              },
            ],
          },
        },
      },
    });
  });

  it('runs success callbacks before waiting for query invalidation', async () => {
    let resolveInvalidation: (() => void) | undefined;
    const invalidation = new Promise<void>(resolve => {
      resolveInvalidation = resolve;
    });
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(invalidation);
    const bridgeAction = vi.fn().mockResolvedValue({
      data: {
        threadId: 'thread-1',
        messageId: 'message-2',
      },
    });
    const operation = defineClientDomainOperationsForEntity('CommentThread', {
      replyThread: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {
          invalidate: [['CommentThread']],
        },
      }),
    }).replyThread;
    const onSuccess = vi.fn();
    const { Wrapper } = createWrapper(bridgeAction, createGraphClientCache(), queryClient);
    const { result } = renderHook(() => useOperation(operation, { onSuccess }), {
      wrapper: Wrapper,
    });
    let execution: ReturnType<typeof result.current.executeAsync> | undefined;

    act(() => {
      execution = result.current.executeAsync({ body: 'Posted reply' });
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['CommentThread'],
    });

    resolveInvalidation?.();
    await act(async () => {
      await execution;
    });
  });

  it('runs durable bridge operations using TaskRunRef from Ontahi core', async () => {
    const bridgeAction = vi.fn().mockResolvedValue({
      data: {
        taskId: 'book.import',
        runId: 'run-1',
        status: 'queued',
      },
    });
    const operation = defineClientDomainOperationsForEntity('Book', {
      importBook: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        durable: {
          runtime: 'vercel-workflow',
          subject: (input: { slug: string }) => ({
            type: 'book',
            id: input.slug,
          }),
        },
      }),
    }).importBook;
    const observe = vi.fn(() =>
      (async function* () {
        yield {
          taskId: 'book.import',
          runId: 'run-1',
          status: 'running' as const,
          updatedAt: '2026-07-23T00:00:00.000Z',
          progress: { phase: 'importing' },
        };
        yield {
          taskId: 'book.import',
          runId: 'run-1',
          status: 'completed' as const,
          updatedAt: '2026-07-23T00:00:01.000Z',
          completedAt: '2026-07-23T00:00:01.000Z',
          result: { imported: 3 },
        };
      })(),
    );
    const runtimeTransport = {
      request: vi.fn(),
      durableOperation: { observe },
    } as unknown as RuntimeTransport;
    const { Wrapper } = createWrapper(
      bridgeAction,
      createGraphClientCache(),
      new QueryClient(),
      undefined,
      runtimeTransport,
    );
    const { result } = renderHook(
      () =>
        useDurableOperation(operation, {
          invalidateOnSuccess: false,
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      const run = await result.current.executeAsync({
        slug: 'ontahi',
      });

      expect(run).toEqual({
        ok: true,
        kind: 'success',
        value: {
          taskId: 'book.import',
          runId: 'run-1',
          status: 'queued',
        },
      });
    });

    expect(result.current.durable.runtime).toBe('vercel-workflow');
    await waitFor(() => expect(result.current.isCompleted).toBe(true));
    expect(result.current.finalValue).toEqual({ imported: 3 });
    expect(observe).toHaveBeenCalledWith(
      { taskId: 'book.import', runId: 'run-1' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('invalidates queries when a void-input durable operation completes', async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const bridgeAction = vi.fn().mockResolvedValue({
      data: {
        taskId: 'Todo.completeAll',
        runId: 'run-1',
        status: 'queued',
      },
    });
    const operation = defineClientDomainOperationsForEntity('Todo', {
      completeAll: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        input: graphSchema.void(),
        bridge: { invalidate: [['Todo']] },
        durable: { runtime: 'in-process' },
      }),
    }).completeAll;
    const observe = vi.fn(() =>
      (async function* () {
        yield {
          taskId: 'Todo.completeAll',
          runId: 'run-1',
          status: 'completed' as const,
          updatedAt: '2026-07-24T00:00:01.000Z',
          completedAt: '2026-07-24T00:00:01.000Z',
          result: { completed: 2 },
        };
      })(),
    );
    const runtimeTransport = {
      request: vi.fn(),
      durableOperation: { observe },
    } as unknown as RuntimeTransport;
    const { Wrapper } = createWrapper(
      bridgeAction,
      createGraphClientCache(),
      queryClient,
      undefined,
      runtimeTransport,
    );
    const { result } = renderHook(() => useDurableOperation(operation), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.executeAsync();
    });

    await waitFor(() => expect(result.current.isCompleted).toBe(true));
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['Todo'],
      }),
    );
  });

  it('aborts an active Runtime Transport observation when reset', async () => {
    const bridgeAction = vi.fn().mockResolvedValue({
      data: { taskId: 'Todo.completeAll', runId: 'run-abort', status: 'queued' },
    });
    const operation = defineClientDomainOperationsForEntity('Todo', {
      completeAll: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        input: graphSchema.void(),
        bridge: {},
        durable: { runtime: 'in-process' },
      }),
    }).completeAll;
    let observationSignal: AbortSignal | undefined;
    const observe = vi.fn(
      (
        _run: unknown,
        options?: {
          signal?: AbortSignal;
        },
      ) =>
        (async function* () {
          observationSignal = options?.signal;
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-abort',
            status: 'running' as const,
            updatedAt: '2026-07-24T00:00:00.000Z',
          };
          await new Promise<void>(resolve =>
            options?.signal?.addEventListener('abort', () => resolve(), { once: true }),
          );
        })(),
    );
    const runtimeTransport = {
      request: vi.fn(),
      durableOperation: { observe },
    } as unknown as RuntimeTransport;
    const { Wrapper } = createWrapper(
      bridgeAction,
      createGraphClientCache(),
      new QueryClient(),
      undefined,
      runtimeTransport,
    );
    const { result } = renderHook(() => useDurableOperation(operation), { wrapper: Wrapper });

    await act(async () => {
      await result.current.executeAsync();
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    act(() => result.current.reset());

    expect(observationSignal?.aborted).toBe(true);
    expect(result.current.snapshot).toBeUndefined();
    expect(result.current.isRefreshingRun).toBe(false);
  });

  it('runs reflected bridge operations from descriptor metadata', async () => {
    const reflectedOperationInvoker = {
      invokeOperation: vi.fn().mockResolvedValue({
        ok: true,
        kind: 'success',
        value: {
          title: 'Ontahi',
        },
      }),
    };
    const operation = {
      id: 'Book.fetchInfo',
      entityName: 'Book',
      name: 'fetchInfo',
      authority: 'server',
      exposure: 'bridge',
    };
    const { Wrapper } = createWrapper(
      vi.fn(),
      createGraphClientCache(),
      new QueryClient(),
      reflectedOperationInvoker,
    );
    const { result } = renderHook(() => useReflectedOperationRunner(operation), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current({
          bookSlug: 'ontahi',
        }),
      ).resolves.toEqual({
        ok: true,
        kind: 'success',
        value: {
          title: 'Ontahi',
        },
      });
    });

    expect(reflectedOperationInvoker.invokeOperation).toHaveBeenCalledWith({
      operationId: 'Book.fetchInfo',
      operation,
      input: {
        bookSlug: 'ontahi',
      },
    });
  });
});
