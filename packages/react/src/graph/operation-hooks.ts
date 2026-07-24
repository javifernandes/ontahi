'use client';

import type {
  AnyEntityRef,
  DomainOperationInvocation as OperationInvocation,
} from '@ontahi/core/data-graph';
import { normalizeGraphSchemaClientInput } from '@ontahi/core/data-graph';
import type { TaskRunRef, TaskSnapshot } from '@ontahi/core/runtime/contracts';
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
  ClientSchemaOperationLike,
  DurableOperationHookOptions,
  DurableOperationHookResult,
  DurableOperationLike,
  GraphClientCache,
  OperationHookOptions,
  OperationHookResult,
  OperationInfiniteQueryOptions,
  OperationInputArgs,
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
  operation: ClientSchemaOperationLike<TInput, TData>,
  options?: OperationHookOptions<TInput, TData>,
): OperationHookResult<TInput, TData>;
export function useOperation<TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
  options?: OperationHookOptions<TInput, TData>,
): OperationHookResult<TInput, TData>;
export function useOperation<TInput, TData>(
  operation: ClientOperationLike<TInput, TData> | ClientSchemaOperationLike<TInput, TData>,
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
  const [input, setInput] = useState<TInput>();

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const executeInputAsync = useCallback(
    async (input: TInput) => {
      const currentOptions = optionsRef.current;
      const transportInput = operation.input
        ? (normalizeGraphSchemaClientInput(operation.input, input) as TInput)
        : input;
      setInput(input);

      await currentOptions?.onExecute?.({ input });

      let invocation: OperationInvocationResult<TData>;

      try {
        invocation = toOperationInvocationResult(await executeTransportAsync(transportInput));
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
            transportInput,
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
            ...resolveOperationBridgeInvalidationQueryKeys(operation, transportInput).map(
              queryKey => queryClient.invalidateQueries({ queryKey }),
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

  const executeAsync = useCallback(
    (...args: OperationInputArgs<TInput>) => executeInputAsync(args[0] as TInput),
    [executeInputAsync],
  );

  const execute = useCallback(
    (...args: OperationInputArgs<TInput>) => {
      void executeAsync(...args);
    },
    [executeAsync],
  );

  const reset = useCallback(() => {
    resetTransport();
    setResult(undefined);
    setInput(undefined);
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
    input,
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
  options?: DurableOperationHookOptions<TInput>,
): DurableOperationHookResult<TInput, TResult> {
  const adapter = useDefaultOperationBridgeAdapter();
  const queryClient = useQueryClient();
  const mutation = useOperation<TInput, TaskRunRef>(
    operation as ClientOperationLike<TInput, TaskRunRef>,
    { ...options, invalidateOnSuccess: false },
  );
  const runRef = mutation.value;
  const snapshotQuery = useQuery({
    queryKey: ['ontahi-task-run', runRef?.taskId, runRef?.runId],
    enabled: Boolean(runRef && adapter.getTaskSnapshot),
    queryFn: () => {
      if (!runRef || !adapter.getTaskSnapshot) {
        throw new Error('The operation bridge does not provide task snapshot transport.');
      }

      return adapter.getTaskSnapshot<TResult>({ taskId: runRef.taskId, runId: runRef.runId });
    },
    refetchInterval: query => {
      const status = (query.state.data as TaskSnapshot<TResult> | undefined)?.status;
      return status === 'completed' || status === 'failed' || status === 'cancelled'
        ? false
        : (options?.pollIntervalMs ?? 500);
    },
  });
  const snapshot = snapshotQuery.data;
  const invalidatedRunRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      !snapshot ||
      (snapshot.status !== 'completed' &&
        snapshot.status !== 'failed' &&
        snapshot.status !== 'cancelled')
    ) {
      return;
    }

    const runKey = `${snapshot.taskId}:${snapshot.runId}:${snapshot.status}`;
    if (invalidatedRunRef.current === runKey) return;
    invalidatedRunRef.current = runKey;

    if (snapshot.status === 'completed' && (options?.invalidateOnSuccess ?? true)) {
      const invalidationInput = operation.input
        ? (normalizeGraphSchemaClientInput(operation.input, mutation.input) as TInput)
        : (mutation.input as TInput);
      void Promise.all(
        resolveOperationBridgeInvalidationQueryKeys(operation, invalidationInput).map(queryKey =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    }
  }, [mutation.input, operation, options?.invalidateOnSuccess, queryClient, snapshot]);

  const reset = useCallback(() => {
    mutation.reset();
    invalidatedRunRef.current = undefined;
  }, [mutation]);
  const runStatus = snapshot?.status ?? runRef?.status;

  return {
    ...mutation,
    reset,
    durable: operation.durable,
    snapshot,
    progress: snapshot?.progress,
    finalValue: snapshot?.result,
    runError: snapshot?.error,
    isQueued: runStatus === 'queued',
    isRunning: runStatus === 'running',
    isCompleted: runStatus === 'completed',
    isFailed: runStatus === 'failed',
    isCancelled: runStatus === 'cancelled',
    isRefreshingRun: snapshotQuery.isFetching,
    isExecuting:
      mutation.isExecuting ||
      (Boolean(adapter.getTaskSnapshot) && (runStatus === 'queued' || runStatus === 'running')),
  };
}

export function useOperationQuery<TData>(
  operation: ClientOperationLike<void, TData>,
  options?: OperationQueryOptions<TData>,
): UseQueryResult<TData, Error>;
export function useOperationQuery<TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
  input: TInput,
  options?: OperationQueryOptions<TData>,
): UseQueryResult<TData, Error>;
export function useOperationQuery<TInput, TData>(
  operation: ClientOperationLike<TInput, TData>,
  inputOrOptions?: TInput | OperationQueryOptions<TData>,
  providedOptions?: OperationQueryOptions<TData>,
): UseQueryResult<TData, Error> {
  const hasInput = operation.input?.kind !== 'schema.void';
  const input = (hasInput ? inputOrOptions : undefined) as TInput;
  const options = (hasInput ? providedOptions : inputOrOptions) as
    | OperationQueryOptions<TData>
    | undefined;
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
