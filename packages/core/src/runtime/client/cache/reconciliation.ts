import type { PlainGraphRead } from '../../../model/query/query.js';
import { getGraphReadOutputDescriptor } from '../../query/output-reflection.js';

import type { GraphClientCacheWriteResult } from './records.js';

import type { GraphClientCache } from './index.js';

export type GraphClientCacheQueryReconciliation<TResult> = {
  readonly value: TResult[];
  readonly writes: readonly GraphClientCacheWriteResult[];
};

/** Reconciles one complete Query snapshot through Entity identities before exposing its value. */
export const reconcileGraphReadSnapshot = <TParams, TResult>(
  cache: GraphClientCache,
  read: PlainGraphRead<TParams, TResult>,
  params: TParams,
  value: TResult[],
): GraphClientCacheQueryReconciliation<TResult> => {
  const descriptor = getGraphReadOutputDescriptor(read, params);
  const normalized = cache.normalizeOutput(descriptor, value);
  return {
    writes: normalized.writes,
    value: cache.denormalizeOutput(descriptor, normalized.value) as TResult[],
  };
};
