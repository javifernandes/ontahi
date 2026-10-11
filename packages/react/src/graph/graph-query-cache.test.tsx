import {
  createEntityRef,
  createGraphClientCache,
  defineClientEntity,
  entity,
  field,
} from '@ontahi/core/data-graph';
import type { ExecutionIdentity } from '@ontahi/core/runtime/identity';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OntahiGraphProvider, useGraphQuery, type ReactGraphExecutor } from './index.js';

const Tag = entity('Tag', { id: field.id(), name: field.string() });
const Item = entity('Item', {
  id: field.id(),
  title: field.string(),
  completed: field.boolean(),
}).manyToMany('tags', Tag);
const List = entity('List', { id: field.id(), name: field.string() }).hasMany('items', Item);
const Lists = defineClientEntity(List);
const listView = Lists.view('ListCard', {
  id: true,
  name: true,
  items: { id: true, title: true, completed: true, tags: { id: true, name: true } },
});
const read = Lists.all().as(listView);

const createControlledObservation = <T,>() => {
  const queued: T[] = [];
  const waiting: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;
  const close = vi.fn(() => {
    closed = true;
    for (const resolve of waiting.splice(0)) resolve({ done: true, value: undefined });
  });
  const iterator: AsyncIterator<T> = {
    next: () => {
      const value = queued.shift();
      if (value !== undefined) return Promise.resolve({ done: false, value });
      if (closed) return Promise.resolve({ done: true, value: undefined });
      return new Promise(resolve => waiting.push(resolve));
    },
    return: async () => {
      close();
      return { done: true, value: undefined };
    },
  };
  return {
    iterable: { [Symbol.asyncIterator]: () => iterator } as AsyncIterable<T>,
    emit(value: T) {
      const resolve = waiting.shift();
      if (resolve) resolve({ done: false, value });
      else queued.push(value);
    },
    close,
  };
};

const setup = () => {
  const cache = createGraphClientCache();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const executor: ReactGraphExecutor = {
    run: vi.fn(),
    get: vi.fn(),
    count: vi.fn(),
    runCommand: vi.fn(),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <OntahiGraphProvider runtime={{}} client={false} graphExecutor={executor} clientCache={cache}>
        {children}
      </OntahiGraphProvider>
    </QueryClientProvider>
  );
  return { cache, queryClient, executor, wrapper };
};

afterEach(cleanup);

describe('Graph Query cache reconciliation', () => {
  it('keeps one Query current from complete snapshots and cancels it on unmount', async () => {
    const { cache, executor, wrapper: GraphWrapper } = setup();
    type Snapshot = Array<{
      id: string;
      name: string;
      items: Array<{ id: string; title: string; completed: boolean; tags: never[] }>;
    }>;
    const observations: Array<ReturnType<typeof createControlledObservation<Snapshot>>> = [];
    const observe = vi.fn(
      (
        _read: unknown,
        _params: unknown,
        _options: unknown,
        lifecycle?: { readonly signal?: AbortSignal },
      ) => {
        const observation = createControlledObservation<Snapshot>();
        observations.push(observation);
        lifecycle?.signal?.addEventListener('abort', observation.close, { once: true });
        return observation.iterable;
      },
    );
    executor.observe = observe as unknown as NonNullable<ReactGraphExecutor['observe']>;
    const first = {
      id: 'l1',
      name: 'Inbox',
      items: [{ id: 'i1', title: 'First', completed: false, tags: [] as never[] }],
    };
    const updated = {
      ...first,
      items: [{ ...first.items[0]!, completed: true }],
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <GraphWrapper>{children}</GraphWrapper>
      </StrictMode>
    );
    const { result, unmount } = renderHook(() => useGraphQuery(read, { observation: 'live' }), {
      wrapper,
    });
    expect(executor.run).not.toHaveBeenCalled();
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(2));
    expect(observations[0]!.close).toHaveBeenCalledOnce();
    const observation = observations[1]!;

    act(() => observation.emit([first]));
    await waitFor(() => expect(result.current.data).toEqual([first]));
    expect(cache.readEntity(createEntityRef(Item, { id: 'i1' }))).toEqual(first.items[0]);

    act(() => observation.emit([updated]));
    await waitFor(() => expect(result.current.data).toEqual([updated]));
    expect(cache.readEntity(createEntityRef(Item, { id: 'i1' }))).toEqual(updated.items[0]);
    expect(cache.inspect().outputs).toHaveLength(1);

    unmount();
    await waitFor(() => expect(observation.close).toHaveBeenCalledOnce());
    expect(observe).toHaveBeenCalledTimes(2);
    expect(executor.run).not.toHaveBeenCalled();
  });

  it('fails live mode explicitly when the executor cannot observe', async () => {
    const { executor, wrapper } = setup();
    const { result } = renderHook(() => useGraphQuery(read, { observation: 'live' }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Graph executor does not support Query observation.',
    );
    expect(executor.run).not.toHaveBeenCalled();
  });

  it('surfaces observation failures after retaining the last complete snapshot', async () => {
    const { executor, wrapper } = setup();
    const list = { id: 'l1', name: 'Inbox', items: [] };
    executor.observe = async function* () {
      yield [list];
      throw new Error('Observation disconnected');
    } as ReactGraphExecutor['observe'];

    const { result } = renderHook(() => useGraphQuery(read, { observation: 'live' }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual([list]);
    expect(result.current.error?.message).toBe('Observation disconnected');
  });

  it('replaces and cancels the observation when execution identity changes', async () => {
    const { cache, queryClient, executor } = setup();
    const observations = [
      createControlledObservation<any[]>(),
      createControlledObservation<any[]>(),
    ];
    const observe = vi.fn(
      (
        _read: unknown,
        _params: unknown,
        _options: unknown,
        lifecycle?: { readonly signal?: AbortSignal },
      ) => {
        const observation = observations[observe.mock.calls.length - 1]!;
        lifecycle?.signal?.addEventListener('abort', observation.close, { once: true });
        return observation.iterable;
      },
    );
    executor.observe = observe as unknown as NonNullable<ReactGraphExecutor['observe']>;
    let identity: ExecutionIdentity = {
      principal: { kind: 'user', issuer: 'test', subject: 'alice' },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{}}
          client={false}
          graphExecutor={executor}
          clientCache={cache}
          identity={identity}
        >
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
    const { result, rerender, unmount } = renderHook(
      () => useGraphQuery(read, { observation: 'live' }),
      { wrapper },
    );
    observations[0]!.emit([{ id: 'l1', name: 'Alice', items: [] }]);
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Alice'));

    identity = { principal: { kind: 'user', issuer: 'test', subject: 'bob' } };
    rerender();
    await waitFor(() => expect(observations[0]!.close).toHaveBeenCalledOnce());
    observations[1]!.emit([{ id: 'l2', name: 'Bob', items: [] }]);
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Bob'));
    expect(observe).toHaveBeenCalledTimes(2);

    unmount();
    await waitFor(() => expect(observations[1]!.close).toHaveBeenCalledOnce());
  });

  it('normalizes the initial nested read and refreshes values and ordering after refetches', async () => {
    const { cache, queryClient, executor, wrapper } = setup();
    const first = {
      id: 'i1',
      title: 'First',
      completed: false,
      tags: [{ id: 't1', name: 'Work' }],
    };
    const second = { id: 'i2', title: 'Second', completed: false, tags: [] };
    const list = { id: 'l1', name: 'Inbox', items: [first, second] };
    vi.mocked(executor.run).mockResolvedValue([list]);
    const { result } = renderHook(() => useGraphQuery(read), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([list]);
    expect(cache.readEntity(createEntityRef(List, { id: 'l1' }))).toEqual(list);
    expect(cache.readEntity(createEntityRef(Item, { id: 'i1' }))).toEqual(first);
    expect(cache.readEntity(createEntityRef(Tag, { id: 't1' }))).toEqual(first.tags[0]);
    expect(cache.inspect().outputs[0]?.source).toEqual({ kind: 'graph-read', name: 'List' });
    expect(cache.inspect().outputs).toHaveLength(1);
    expect(cache.inspect().outputs[0]?.key).toEqual(
      queryClient.getQueryCache().getAll()[0]?.queryKey,
    );
    expect(cache.inspect().outputs[0]?.value).toEqual([createEntityRef(List, { id: 'l1' })]);

    for (const items of [
      [{ ...first, title: 'Renamed' }, second],
      [{ ...first, title: 'Renamed', completed: true }, second],
      [second, { ...first, title: 'Renamed', completed: true }],
    ]) {
      const updated = { ...list, items };
      vi.mocked(executor.run).mockResolvedValue([updated]);
      await act(async () => {
        await result.current.refetch();
      });
      expect(cache.readEntity(createEntityRef(List, { id: 'l1' }))).toEqual(updated);
      expect(cache.readEntity(createEntityRef(Item, { id: 'i1' }))).toEqual(
        items.find(item => item.id === 'i1'),
      );
      expect(cache.inspect().outputs).toHaveLength(1);
    }
  });

  it('handles singular, absent and scalar reads without inventing entity records', async () => {
    const { cache, executor, wrapper } = setup();
    const list = { id: 'l1', name: 'Inbox', items: [] };
    vi.mocked(executor.get).mockResolvedValue(list);
    const first = renderHook(() => useGraphQuery(read.first()), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(cache.readEntity(createEntityRef(List, { id: 'l1' }))).toEqual(list);
    expect(cache.inspect().outputs[0]?.value).toEqual(createEntityRef(List, { id: 'l1' }));
    vi.mocked(executor.get).mockResolvedValue(null);
    await act(async () => {
      await first.result.current.refetch();
    });
    expect(cache.inspect().outputs[0]?.value).toBeNull();
    vi.mocked(executor.count).mockResolvedValue(3);
    const count = renderHook(() => useGraphQuery(read.count()), { wrapper });
    const exists = renderHook(() => useGraphQuery(read.exists()), { wrapper });
    await waitFor(() => expect(count.result.current.data).toBe(3));
    await waitFor(() => expect(exists.result.current.data).toBe(false));
    expect(cache.inspect().records).toHaveLength(1);
    expect(cache.inspect().outputs.map(output => output.value)).toEqual([null, 3, false]);
  });

  it('leaves cached data unchanged when a refetch fails', async () => {
    const { cache, executor, wrapper } = setup();
    vi.mocked(executor.run).mockResolvedValue([{ id: 'l1', name: 'Inbox', items: [] }]);
    const { result } = renderHook(() => useGraphQuery(read, { queryKey: ['custom-list'] }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const before = cache.inspect();
    vi.mocked(executor.run).mockRejectedValue(new Error('Read failed'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(cache.inspect()).toEqual(before);
    expect(before.outputs[0]?.key).toEqual(['custom-list']);
  });
});
