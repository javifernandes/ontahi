import type { Principal } from '@ontahi/core/runtime/identity';

export type BootstrapState<Value> =
  | { status: 'loading' }
  | { status: 'ready'; value: Value }
  | { status: 'error' };

export type TodoRuntime = {
  storage: 'in-memory' | 'postgres';
};

export type AuthenticationSession = {
  mode: 'disabled' | 'github';
  authenticated: boolean;
  principal?: Principal;
  profile?: {
    username?: string;
    displayName?: string;
  };
};

export const loadTodoRuntime = async (
  fetchRequest: typeof fetch = globalThis.fetch,
): Promise<BootstrapState<TodoRuntime>> => {
  try {
    const response = await fetchRequest('/runtime');
    if (!response.ok) return { status: 'error' };

    return {
      status: 'ready',
      value: (await response.json()) as TodoRuntime,
    };
  } catch {
    return { status: 'error' };
  }
};

export const loadAuthenticationSession = async (
  fetchRequest: typeof fetch = globalThis.fetch,
): Promise<BootstrapState<AuthenticationSession>> => {
  try {
    const response = await fetchRequest('/auth/session');
    if (!response.ok) return { status: 'error' };

    return {
      status: 'ready',
      value: (await response.json()) as AuthenticationSession,
    };
  } catch {
    return { status: 'error' };
  }
};
