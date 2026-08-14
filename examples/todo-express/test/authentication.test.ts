import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import {
  createTodoPassportAuthentication,
  type TodoAuthenticatedUser,
} from '../src/authentication.js';

describe('Todo Passport host adapter', () => {
  it('maps the provider user to a narrow Ontahi Principal', () => {
    const authentication = createTodoPassportAuthentication({ sessionSecret: 'tests' });
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
});
