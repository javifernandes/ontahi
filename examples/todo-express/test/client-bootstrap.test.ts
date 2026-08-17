import { describe, expect, it, vi } from 'vitest';

import { loadAuthenticationSession, loadTodoRuntime } from '../client/src/todo-app/bootstrap.js';
import { canDeleteTodoList } from '../client/src/todo-app/todo-list-state.js';

describe('Todo client bootstrap state', () => {
  it('keeps list deletion disabled until todos are known to be empty', () => {
    expect(canDeleteTodoList({ hasSelectedList: true, isLoading: true, visibleTodoCount: 0 })).toBe(
      false,
    );
    expect(
      canDeleteTodoList({ hasSelectedList: true, isLoading: false, visibleTodoCount: 1 }),
    ).toBe(false);
    expect(
      canDeleteTodoList({ hasSelectedList: true, isLoading: false, visibleTodoCount: 0 }),
    ).toBe(true);
  });

  it('turns failed runtime and authentication requests into explicit error state', async () => {
    const failedRequest = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn(),
    }) as unknown as typeof fetch;
    const invalidJsonRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
    }) as unknown as typeof fetch;

    await expect(loadTodoRuntime(failedRequest)).resolves.toEqual({ status: 'error' });
    await expect(loadAuthenticationSession(invalidJsonRequest)).resolves.toEqual({
      status: 'error',
    });
  });

  it('preserves successful bootstrap values', async () => {
    const runtimeRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ storage: 'postgres' }),
    }) as unknown as typeof fetch;
    const authenticationRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ mode: 'github', authenticated: false }),
    }) as unknown as typeof fetch;

    await expect(loadTodoRuntime(runtimeRequest)).resolves.toEqual({
      status: 'ready',
      value: { storage: 'postgres' },
    });
    await expect(loadAuthenticationSession(authenticationRequest)).resolves.toEqual({
      status: 'ready',
      value: { mode: 'github', authenticated: false },
    });
  });
});
