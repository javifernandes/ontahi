import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import {
  createDisabledTodoAuthentication,
  createTodoPassportAuthentication,
  type TodoAuthenticatedUser,
} from '../src/authentication.js';

describe('Todo Passport host adapter', () => {
  it('maps the provider user to a narrow Ontahi Principal', () => {
    const authentication = createTodoPassportAuthentication({
      github: {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        callbackUrl: 'http://localhost:3001/auth/github/callback',
      },
      sessionSecret: 'tests',
    });
    const user: TodoAuthenticatedUser = {
      subject: 'github-user-123',
      username: 'ontahi-dev',
      displayName: 'Ontahi Dev',
    };

    expect(authentication.principal({ user } as unknown as Request)).toEqual({
      subject: 'github-user-123',
      kind: 'user',
      issuer: 'https://github.com',
    });
    expect(authentication.principal({} as Request)).toBeNull();
  });

  it('exposes an explicit public mode without inventing a Principal', () => {
    const authentication = createDisabledTodoAuthentication();

    expect(authentication.mode).toBe('disabled');
    expect(authentication.principal({} as Request)).toBeNull();
  });
});
