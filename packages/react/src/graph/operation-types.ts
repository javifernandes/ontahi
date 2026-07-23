import type {
  ClientDomainOperationDeclaration as ClientOperationDeclaration,
  DurableOperationMetadata,
  GraphClientCache,
  ReflectedOperationDescriptor,
} from '@ontahi/core/data-graph';
import type { TaskRunRef, TaskSnapshot } from '@ontahi/core/runtime/contracts';
import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseQueryOptions,
} from '@tanstack/react-query';

import type { OperationInvocationFailure, OperationInvocationResult } from '../actions/index.js';

export type { GraphClientCache };

export type ClientOperationLike<TInput = unknown, TData = unknown> = ClientOperationDeclaration<
  TInput,
  TData
> & {
  id: string;
  entityName: string;
  name: string;
};

export type ReflectedOperationLike<
  TInput = unknown,
  TData = unknown,
> = ReflectedOperationDescriptor<TInput, TData>;

export type DurableOperationLike<TInput = unknown, TResult = unknown> = ClientOperationLike<
  TInput,
  TResult
> & {
  durable: DurableOperationMetadata<TInput, TResult>;
};

export type DurableOperationHookResult<TInput, TResult> = OperationHookResult<
  TInput,
  TaskRunRef
> & {
  durable: DurableOperationMetadata<TInput, TResult>;
  snapshot: TaskSnapshot<TResult> | undefined;
  progress: TaskSnapshot<TResult>['progress'];
  finalValue: TResult | undefined;
  runError: TaskSnapshot<TResult>['error'];
  isQueued: boolean;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  isRefreshingRun: boolean;
};

export type MaybePromise<T> = T | Promise<T>;

export type OperationHookOptions<TInput, TData> = {
  onExecute?: (args: { input: TInput }) => MaybePromise<unknown>;
  onSuccess?: (args: {
    input: TInput;
    value: TData;
    result: Extract<OperationInvocationResult<TData>, { ok: true }>;
  }) => MaybePromise<unknown>;
  onError?: (args: {
    input: TInput;
    error: OperationInvocationFailure;
    result: OperationInvocationFailure;
  }) => MaybePromise<unknown>;
  onSettled?: (args: {
    input: TInput;
    result: OperationInvocationResult<TData>;
  }) => MaybePromise<unknown>;
  invalidateOnSuccess?: boolean;
};

export type DurableOperationHookOptions<TInput> = OperationHookOptions<TInput, TaskRunRef> & {
  pollIntervalMs?: number;
};

export type OperationInputArgs<TInput> = [TInput] extends [void] ? [] : [input: TInput];

export type OperationHookResult<TInput, TData> = {
  execute: (...args: OperationInputArgs<TInput>) => void;
  executeAsync: (...args: OperationInputArgs<TInput>) => Promise<OperationInvocationResult<TData>>;
  input: TInput | undefined;
  result: OperationInvocationResult<TData> | undefined;
  value: TData | undefined;
  reset: () => void;
  status: 'idle' | 'executing' | 'hasSucceeded' | 'hasErrored';
  isIdle: boolean;
  isExecuting: boolean;
  isTransitioning: boolean;
  isPending: boolean;
  hasSucceeded: boolean;
  hasErrored: boolean;
};

export type OperationRunner<TInput, TData> = (
  input: TInput,
) => Promise<OperationInvocationResult<TData>>;

export type OperationQueryOptions<TData> = Omit<
  UseQueryOptions<unknown, Error, TData, QueryKey>,
  'placeholderData' | 'queryFn' | 'queryKey' | 'select'
> & {
  placeholderData?: TData | ((previousData: TData | undefined) => TData | undefined);
};

export type OperationInfinitePageParamResolver<TData, TPageParam> = (
  page: TData,
  pages: TData[],
  pageParam: TPageParam,
  allPageParams: TPageParam[],
) => TPageParam | null | undefined;

export type OperationInfiniteQueryOptions<TInput, TData, TPageParam> = Omit<
  UseInfiniteQueryOptions<unknown, Error, InfiniteData<TData, TPageParam>, QueryKey, TPageParam>,
  'getNextPageParam' | 'getPreviousPageParam' | 'queryFn' | 'queryKey' | 'select'
> & {
  getPageInput: (args: { input: TInput; pageParam: TPageParam }) => TInput;
  getNextPageParam: OperationInfinitePageParamResolver<TData, TPageParam>;
  getPreviousPageParam?: OperationInfinitePageParamResolver<TData, TPageParam>;
};
