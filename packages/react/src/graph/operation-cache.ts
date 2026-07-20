import {
  type AnyEntityRef,
  getOperationClientCacheKey,
  invalidateOperationCacheRefs,
  normalizeEntityRef,
  readInitialOperationCacheValueFromCache,
  reconcileOperationOutput,
  valueContainsEntityRef,
} from '@ontahi/core/data-graph';
import type { QueryClient } from '@tanstack/react-query';

export {
  getOperationClientCacheKey,
  invalidateOperationCacheRefs,
  readInitialOperationCacheValueFromCache,
  reconcileOperationOutput,
};

export const invalidateReactQueryCachesContainingRefs = async (
  queryClient: QueryClient,
  refs: readonly AnyEntityRef[],
) => {
  const targetRefKeys = new Set(refs.map(normalizeEntityRef));

  if (targetRefKeys.size === 0) {
    return;
  }

  await Promise.all(
    queryClient
      .getQueryCache()
      .findAll()
      .filter(query => valueContainsEntityRef(query.state.data, targetRefKeys))
      .map(query =>
        queryClient.invalidateQueries({
          exact: true,
          queryKey: query.queryKey,
        }),
      ),
  );
};
