'use client';

import type {
  ReflectedEntityDataQuery,
  ReflectedEntityDataResult,
  ReflectedRelatedEntityDataQuery,
} from '@ontahi/core/data-graph';
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useReflectedEntityDataReader, useReflectedRelatedEntityDataReader } from './context.js';

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

export const getReflectedRelatedEntityDataQueryKey = (
  query: ReflectedRelatedEntityDataQuery,
): QueryKey => ['graph', 'reflected-related-entity-data', query];

export function useReflectedRelatedEntityDataQuery(
  query: ReflectedRelatedEntityDataQuery,
  options?: ReflectedEntityDataQueryOptions,
): UseQueryResult<ReflectedEntityDataResult, Error> {
  const reader = useReflectedRelatedEntityDataReader();

  return useQuery({
    ...options,
    queryKey: options?.queryKey ?? getReflectedRelatedEntityDataQueryKey(query),
    queryFn: () => reader.readRelatedEntityData(query),
  });
}
