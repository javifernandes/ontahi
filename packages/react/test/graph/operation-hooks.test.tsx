import {
  createEntityRef,
  createGraphClientCache,
  defineClientDomainOperation,
  defineClientDomainOperationsForEntity,
  entity,
  field,
  graphOutput,
} from '@ontahi/core/data-graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createNextActionOperationBridgeAdapter } from '../../src/actions/index.js';
import {
  OntahiGraphProvider,
  useDurableOperation,
  useOperation,
  useReflectedOperationRunner,
} from '../../src/graph/index.js';

const createWrapper = (
  bridgeAction = vi.fn(),
  clientCache = createGraphClientCache(),
  queryClient = new QueryClient(),
  reflectedOperationInvoker?: Parameters<
    typeof OntahiGraphProvider
  >[0]['reflectedOperationInvoker'],
) => {
  const bridgeAdapter = createNextActionOperationBridgeAdapter(bridgeAction);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{ name: 'test-runtime' }}
          operationBridgeAdapters={[bridgeAdapter]}
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
    const { Wrapper } = createWrapper(bridgeAction);
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
