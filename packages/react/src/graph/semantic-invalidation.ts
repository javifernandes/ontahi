'use client';

import {
  mayAffectGraphRead,
  type CommittedMutationSet,
  type GraphReadRequest,
} from '@ontahi/core/data-graph';
import type { QueryClient, QueryKey, QueryMeta } from '@tanstack/react-query';

export const ONTAHI_GRAPH_READ_META_KEY = 'ontahi.graphRead' as const;

type OntahiGraphReadMeta = QueryMeta & {
  readonly [ONTAHI_GRAPH_READ_META_KEY]:
    | { readonly kind: 'canonical'; readonly request: GraphReadRequest }
    | { readonly kind: 'unknown' };
};

export type SemanticGraphReadInvalidation = {
  readonly queryKeys: readonly QueryKey[];
};

export const withCanonicalGraphReadMeta = (
  meta: QueryMeta | undefined,
  request: GraphReadRequest,
): OntahiGraphReadMeta => ({
  ...meta,
  [ONTAHI_GRAPH_READ_META_KEY]: { kind: 'canonical', request },
});

export const withUnknownGraphReadMeta = (meta: QueryMeta | undefined): OntahiGraphReadMeta => ({
  ...meta,
  [ONTAHI_GRAPH_READ_META_KEY]: { kind: 'unknown' },
});

export const getCanonicalGraphReadFromMeta = (
  meta: QueryMeta | undefined,
): GraphReadRequest | undefined => {
  const dependency = meta?.[ONTAHI_GRAPH_READ_META_KEY];
  return dependency &&
    typeof dependency === 'object' &&
    'kind' in dependency &&
    dependency.kind === 'canonical' &&
    'request' in dependency
    ? (dependency.request as GraphReadRequest)
    : undefined;
};

export const invalidateSemanticGraphReads = async (
  queryClient: QueryClient,
  committed: CommittedMutationSet,
): Promise<SemanticGraphReadInvalidation> => {
  const queryKeys = queryClient
    .getQueryCache()
    .findAll()
    .flatMap(query => {
      const dependency = query.meta?.[ONTAHI_GRAPH_READ_META_KEY];
      if (
        dependency &&
        typeof dependency === 'object' &&
        'kind' in dependency &&
        dependency.kind === 'unknown'
      ) {
        return committed.mutations.length > 0 ? [query.queryKey] : [];
      }
      const read = getCanonicalGraphReadFromMeta(query.meta);
      return read && committed.mutations.some(mutation => mayAffectGraphRead(mutation, read))
        ? [query.queryKey]
        : [];
    });

  await Promise.all(
    queryKeys.map(queryKey => queryClient.invalidateQueries({ queryKey, exact: true })),
  );

  return { queryKeys };
};
