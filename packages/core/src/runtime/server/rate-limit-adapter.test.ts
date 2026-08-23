import { describe, expect, it, vi } from 'vitest';

import {
  buildRateLimitCounterKey,
  createInMemoryRateLimitCounterStore,
  createStoreBackedRateLimitAdapter,
  getRateLimitPolicyId,
  parseRateLimitWindowToSeconds,
} from './index.js';

describe('rate-limit adapter', () => {
  it('parses supported window strings to seconds', () => {
    expect(parseRateLimitWindowToSeconds('1 hour')).toBe(3600);
    expect(parseRateLimitWindowToSeconds('5 minutes')).toBe(300);
    expect(parseRateLimitWindowToSeconds('30s')).toBe(30);
  });

  it('rejects invalid or too-small windows', () => {
    expect(() => parseRateLimitWindowToSeconds('nonsense')).toThrow('Invalid rate limit window');
    expect(() => parseRateLimitWindowToSeconds('0.5 seconds')).toThrow('Invalid rate limit window');
  });

  it('builds stable policy ids and storage keys', () => {
    expect(getRateLimitPolicyId({ limit: 10, window: '1 hour' })).toBe('anonymous');
    expect(getRateLimitPolicyId({ id: 'search', limit: 10, window: '1 hour' })).toBe('search');
    expect(buildRateLimitCounterKey('search', 'user-1')).toBe('ratelimit:search:key:user-1');
  });

  it('limits and refunds using the in-memory store', async () => {
    const store = createInMemoryRateLimitCounterStore();
    const adapter = createStoreBackedRateLimitAdapter({ store });
    const policy = { id: 'search', limit: 2, window: '1 hour' };

    await expect(adapter.acquireSlot(policy, 'user-1')).resolves.toEqual({
      allowed: true,
      remaining: 1,
    });
    await expect(adapter.acquireSlot(policy, 'user-1')).resolves.toEqual({
      allowed: true,
      remaining: 0,
    });

    await expect(adapter.releaseSlot(policy, 'user-1')).resolves.toBeUndefined();
    await expect(adapter.acquireSlot(policy, 'user-1')).resolves.toEqual({
      allowed: true,
      remaining: 0,
    });

    await expect(adapter.acquireSlot(policy, 'user-1')).resolves.toEqual({
      allowed: false,
      remaining: 0,
      error: 'Rate limit exceeded. Try again later.',
    });
  });

  it('delegates backend failures to host-specific handlers', async () => {
    const onReleaseError = vi.fn();
    const adapter = createStoreBackedRateLimitAdapter({
      store: {
        incrementCounter: async () => {
          throw new Error('backend down');
        },
        decrementCounter: async () => {
          throw new Error('backend down');
        },
      },
      onAcquireError: ({ error }) => ({
        allowed: false,
        remaining: 7,
        error: error instanceof Error ? error.message : 'unknown',
      }),
      onReleaseError,
    });

    await expect(
      adapter.acquireSlot({ id: 'search', limit: 10, window: '1 hour' }, 'user-1'),
    ).resolves.toEqual({
      allowed: false,
      remaining: 7,
      error: 'backend down',
    });

    await expect(
      adapter.releaseSlot({ id: 'search', limit: 10, window: '1 hour' }, 'user-1'),
    ).resolves.toBeUndefined();
    expect(onReleaseError).toHaveBeenCalledWith({
      error: expect.any(Error),
      policy: { id: 'search', limit: 10, window: '1 hour' },
      policyId: 'search',
      key: 'user-1',
    });
  });

  it('uses custom prefix and default temporary-unavailable error when acquire fails', async () => {
    const adapter = createStoreBackedRateLimitAdapter({
      keyPrefix: 'custom',
      store: {
        incrementCounter: async () => {
          throw new Error('backend down');
        },
        decrementCounter: async () => 0,
      },
    });

    await expect(
      adapter.acquireSlot({ id: 'search', limit: 10, window: '1 hour' }, 'user-1'),
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      error: 'Rate limiting is temporarily unavailable.',
    });
  });

  it('uses the configured exceeded error message', async () => {
    const adapter = createStoreBackedRateLimitAdapter({
      exceededError: 'Too many requests',
      store: {
        incrementCounter: async () => 2,
        decrementCounter: async () => 0,
      },
    });

    await expect(
      adapter.acquireSlot({ id: 'search', limit: 1, window: '1 hour' }, 'user-1'),
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      error: 'Too many requests',
    });
  });
});
