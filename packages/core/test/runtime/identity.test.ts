import { describe, expect, it } from 'vitest';

import {
  anonymousExecutionIdentity,
  executionIdentityCacheKey,
  type ExecutionIdentity,
} from '../../src/runtime/identity.js';

describe('execution identity', () => {
  it('provides a stable anonymous identity', () => {
    expect(executionIdentityCacheKey(anonymousExecutionIdentity)).toEqual(['anonymous', null]);
  });

  it('partitions client state by principal and optional application scope', () => {
    const identity: ExecutionIdentity = {
      principal: {
        subject: 'github:123',
        kind: 'user',
        issuer: 'https://github.com',
      },
      cacheScope: { workspaceId: 'workspace-1' },
    };

    expect(executionIdentityCacheKey(identity)).toEqual([
      'principal',
      'user',
      'https://github.com',
      'github:123',
      { workspaceId: 'workspace-1' },
    ]);
  });

  it('returns a detached JSON cache key', () => {
    const cacheScope = { workspaceId: 'workspace-1' };
    const key = executionIdentityCacheKey({ principal: null, cacheScope });

    cacheScope.workspaceId = 'workspace-2';

    expect(key).toEqual(['anonymous', { workspaceId: 'workspace-1' }]);
  });
});
