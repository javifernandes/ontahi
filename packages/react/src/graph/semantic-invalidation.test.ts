import type { CommittedMutationSet, GraphReadRequest } from '@ontahi/core/data-graph';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  getCanonicalGraphReadFromMeta,
  invalidateSemanticGraphReads,
  withCanonicalGraphReadMeta,
} from './semantic-invalidation.js';

const items = (list?: string): GraphReadRequest => ({
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: {
    kind: 'selection',
    entityName: 'TodoItem',
    expression:
      list === undefined
        ? { kind: 'all' }
        : { kind: 'predicate', operator: 'eq', fieldName: 'list', value: list },
  },
  orderBy: [],
});

const completedLater: CommittedMutationSet = {
  precision: 'intensional',
  mutations: [
    {
      provenance: 'captured',
      effect: {
        kind: 'graph-command',
        request: {
          version: 3,
          kind: 'graph-command',
          command: {
            kind: 'entity-mutation-command',
            action: 'update',
            entityName: 'TodoItem',
            target: items('list-later').selection,
            values: { completed: true },
          },
        },
      },
    },
  ],
};

describe('semantic Graph Read invalidation', () => {
  it('retains the canonical Read beside caller metadata', () => {
    const request = items('list-later');
    const meta = withCanonicalGraphReadMeta({ source: 'dashboard' }, request);

    expect(meta.source).toBe('dashboard');
    expect(getCanonicalGraphReadFromMeta(meta)).toEqual(request);
  });

  it('invalidates possible overlaps and preserves provably disjoint cached Reads', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const laterKey = ['custom', 'later'] as const;
    const inboxKey = ['custom', 'inbox'] as const;
    const allKey = ['custom', 'all'] as const;
    const tagsKey = ['custom', 'tags'] as const;

    await Promise.all([
      queryClient.fetchQuery({
        queryKey: laterKey,
        queryFn: () => [],
        meta: withCanonicalGraphReadMeta(undefined, items('list-later')),
      }),
      queryClient.fetchQuery({
        queryKey: inboxKey,
        queryFn: () => [],
        meta: withCanonicalGraphReadMeta(undefined, items('list-inbox')),
      }),
      queryClient.fetchQuery({
        queryKey: allKey,
        queryFn: () => [],
        meta: withCanonicalGraphReadMeta(undefined, items()),
      }),
      queryClient.fetchQuery({
        queryKey: tagsKey,
        queryFn: () => [],
        meta: withCanonicalGraphReadMeta(undefined, {
          ...items(),
          selection: { kind: 'selection', entityName: 'Tag', expression: { kind: 'all' } },
        }),
      }),
    ]);

    const invalidated = await invalidateSemanticGraphReads(queryClient, completedLater);

    expect(invalidated.queryKeys).toEqual([laterKey, allKey]);
    expect(queryClient.getQueryState(laterKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(allKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(tagsKey)?.isInvalidated).toBe(false);
  });

  it('ignores cache entries that are not Ontahi Graph Reads', async () => {
    const queryClient = new QueryClient();
    const key = ['unrelated'] as const;
    await queryClient.fetchQuery({ queryKey: key, queryFn: () => 'value' });

    expect(await invalidateSemanticGraphReads(queryClient, completedLater)).toEqual({
      queryKeys: [],
    });
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });
});
