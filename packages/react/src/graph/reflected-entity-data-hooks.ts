'use client';

import type { ReflectedEntityDataQuery, ReflectedEntityDataResult } from '@ontahi/core/data-graph';
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useReflectedEntityDataReader } from './context.js';

export const getReflectedEntityDataQueryKey = (query: ReflectedEntityDataQuery): QueryKey => [
  'graph',
  'reflected-entity-data',
  query,
];

export type ReflectedEntityDataQueryOptions = Omit<
  UseQueryOptions<ReflectedEntityDataResult, Error, ReflectedEntityDataResult, QueryKey>,
  'queryFn' | 'queryKey'
> & {
  queryKey?: QueryKey;
};

export function useReflectedEntityDataQuery(
  query: ReflectedEntityDataQuery,
  options?: ReflectedEntityDataQueryOptions,
): UseQueryResult<ReflectedEntityDataResult, Error> {
  const reader = useReflectedEntityDataReader();

  return useQuery({
    ...options,
    queryKey: options?.queryKey ?? getReflectedEntityDataQueryKey(query),
    queryFn: () => reader.readEntityData(query),
  });
}
