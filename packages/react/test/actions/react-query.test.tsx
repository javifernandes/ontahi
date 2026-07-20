import { attachActionRuntime } from '@ontahi/core/runtime/actions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { useAction, useServerMutation, useServerQuery } from '../../src/actions/index.js';

const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return QueryWrapper;
};

describe('useAction', () => {
  it('tracks successful execution and lifecycle callbacks', async () => {
    const action = vi.fn().mockResolvedValue({ data: { id: 'thread-1' } });
    const onExecute = vi.fn();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    const { result } = renderHook(() =>
      useAction(action, {
        onExecute,
        onSuccess,
        onSettled,
      }),
    );

    let response: { data?: { id: string } } | undefined;
    await act(async () => {
      response = await result.current.executeAsync({ body: 'Hello' });
    });

    expect(action).toHaveBeenCalledWith({ body: 'Hello' });
    expect(response).toEqual({ data: { id: 'thread-1' } });
    expect(result.current.input).toEqual({ body: 'Hello' });
    expect(result.current.result).toEqual({ data: { id: 'thread-1' } });
    expect(result.current.hasSucceeded).toBe(true);
    expect(result.current.hasErrored).toBe(false);
    expect(result.current.status).toBe('hasSucceeded');
    expect(onExecute).toHaveBeenCalledWith({ input: { body: 'Hello' } });
    expect(onSuccess).toHaveBeenCalledWith({
      data: { id: 'thread-1' },
      input: { body: 'Hello' },
    });
    expect(onSettled).toHaveBeenCalledWith({
      result: { data: { id: 'thread-1' } },
      input: { body: 'Hello' },
    });
  });

  it('treats server and validation results as action errors', async () => {
    const action = vi.fn().mockResolvedValue({
      serverError: 'Nope',
      validationErrors: {
        formErrors: ['Bad input'],
      },
    });
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAction(action, {
        onError,
      }),
    );

    await act(async () => {
      await result.current.executeAsync({ id: '1' });
    });

    expect(result.current.hasErrored).toBe(true);
    expect(result.current.hasSucceeded).toBe(false);
    expect(result.current.status).toBe('hasErrored');
    expect(onError).toHaveBeenCalledWith({
      error: {
        serverError: 'Nope',
        validationErrors: {
          formErrors: ['Bad input'],
        },
      },
      input: { id: '1' },
    });
  });

  it('rethrows thrown errors and resets the stored result', async () => {
    const action = vi.fn().mockRejectedValue(new Error('Boom'));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAction(action, {
        onError,
      }),
    );

    let thrownError: Error | null = null;

    await act(async () => {
      try {
        await result.current.executeAsync({ id: '1' });
      } catch (error) {
        thrownError = error as Error;
      }
    });

    expect(thrownError).toEqual(expect.objectContaining({ message: 'Boom' }));

    await waitFor(() => {
      expect(result.current.result).toEqual({});
      expect(result.current.hasErrored).toBe(true);
      expect(result.current.status).toBe('hasErrored');
    });

    expect(onError).toHaveBeenCalledWith({
      error: expect.objectContaining({
        thrownError: expect.objectContaining({ message: 'Boom' }),
      }),
      input: { id: '1' },
    });
  });

  it('keeps only the latest request result when requests resolve out of order', async () => {
    let resolveFirst!: (value: { data: { id: string } }) => void;
    let resolveSecond!: (value: { data: { id: string } }) => void;

    const action = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = resolve;
          }),
      );

    const { result } = renderHook(() => useAction(action));

    let firstPromise!: Promise<{ data?: { id: string } }>;
    let secondPromise!: Promise<{ data?: { id: string } }>;

    await act(async () => {
      firstPromise = result.current.executeAsync({ id: 'first' });
      secondPromise = result.current.executeAsync({ id: 'second' });
    });

    await act(async () => {
      resolveSecond({ data: { id: 'second' } });
      await secondPromise;
    });

    await waitFor(() => {
      expect(result.current.result).toEqual({ data: { id: 'second' } });
    });

    await act(async () => {
      resolveFirst({ data: { id: 'first' } });
      await firstPromise;
    });

    expect(result.current.result).toEqual({ data: { id: 'second' } });
    expect(result.current.input).toEqual({ id: 'second' });
  });

  it('resets back to the idle state', async () => {
    const action = vi.fn().mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useAction(action));

    await act(async () => {
      await result.current.executeAsync({ ok: true });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.input).toBeUndefined();
    expect(result.current.result).toEqual({});
    expect(result.current.hasSucceeded).toBe(false);
    expect(result.current.hasErrored).toBe(false);
  });
});

describe('useServerQuery', () => {
  it('preserves the input type from attached runtime metadata', () => {
    const untypedAction = vi.fn().mockResolvedValue({
      data: { notifications: [], unreadCount: 0 },
    }) as any;

    const action = attachActionRuntime(untypedAction, {
      feature: 'notifications',
      actionName: 'listNotifications',
      requiresAuth: true,
      queryKeyPrefix: ['notifications', 'listNotifications'],
      invalidationQueryKeyPrefix: ['notifications', 'list'],
      getQueryKey: (input: { limit?: number } | undefined) =>
        ['notifications', 'list', input ?? {}] as const,
    });

    expectTypeOf<Parameters<typeof action>[0]>().toEqualTypeOf<{ limit?: number } | undefined>();
  });

  it('derives the query key from the action metadata and returns typed data', async () => {
    const action = attachActionRuntime(
      vi.fn().mockResolvedValue({
        data: { notifications: [], unreadCount: 3 },
      }),
      {
        feature: 'notifications',
        actionName: 'listNotifications',
        requiresAuth: true,
        queryKeyPrefix: ['notifications', 'listNotifications'],
        getQueryKey: (input: { limit: number }) => ['notifications', 'list', input] as const,
      },
    );

    const { result } = renderHook(
      () =>
        useServerQuery({
          action,
          input: { limit: 8 },
        }),
      {
        wrapper: createQueryWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ notifications: [], unreadCount: 3 });
    });

    expect(action).toHaveBeenCalledWith({ limit: 8 });
  });
});

describe('useServerMutation', () => {
  it('invalidates declared queries before calling user onSuccess', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    queryClient.invalidateQueries = invalidateQueries;

    function QueryWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const action = attachActionRuntime(
      vi.fn().mockResolvedValue({ data: { notificationId: 'notification-1' } }),
      {
        feature: 'notifications',
        actionName: 'markNotificationRead',
        requiresAuth: true,
        queryKeyPrefix: ['notifications', 'markNotificationRead'],
        getAffectedQueryKeys: () => [['notifications'], ['notifications', 'listNotifications']],
      },
    );
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useServerMutation(action, { onSuccess }), {
      wrapper: QueryWrapper,
    });

    await act(async () => {
      await result.current.executeAsync({ notificationId: 'notification-1' });
    });

    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['notifications'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['notifications', 'listNotifications'],
    });
    expect(onSuccess).toHaveBeenCalledWith({
      data: { notificationId: 'notification-1' },
      input: { notificationId: 'notification-1' },
    });
  });
});
