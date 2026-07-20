'use client';

import {
  ActionResultError,
  getActionInvalidationQueryKeys,
  getActionQueryKey,
  hasActionError,
  type ActionQueryKey,
} from '@ontahi/core/runtime/actions';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
  type InfiniteData,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  useAction,
  type ActionFnLike,
  type InferData,
  type InferInput,
  type NoInfer,
  type UseActionOptions,
} from './use-action.js';

type UseServerQueryOptions<TAction extends ActionFnLike, TSelected = InferData<TAction>> = Omit<
  UseQueryOptions<InferData<TAction>, ActionResultError, TSelected, ActionQueryKey>,
  'queryFn' | 'queryKey'
> & {
  action: TAction;
  input: NoInfer<InferInput<TAction>>;
  key?: ActionQueryKey;
};

type UseServerInfiniteQueryOptions<
  TAction extends ActionFnLike,
  TPageParam,
  TSelected = InfiniteData<InferData<TAction>, TPageParam>,
> = Omit<
  UseInfiniteQueryOptions<
    InferData<TAction>,
    ActionResultError,
    TSelected,
    ActionQueryKey,
    TPageParam
  >,
  'queryFn' | 'queryKey'
> & {
  action: TAction;
  getPageInput: (args: {
    input: NoInfer<InferInput<TAction>>;
    pageParam: TPageParam;
  }) => NoInfer<InferInput<TAction>>;
  input: NoInfer<InferInput<TAction>>;
  key?: ActionQueryKey;
};

const resolveActionQueryKey = <TAction extends ActionFnLike>(
  action: TAction,
  input: InferInput<TAction>,
  key: ActionQueryKey | undefined,
) => {
  const resolvedQueryKey = key ?? getActionQueryKey(action, input);
  if (resolvedQueryKey) {
    return resolvedQueryKey;
  }

  throw new Error(
    'Server queries require either a client-provided key or an action-owned key declaration.',
  );
};

const invalidateActionQueries = async <TAction extends ActionFnLike>(
  queryClient: QueryClient,
  action: TAction,
  args: {
    input: InferInput<TAction>;
    data: InferData<TAction>;
  },
) => {
  const queryKeys = getActionInvalidationQueryKeys(action, {
    input: args.input,
    data: args.data,
  });

  await Promise.all(
    queryKeys.map(queryKey =>
      queryClient.invalidateQueries({
        queryKey,
      }),
    ),
  );
};

export function useServerQuery<TAction extends ActionFnLike, TSelected = InferData<TAction>>(
  options: UseServerQueryOptions<TAction, TSelected>,
) {
  const { action, input, key, ...queryOptions } = options;
  const queryKey = useMemo(() => resolveActionQueryKey(action, input, key), [action, input, key]);

  return useQuery({
    ...queryOptions,
    queryKey,
    queryFn: async () => {
      const result = await action(input);
      if (hasActionError(result)) {
        throw new ActionResultError(result);
      }

      return result.data as InferData<TAction>;
    },
  });
}

export function useServerInfiniteQuery<
  TAction extends ActionFnLike,
  TPageParam,
  TSelected = InfiniteData<InferData<TAction>, TPageParam>,
>(options: UseServerInfiniteQueryOptions<TAction, TPageParam, TSelected>) {
  const { action, getPageInput, input, key, ...queryOptions } = options;
  const queryKey = useMemo(() => resolveActionQueryKey(action, input, key), [action, input, key]);

  return useInfiniteQuery({
    ...queryOptions,
    queryKey,
    queryFn: async ({ pageParam }) => {
      const result = await action(
        getPageInput({
          input,
          pageParam: pageParam as TPageParam,
        }),
      );

      if (hasActionError(result)) {
        throw new ActionResultError(result);
      }

      return result.data as InferData<TAction>;
    },
  });
}

type UseServerMutationOptions<TAction extends ActionFnLike> = UseActionOptions<TAction> & {
  invalidateOnSuccess?: boolean;
};

export function useServerMutation<TAction extends ActionFnLike>(
  action: TAction,
  options?: UseServerMutationOptions<TAction>,
) {
  const queryClient = useQueryClient();
  const invalidateOnSuccess = options?.invalidateOnSuccess ?? true;

  const onSuccess = useCallback(
    async (args: { data: InferData<TAction>; input: InferInput<TAction> }) => {
      if (invalidateOnSuccess) {
        await invalidateActionQueries(queryClient, action, args);
      }

      await options?.onSuccess?.(args);
    },
    [action, invalidateOnSuccess, options, queryClient],
  );

  return useAction(action, {
    onExecute: options?.onExecute,
    onError: options?.onError,
    onSettled: options?.onSettled,
    onSuccess,
  });
}
