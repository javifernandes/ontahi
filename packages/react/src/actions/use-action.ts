'use client';

import { hasActionError, type ActionResultLike } from '@ontahi/core/runtime/actions';
import { toError } from '@ontahi/core/value/error';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

export type MaybePromise<T> = T | Promise<T>;

export type { ActionResultLike };

export type ActionFnLike<TResult extends ActionResultLike = ActionResultLike> = (
  input: any,
) => Promise<TResult>;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type InferInput<TAction extends ActionFnLike> = Parameters<TAction>[0];
export type InferResult<TAction extends ActionFnLike> = Awaited<ReturnType<TAction>>;
export type InferData<TAction extends ActionFnLike> =
  InferResult<TAction> extends { data?: infer TData } ? TData : never;

type ActionStatus = 'idle' | 'executing' | 'hasSucceeded' | 'hasErrored';

export type UseActionOptions<TAction extends ActionFnLike> = {
  onExecute?: (args: { input: InferInput<TAction> }) => MaybePromise<unknown>;
  onSuccess?: (args: {
    data: InferData<TAction>;
    input: InferInput<TAction>;
  }) => MaybePromise<unknown>;
  onError?: (args: {
    error: Omit<InferResult<TAction>, 'data'> & { thrownError?: Error };
    input: InferInput<TAction>;
  }) => MaybePromise<unknown>;
  onSettled?: (args: {
    result: InferResult<TAction>;
    input: InferInput<TAction>;
  }) => MaybePromise<unknown>;
};

export type UseActionResult<TAction extends ActionFnLike> = {
  execute: (input: InferInput<TAction>) => void;
  executeAsync: (input: InferInput<TAction>) => Promise<InferResult<TAction>>;
  input: InferInput<TAction> | undefined;
  result: InferResult<TAction>;
  reset: () => void;
  status: ActionStatus;
  isIdle: boolean;
  isExecuting: boolean;
  isTransitioning: boolean;
  isPending: boolean;
  hasSucceeded: boolean;
  hasErrored: boolean;
};

const EMPTY_RESULT = {} as ActionResultLike;

function useCallbackRef<TCallback extends (...args: any[]) => any>(
  callback: TCallback | undefined,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useMemo(
    () =>
      ((...args: Parameters<TCallback>) => callbackRef.current?.(...args)) as TCallback | undefined,
    [],
  );
}

export function useAction<TAction extends ActionFnLike>(
  action: TAction,
  options?: UseActionOptions<TAction>,
): UseActionResult<TAction> {
  const [isTransitioning, startTransition] = useTransition();
  const [result, setResult] = useState<InferResult<TAction>>(EMPTY_RESULT as InferResult<TAction>);
  const [input, setInput] = useState<InferInput<TAction>>();
  const [isExecuting, setIsExecuting] = useState(false);
  const [thrownError, setThrownError] = useState<Error | null>(null);
  const [isIdle, setIsIdle] = useState(true);
  const requestIdRef = useRef(0);

  const onExecute = useCallbackRef(options?.onExecute);
  const onSuccess = useCallbackRef(options?.onSuccess);
  const onError = useCallbackRef(options?.onError);
  const onSettled = useCallbackRef(options?.onSettled);

  const executeAsync: UseActionResult<TAction>['executeAsync'] = useCallback(
    async (nextInput: InferInput<TAction>): Promise<InferResult<TAction>> => {
      const requestId = ++requestIdRef.current;

      setIsIdle(false);
      setInput(nextInput);
      setIsExecuting(true);
      setThrownError(null);

      await onExecute?.({ input: nextInput });

      try {
        const nextResult = await action(nextInput);
        if (requestId === requestIdRef.current) {
          setResult(nextResult as InferResult<TAction>);
        }

        if (hasActionError(nextResult)) {
          await onError?.({
            error: nextResult as Omit<InferResult<TAction>, 'data'> & { thrownError?: Error },
            input: nextInput,
          });
        } else {
          await onSuccess?.({
            data: nextResult.data as InferData<TAction>,
            input: nextInput,
          });
        }

        await onSettled?.({
          result: nextResult as InferResult<TAction>,
          input: nextInput,
        });

        return nextResult as InferResult<TAction>;
      } catch (error) {
        const thrown = toError(error);
        const errorResult = { thrownError: thrown } as Omit<InferResult<TAction>, 'data'> & {
          thrownError?: Error;
        };

        if (requestId === requestIdRef.current) {
          setResult(EMPTY_RESULT as InferResult<TAction>);
          setThrownError(thrown);
        }

        await onError?.({ error: errorResult, input: nextInput });
        await onSettled?.({
          result: EMPTY_RESULT as InferResult<TAction>,
          input: nextInput,
        });

        throw thrown;
      } finally {
        if (requestId === requestIdRef.current) {
          setIsExecuting(false);
        }
      }
    },
    [action, onError, onExecute, onSettled, onSuccess],
  );

  const execute = useCallback(
    (nextInput: InferInput<TAction>) => {
      startTransition(() => {
        void executeAsync(nextInput).catch(() => {
          return;
        });
      });
    },
    [executeAsync, startTransition],
  );

  const reset = useCallback(() => {
    setIsIdle(true);
    setInput(undefined);
    setResult(EMPTY_RESULT as InferResult<TAction>);
    setThrownError(null);
  }, []);

  const hasErrored = Boolean(thrownError) || hasActionError(result);
  const hasSucceeded = !isIdle && !isExecuting && !hasErrored;
  const status: ActionStatus = isIdle
    ? 'idle'
    : isExecuting
      ? 'executing'
      : hasErrored
        ? 'hasErrored'
        : 'hasSucceeded';

  return {
    execute,
    executeAsync,
    input,
    result,
    reset,
    status,
    isIdle,
    isExecuting,
    isTransitioning,
    isPending: isExecuting || isTransitioning,
    hasSucceeded,
    hasErrored,
  };
}
