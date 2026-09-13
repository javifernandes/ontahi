import {
  createEntityRef,
  createGraphClientCache,
  defineClientEntity,
  entity,
  field,
} from '@ontahi/core/data-graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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
