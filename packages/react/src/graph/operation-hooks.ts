'use client';

import type {
  AnyEntityRef,
  DomainOperationInvocation as OperationInvocation,
} from '@ontahi/core/data-graph';
import type { TaskRunRef } from '@ontahi/core/runtime/contracts';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  GraphPermission,
  OperationBridgeAction,
  OperationInvocationResult,
} from '../actions/index.js';
import {
  operationBridgeErrored,
  resolveOperationBridgeInvalidationQueryKeys,
  resolveOperationBridgeQueryKey,
  toOperationInvocationResult,
  unwrapOperationInvocationValue,
  useAction,
} from '../actions/index.js';

import {
  useDefaultOperationBridgeAdapter,
  useGraphClientCache,
  useGraphClientCacheVersion,
  useReflectedOperationInvoker,
} from './context.js';
import {
  getOperationClientCacheKey,
  invalidateOperationCacheRefs,
  invalidateReactQueryCachesContainingRefs,
  readInitialOperationCacheValueFromCache,
  reconcileOperationOutput,
} from './operation-cache.js';
import type {
  ClientOperationLike,
  DurableOperationHookResult,
  DurableOperationLike,
  GraphClientCache,
  OperationHookOptions,
  OperationHookResult,
  OperationInfiniteQueryOptions,
  OperationQueryOptions,
  OperationRunner,
  ReflectedOperationLike,
} from './operation-types.js';

export const getOperationQueryKey = <TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
  input: TInput,
): QueryKey => resolveOperationBridgeQueryKey(operation, input);

const getOperationCacheAwareQueryKey = <TInput, TData>(
  clientCache: GraphClientCache,
  operation: ClientOperationLike<TInput, TData>,
  input: TInput,
): QueryKey =>
  getOperationClientCacheKey(clientCache, operation, input, getOperationQueryKey(operation, input));

export function useOperation<TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
  options?: OperationHookOptions<TInput, TData>,
): OperationHookResult<TInput, TData> {
  const adapter = useDefaultOperationBridgeAdapter();
  const clientCache = useGraphClientCache();
  const queryClient = useQueryClient();
  const action = adapter.useBridgeAction<TInput, TData>(
    operation as Parameters<typeof adapter.useBridgeAction<TInput, TData>>[0],
  ) as OperationBridgeAction<TInput, TData>;
  const transport = useAction(action);
  const executeTransportAsync = transport.executeAsync;
  const resetTransport = transport.reset;
  const optionsRef = useRef(options);
  const [result, setResult] = useState<OperationInvocationResult<TData>>();

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const executeAsync = useCallback(
    async (input: TInput) => {
      const currentOptions = optionsRef.current;

      await currentOptions?.onExecute?.({ input });

      let invocation: OperationInvocationResult<TData>;

      try {
        invocation = toOperationInvocationResult(await executeTransportAsync(input));
      } catch (error) {
        invocation = operationBridgeErrored(
          error instanceof Error ? error.message : 'Graph operation bridge failed.',
        ) as OperationInvocationResult<TData>;
      }

      if (invocation.ok) {
        let affectedCacheRefs: AnyEntityRef[] = [];

        if (currentOptions?.invalidateOnSuccess ?? true) {
          affectedCacheRefs = invalidateOperationCacheRefs(
            clientCache,
            operation,
            input,
            invocation.value,
          );
        }

        invocation = {
          ...invocation,
          value: reconcileOperationOutput(clientCache, operation, invocation.value),
        };

        setResult(invocation);

        await currentOptions?.onSuccess?.({
          input,
          value: invocation.value,
          result: invocation,
        });

        if (currentOptions?.invalidateOnSuccess ?? true) {
          await Promise.all([
            invalidateReactQueryCachesContainingRefs(queryClient, affectedCacheRefs),
            ...resolveOperationBridgeInvalidationQueryKeys(operation, input).map(queryKey =>
              queryClient.invalidateQueries({ queryKey }),
            ),
          ]);
        }
      } else {
        setResult(invocation);

        await currentOptions?.onError?.({
          input,
          error: invocation,
          result: invocation,
        });
      }

      await currentOptions?.onSettled?.({
        input,
        result: invocation,
      });

      return invocation;
    },
    [clientCache, executeTransportAsync, operation, queryClient],
  );

  const execute = useCallback(
    (input: TInput) => {
      void executeAsync(input);
    },
    [executeAsync],
  );

  const reset = useCallback(() => {
    resetTransport();
    setResult(undefined);
  }, [resetTransport]);

  const hasErrored = Boolean(result && !result.ok) || transport.hasErrored;
  const hasSucceeded = Boolean(result?.ok) && !transport.isExecuting;
  const status = transport.isIdle
    ? 'idle'
    : transport.isExecuting
      ? 'executing'
      : hasErrored
        ? 'hasErrored'
        : 'hasSucceeded';

  return {
    execute,
    executeAsync,
    input: transport.input,
    result,
    value: result?.ok ? result.value : undefined,
    reset,
    status,
    isIdle: transport.isIdle,
    isExecuting: transport.isExecuting,
    isTransitioning: transport.isTransitioning,
    isPending: transport.isPending,
    hasSucceeded,
    hasErrored,
  };
}

export function useDurableOperation<TInput, TResult = unknown>(
  operation: DurableOperationLike<TInput, TResult>,
  options?: OperationHookOptions<TInput, TaskRunRef>,
): DurableOperationHookResult<TInput, TResult> {
  const mutation = useOperation<TInput, TaskRunRef>(
    operation as ClientOperationLike<TInput, TaskRunRef>,
    options,
  );

  return {
    ...mutation,
    durable: operation.durable,
  };
}

export function useOperationQuery<TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
  input: TInput,
  options?: OperationQueryOptions<TData>,
): UseQueryResult<TData, Error> {
  const adapter = useDefaultOperationBridgeAdapter();
  const clientCache = useGraphClientCache();
  const cacheVersion = useGraphClientCacheVersion(clientCache);
  const action = adapter.useBridgeAction<TInput, TData>(
    operation as Parameters<typeof adapter.useBridgeAction<TInput, TData>>[0],
  ) as OperationBridgeAction<TInput, TData>;
  const {
    initialData: providedInitialData,
    initialDataUpdatedAt,
    placeholderData,
    ...queryOptions
  } = options ?? {};
  const hasProvidedInitialData = Boolean(options && 'initialData' in options);
  const queryKey = getOperationCacheAwareQueryKey(clientCache, operation, input);
  const cacheKey = queryKey;
  const initialCacheValue = hasProvidedInitialData
    ? undefined
    : readInitialOperationCacheValueFromCache(clientCache, operation, input, cacheKey);
  const initialData = hasProvidedInitialData ? providedInitialData : initialCacheValue?.value;

  return useQuery({
    ...queryOptions,
    initialData,
    initialDataUpdatedAt: initialDataUpdatedAt ?? initialCacheValue?.initialDataUpdatedAt,
    placeholderData: placeholderData as UseQueryOptions<
      unknown,
      Error,
      TData,
      QueryKey
    >['placeholderData'],
    queryKey,
    queryFn: async () =>
      clientCache.writeOutput(
        cacheKey,
        operation.graphOutput,
        unwrapOperationInvocationValue(toOperationInvocationResult(await action(input))),
      ).value,
    select: value => {
      void cacheVersion;
      return clientCache.denormalizeOutput(operation.graphOutput, value) as TData;
    },
  });
}

export function useOperationInfiniteQuery<TInput, TData, TPageParam>(
  operation: ClientOperationLike<TInput, TData>,
  input: TInput,
  options: OperationInfiniteQueryOptions<TInput, TData, TPageParam>,
) {
  const adapter = useDefaultOperationBridgeAdapter();
  const clientCache = useGraphClientCache();
  const cacheVersion = useGraphClientCacheVersion(clientCache);
  const action = adapter.useBridgeAction<TInput, TData>(
    operation as Parameters<typeof adapter.useBridgeAction<TInput, TData>>[0],
  ) as OperationBridgeAction<TInput, TData>;
  const { getPageInput, getNextPageParam, getPreviousPageParam, ...queryOptions } = options;
  const denormalizePage = useCallback(
    (value: unknown) => clientCache.denormalizeOutput(operation.graphOutput, value) as TData,
    [clientCache, operation],
  );

  return useInfiniteQuery<unknown, Error, InfiniteData<TData, TPageParam>, QueryKey, TPageParam>({
    ...queryOptions,
    queryKey: getOperationCacheAwareQueryKey(clientCache, operation, input),
    queryFn: async ({ pageParam }) =>
      clientCache.normalizeOutput(
        operation.graphOutput,
        unwrapOperationInvocationValue(
          toOperationInvocationResult(
            await action(
              getPageInput({
                input,
                pageParam: pageParam as TPageParam,
              }),
            ),
          ),
        ),
      ).value,
    getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) =>
      getNextPageParam(
        denormalizePage(lastPage),
        allPages.map(denormalizePage),
        lastPageParam,
        allPageParams,
      ),
    getPreviousPageParam: getPreviousPageParam
      ? (firstPage, allPages, firstPageParam, allPageParams) =>
          getPreviousPageParam(
            denormalizePage(firstPage),
            allPages.map(denormalizePage),
            firstPageParam,
            allPageParams,
          )
      : undefined,
    select: data => {
      void cacheVersion;

      return {
        pageParams: data.pageParams,
        pages: data.pages.map(denormalizePage),
      };
    },
  });
}

export function useGraphPermission<TInput, TData>(
  invocation: OperationInvocation<TInput, TData>,
  options?: {
    enabled?: boolean;
    queryKey?: QueryKey;
  },
): UseQueryResult<GraphPermission, Error> {
  const adapter = useDefaultOperationBridgeAdapter();

  return adapter.usePermission(
    invocation.operation as ClientOperationLike<TInput, TData>,
    invocation.input,
    options,
  );
}

export function useOperationRunner<TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
): OperationRunner<TInput, TData> {
  const adapter = useDefaultOperationBridgeAdapter();
  const clientCache = useGraphClientCache();
  const action = adapter.useBridgeAction<TInput, TData>(
    operation as Parameters<typeof adapter.useBridgeAction<TInput, TData>>[0],
  ) as OperationBridgeAction<TInput, TData>;

  return useCallback(
    async (input: TInput) => {
      const result = toOperationInvocationResult(await action(input));

      if (result.ok) {
        return {
          ...result,
          value: reconcileOperationOutput(clientCache, operation, result.value),
        };
      }

      return result;
    },
    [action, clientCache, operation],
  );
}

export function useReflectedOperationRunner<TInput = unknown, TData = unknown>(
  operation: ReflectedOperationLike<TInput, TData>,
): OperationRunner<TInput, TData> {
  const invoker = useReflectedOperationInvoker();

  return useCallback(
    (input: TInput) =>
      invoker.invokeOperation<TInput, TData>({
        operationId: operation.id,
        operation,
        input,
      }),
    [invoker, operation],
  );
}
