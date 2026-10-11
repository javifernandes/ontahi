'use client';

import {
  mayAffectGraphRead,
  type CommittedMutationSet,
  type GraphReadRequest,
} from '@ontahi/core/data-graph';
import type { RuntimeProtocolGraphRefreshCause } from '@ontahi/core/runtime/protocol';
import type { QueryClient, QueryKey, QueryMeta } from '@tanstack/react-query';

export const ONTAHI_GRAPH_READ_META_KEY = 'ontahi.graphRead' as const;

type OntahiGraphReadMeta = QueryMeta & {
  readonly [ONTAHI_GRAPH_READ_META_KEY]:
    | {
        readonly kind: 'canonical';
        readonly request: GraphReadRequest;
        readonly lifecycle: 'once' | 'live';
      }
    | { readonly kind: 'unknown'; readonly lifecycle: 'once' | 'live' };
};

export type SemanticGraphReadInvalidation = {
  readonly queryKeys: readonly QueryKey[];
};

export type SemanticGraphReadInvalidationOptions = {
  readonly causedBy?: RuntimeProtocolGraphRefreshCause;
  readonly associateRefreshes?: (
    requests: readonly GraphReadRequest[],
    causedBy: RuntimeProtocolGraphRefreshCause,
  ) => void;
};

export const withCanonicalGraphReadMeta = (
  meta: QueryMeta | undefined,
  request: GraphReadRequest,
  lifecycle: 'once' | 'live' = 'once',
): OntahiGraphReadMeta => ({
  ...meta,
  [ONTAHI_GRAPH_READ_META_KEY]: { kind: 'canonical', request, lifecycle },
});

export const withUnknownGraphReadMeta = (
  meta: QueryMeta | undefined,
  lifecycle: 'once' | 'live' = 'once',
): OntahiGraphReadMeta => ({
  ...meta,
  [ONTAHI_GRAPH_READ_META_KEY]: { kind: 'unknown', lifecycle },
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
  options?: SemanticGraphReadInvalidationOptions,
): Promise<SemanticGraphReadInvalidation> => {
  const affected: Array<{ readonly queryKey: QueryKey; readonly request?: GraphReadRequest }> =
    queryClient
      .getQueryCache()
      .findAll()
      .flatMap(query => {
        const dependency = query.meta?.[ONTAHI_GRAPH_READ_META_KEY];
        if (
          dependency &&
          typeof dependency === 'object' &&
          'lifecycle' in dependency &&
          dependency.lifecycle === 'live' &&
          query.state.fetchStatus === 'fetching'
        ) {
          // Its observation already receives committed revisions from the runtime. Restarting the
          // query here would create a second subscription and a redundant initial snapshot.
          return [];
        }
        if (
          dependency &&
          typeof dependency === 'object' &&
          'kind' in dependency &&
          dependency.kind === 'unknown'
        ) {
          return committed.mutations.length > 0 ? [{ queryKey: query.queryKey }] : [];
        }
        const read = getCanonicalGraphReadFromMeta(query.meta);
        return read && committed.mutations.some(mutation => mayAffectGraphRead(mutation, read))
          ? [{ queryKey: query.queryKey, request: read }]
          : [];
      });
  const queryKeys = affected.map(item => item.queryKey);
  if (options?.causedBy && options.associateRefreshes) {
    options.associateRefreshes(
      affected.flatMap(item => (item.request ? [item.request] : [])),
      options.causedBy,
    );
  }

  await Promise.all(
    queryKeys.map(queryKey => queryClient.invalidateQueries({ queryKey, exact: true })),
  );

  return { queryKeys };
};
