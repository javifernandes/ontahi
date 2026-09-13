import { Stream } from '@ontahi/core/computation/stream';
import {
  createEntityRef,
  createGraphReadDispatcher,
  createGraphReadObserver,
  createInMemoryDataGraphStorage,
  createUpdateCommandSpec,
  entity,
  field,
  query,
  Selection,
  type GraphReadPolicy,
} from '@ontahi/core/data-graph';
import { runBrowserEffect } from '@ontahi/core/runtime/browser';
import {
  createRuntimeProtocolResponse,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { isJsonValue } from '@ontahi/core/value/json';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { createRuntimeGraphClient } from './runtime-graph-client.js';

import { OntahiGraphProvider, useGraphClientCacheSnapshot, useGraphQuery } from './index.js';

const fixture = () => {
  const Node = entity('LifecycleNode', {
    id: field.id(),
    type: field.enum(['part', 'chapter']),
    owner: field.string(),
  });
  const Chapter = Node.variant('LifecycleChapter', { discriminator: { type: 'chapter' } });
  const Part = Node.variant('LifecyclePart', { discriminator: { type: 'part' } });
  const storage = createInMemoryDataGraphStorage({
    entities: [Node],
    dataset: {
      LifecycleNode: [
        { id: 'n1', type: 'chapter', owner: 'alice' },
        { id: 'n2', type: 'chapter', owner: 'alice' },
        { id: 'private', type: 'chapter', owner: 'bob' },
      ],
    },
  });
  const reader = storage.createRuntime();
  const writer = storage.createRuntime();
  const policies: GraphReadPolicy<typeof Node, string>[] = [
    {
      entity: Node,
      variants: [Chapter, Part],
      modes: ['run', 'get', 'count'],
      cardinalities: ['many', 'one'],
      maxLimit: 25,
      fields: {
        id: { select: true, filter: ['eq'], order: true },
        type: { select: true, filter: ['eq'] },
        owner: { select: true },
      },
      scope: ({ authority }) => ({
        kind: 'predicate',
        fieldName: 'owner',
        operator: 'eq',
        value: authority,
      }),
    },
  ];
  let activeObservers = 0;
  const observe = createGraphReadObserver({
    policies,
    observe: async function* (read, { signal }) {
      activeObservers++;
      try {
        yield* Stream.toAsyncIterable(
          reader
            .observe(read, undefined)
            .pipe(Stream.interruptWhen(Stream.runHead(Stream.fromEventListener(signal, 'abort')))),
        );
      } finally {
        activeObservers--;
      }
    },
  });
  const dispatch = createGraphReadDispatcher({
    policies,
    execute: (read, mode) =>
      runBrowserEffect(
        mode === 'count'
          ? reader.count(read, undefined)
          : mode === 'get'
            ? reader.get(read, undefined)
            : reader.run(read, undefined),
      ),
  });
  const transport: RuntimeTransport = {
    request: async envelope => {
      const body = await dispatch(envelope.body, { authority: 'alice' });
      if (!isJsonValue(body)) throw new Error('Receiver returned non-JSON data.');
      return createRuntimeProtocolResponse(envelope, body);
    },
    graph: {
      observe: (request, options) =>
        observe(request, {
          authority: 'alice',
          signal: options?.signal ?? new AbortController().signal,
        }),
    },
  };
  const client = createRuntimeGraphClient({
    runtimeTransport: transport,
    reflectedEntityData: false,
    reflectedRelatedEntityData: false,
  });
  const change = (id: string, type: 'part' | 'chapter') =>
    runBrowserEffect(
      writer.runCommand(
        createUpdateCommandSpec(Node, Selection.where(Node, node => node.id.eq(id)).build(), {
          type,
        }),
      ),
    );
  return { Node, Chapter, Part, client, writer, change, activeObservers: () => activeObservers };
};

describe('classified reads across provider lifecycle changes', () => {
  it('recomputes scoped membership and limits through transport observation, sharing base cache identity', async () => {
    const { Node, Chapter, client, writer, change, activeObservers } = fixture();
    const base = Stream.toAsyncIterable(
      client.graph.bindGraphRead(query(Node).orderBy(node => node.id)).observe(),
    )[Symbol.asyncIterator]();
    const chapters = Stream.toAsyncIterable(
      client.graph
        .bindVariantSelection(Chapter.all())
        .orderBy(node => node.id)
        .limit(1)
        .exec()
        .observe(),
    )[Symbol.asyncIterator]();
    const next = async () => {
      const [baseSnapshot, classifiedSnapshot] = await Promise.all([base.next(), chapters.next()]);
      return { base: baseSnapshot.value, chapters: classifiedSnapshot.value };
    };
    const ref = createEntityRef(Node, { id: 'n1' });
    try {
      expect(await next()).toEqual({
        base: [
          { id: 'n1', type: 'chapter', owner: 'alice' },
          { id: 'n2', type: 'chapter', owner: 'alice' },
        ],
        chapters: [{ id: 'n1', type: 'chapter', owner: 'alice' }],
      });
      expect(activeObservers()).toBe(2);
      await change('n1', 'part');
      expect(await next()).toEqual({
        base: [
          { id: 'n1', type: 'part', owner: 'alice' },
          { id: 'n2', type: 'chapter', owner: 'alice' },
        ],
        chapters: [{ id: 'n2', type: 'chapter', owner: 'alice' }],
      });
      // Leaving a variant is not deletion: the same canonical entity now has its base's new type.
      expect(client.clientCache.readEntity(ref)).toEqual({
        id: 'n1',
        type: 'part',
        owner: 'alice',
      });
      await change('n1', 'chapter');
      expect((await next()).chapters).toEqual([{ id: 'n1', type: 'chapter', owner: 'alice' }]);
      expect(client.clientCache.inspect().records.map(record => record.ref)).toEqual([
        createEntityRef(Node, { id: 'n1' }),
        createEntityRef(Node, { id: 'n2' }),
      ]);
      await runBrowserEffect(
        writer.runCommand(
          Selection.where(Node, node => node.id.eq('n1'))
            .delete()
            .build(),
        ),
      );
      expect(await next()).toEqual({
        base: [{ id: 'n2', type: 'chapter', owner: 'alice' }],
        chapters: [{ id: 'n2', type: 'chapter', owner: 'alice' }],
      });
      // Absence from a snapshot alone is not a global delete event; the host owns this invalidation.
      expect(client.clientCache.readEntity(ref)).toBeDefined();
      client.clientCache.invalidateEntity(ref);
      expect(client.clientCache.readEntity(ref)).toBeUndefined();
    } finally {
      await Promise.all([base.return?.(), chapters.return?.()]);
    }
    expect(activeObservers()).toBe(0);
  });

  it('refetches base, sibling variants and scalar hooks using the canonical base invalidation key', async () => {
    const { Node, Chapter, Part, client, change } = fixture();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const chapter = client.graph.bindVariantSelection(Chapter.all());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider runtime={client.graph} client={client}>
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () => ({
        base: useGraphQuery(query(Node)),
        chapters: useGraphQuery(chapter.many()),
        parts: useGraphQuery(Part.all().many()),
        count: useGraphQuery(chapter.count()),
        exists: useGraphQuery(chapter.exists()),
        cache: useGraphClientCacheSnapshot(),
      }),
      { wrapper },
    );
    try {
      await waitFor(() => expect(result.current.count.data).toBe(2));
      await waitFor(() => expect(result.current.parts.data).toEqual([]));
      expectTypeOf(result.current.chapters.data).toMatchTypeOf<
        Array<{ type: 'chapter' }> | undefined
      >();
      expect(queryClient.getQueryCache().getAll()).toHaveLength(5);
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .every(entry => entry.queryKey[0] === Node.name),
      ).toBe(true);
      await act(async () => {
        await change('n1', 'part');
        await change('n2', 'part');
        await queryClient.invalidateQueries({ queryKey: [Node.name] });
      });
      await waitFor(() => {
        expect(result.current.chapters.data).toEqual([]);
        expect(result.current.count.data).toBe(0);
        expect(result.current.exists.data).toBe(false);
        expect(result.current.parts.data).toEqual([
          { id: 'n1', type: 'part', owner: 'alice' },
          { id: 'n2', type: 'part', owner: 'alice' },
        ]);
        expect(result.current.parts.data).toEqual(result.current.base.data);
      });
      // Query refetch and normalized Entity-cache invalidation are independent host contracts.
      const ref = createEntityRef(Node, { id: 'n1' });
      act(() => {
        client.clientCache.writeEntity(Node, { id: 'n1', type: 'part', owner: 'alice' });
      });
      expect(result.current.cache.records).toHaveLength(1);
      act(() => {
        client.clientCache.invalidateEntity(ref);
      });
      expect(result.current.cache.records).toEqual([]);
    } finally {
      unmount();
      queryClient.clear();
    }
  });
});
