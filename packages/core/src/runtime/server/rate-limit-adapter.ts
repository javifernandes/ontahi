import type { RateLimitPolicy } from './concerns/rate-limit-policy.js';
import type { RateLimitResult, ServerRuntimeRateLimitAdapter } from './config-types.js';

const RATE_LIMIT_PREFIX = 'ratelimit';
const RATE_LIMIT_EXCEEDED_ERROR = 'Rate limit exceeded. Try again later.';
const RATE_LIMIT_TEMPORARILY_UNAVAILABLE_ERROR = 'Rate limiting is temporarily unavailable.';

const RATE_LIMIT_WINDOW_UNITS: Record<string, number> = {
  ms: 1 / 1000,
  msec: 1 / 1000,
  msecs: 1 / 1000,
  millisecond: 1 / 1000,
  milliseconds: 1 / 1000,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86400,
  day: 86400,
  days: 86400,
};

export interface RateLimitCounterStore {
  incrementCounter: (key: string, ttlSeconds: number) => Promise<number>;
  decrementCounter: (key: string) => Promise<number | void>;
}

export interface AcquireRateLimitErrorContext {
  error: unknown;
  policy: RateLimitPolicy;
  policyId: string;
  key: string;
  limit: number;
  window: string;
}

export interface ReleaseRateLimitErrorContext {
  error: unknown;
  policy: RateLimitPolicy;
  policyId: string;
  key: string;
}

export interface CreateStoreBackedRateLimitAdapterOptions {
  store: RateLimitCounterStore;
  keyPrefix?: string;
  exceededError?: string;
  temporarilyUnavailableError?: string;
  onAcquireError?: (
    context: AcquireRateLimitErrorContext,
  ) => Promise<RateLimitResult> | RateLimitResult;
  onReleaseError?: (context: ReleaseRateLimitErrorContext) => Promise<void> | void;
}

type InMemoryCounter = {
  value: number;
  expiresAt: number;
};

export const parseRateLimitWindowToSeconds = (window: string): number => {
  const normalized = window.trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/i);

  if (!match) {
    throw new Error(`Invalid rate limit window: ${window}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = RATE_LIMIT_WINDOW_UNITS[unit];

  if (!amount || !multiplier) {
    throw new Error(`Invalid rate limit window: ${window}`);
  }

  const totalSeconds = Math.floor(amount * multiplier);
  if (totalSeconds < 1) {
    throw new Error(`Invalid rate limit window: ${window}`);
  }

  return totalSeconds;
};

export const getRateLimitPolicyId = (policy: RateLimitPolicy) => policy.id ?? 'anonymous';

export const buildRateLimitCounterKey = (
  policyId: string,
  key: string,
  prefix = RATE_LIMIT_PREFIX,
): string => `${prefix}:${policyId}:key:${key}`;

export const createInMemoryRateLimitCounterStore = (): RateLimitCounterStore => {
  const counters = new Map<string, InMemoryCounter>();

  const getCurrentCounter = (key: string): InMemoryCounter | undefined => {
    const current = counters.get(key);

    if (!current) {
      return undefined;
    }

    if (current.expiresAt <= Date.now()) {
      counters.delete(key);
      return undefined;
    }

    return current;
  };

  return {
    incrementCounter: async (key, ttlSeconds) => {
      const current = getCurrentCounter(key);

      if (!current) {
        counters.set(key, {
          value: 1,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
        return 1;
      }

      current.value += 1;
      counters.set(key, current);
      return current.value;
    },
    decrementCounter: async key => {
      const current = getCurrentCounter(key);

      if (!current) {
        return 0;
      }

      current.value -= 1;

      if (current.value <= 0) {
        counters.delete(key);
        return 0;
      }

      counters.set(key, current);
      return current.value;
    },
  };
};

export const createStoreBackedRateLimitAdapter = (
  options: CreateStoreBackedRateLimitAdapterOptions,
): ServerRuntimeRateLimitAdapter => ({
  acquireSlot: async (policy, key) => {
    const { limit, window } = policy;
    const policyId = getRateLimitPolicyId(policy);

    try {
      const usage = await options.store.incrementCounter(
        buildRateLimitCounterKey(policyId, key, options.keyPrefix),
        parseRateLimitWindowToSeconds(window),
      );
      const remaining = Math.max(0, limit - usage);

      return usage <= limit
        ? { allowed: true, remaining }
        : {
            allowed: false,
            remaining,
            error: options.exceededError ?? RATE_LIMIT_EXCEEDED_ERROR,
          };
    } catch (error) {
      if (options.onAcquireError) {
        return options.onAcquireError({
          error,
          policy,
          policyId,
          key,
          limit,
          window,
        });
      }

      return {
        allowed: false,
        remaining: 0,
        error: options.temporarilyUnavailableError ?? RATE_LIMIT_TEMPORARILY_UNAVAILABLE_ERROR,
      };
    }
  },
  releaseSlot: async (policy, key) => {
    const policyId = getRateLimitPolicyId(policy);

    try {
      await options.store.decrementCounter(
        buildRateLimitCounterKey(policyId, key, options.keyPrefix),
      );
    } catch (error) {
      await options.onReleaseError?.({
        error,
        policy,
        policyId,
        key,
      });
    }
  },
});
