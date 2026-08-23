import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  byRequester,
  configureServerRuntime,
  input,
  rateLimit,
  RateLimitExceededError,
  resetServerRuntimeForTests,
  type LayerConcernRuntime,
  type ServerRuntimeRateLimitAdapter,
} from './index.js';

type TestInput = {
  bookSlug?: string;
  requesterKey?: string;
  nested?: { id: string };
};

const createRuntime = (inputValue: TestInput): LayerConcernRuntime<TestInput> => ({
  scope: 'tests.runtime.rate-limit',
  telemetrySpanName: 'tests.runtime.rate-limit',
  input: inputValue,
  resources: new Map(),
});

const createAdapter = (
  overrides?: Partial<ServerRuntimeRateLimitAdapter>,
): ServerRuntimeRateLimitAdapter => ({
  acquireSlot: vi.fn(async () => ({ allowed: true, remaining: 4 })),
  releaseSlot: vi.fn(async () => undefined),
  ...overrides,
});

describe('rateLimit concern', () => {
  afterEach(() => {
    resetServerRuntimeForTests();
  });

  it('derives requester keys with trimming and anonymous fallback', () => {
    expect(byRequester({ requesterKey: ' user-1 ' })).toBe('user-1');
    expect(byRequester({ requesterKey: '   ' })).toBe('anonymous');
    expect(byRequester({})).toBe('anonymous');
  });

  it('resolves primitive input keys and rejects missing or object values', () => {
    const runtime = createRuntime({ bookSlug: 'progbook', nested: { id: 'book-1' } });

    expect(input<TestInput, 'bookSlug'>('bookSlug')(runtime.input, runtime)).toBe('progbook');
    expect(() => input<TestInput, 'requesterKey'>('requesterKey')(runtime.input, runtime)).toThrow(
      'Rate-limit input key "requesterKey" is not available',
    );
    expect(() => input<TestInput, 'nested'>('nested')(runtime.input, runtime)).toThrow(
      'Rate-limit input key "nested" must resolve to a primitive value',
    );
  });

  it('acquires a slot with the resolved key before running the wrapped effect', async () => {
    const adapter = createAdapter();
    configureServerRuntime({ rateLimit: adapter });
    const runtime = createRuntime({ requesterKey: ' user-1 ', bookSlug: 'progbook' });
    const concern = rateLimit<TestInput>({
      policy: { id: 'book-read', limit: 10, window: '1 minute' },
      key: [byRequester, input('bookSlug')],
    });

    const result = await Effect.runPromise(concern.run(runtime, Effect.succeed({ ok: true })));

    expect(result).toEqual({ ok: true });
    expect(adapter.acquireSlot).toHaveBeenCalledWith(
      { id: 'book-read', limit: 10, window: '1 minute' },
      'user-1:progbook',
    );
  });

  it('uses the runtime scope as default policy id and fails when the slot is denied', async () => {
    const adapter = createAdapter({
      acquireSlot: vi.fn(async () => ({
        allowed: false,
        remaining: 0,
        error: 'Slow down.',
      })),
    });
    configureServerRuntime({ rateLimit: adapter });
    const runtime = createRuntime({ bookSlug: 'progbook' });
    const concern = rateLimit<TestInput>({
      policy: { limit: 1, window: '1 minute' },
      key: input('bookSlug'),
    });

    await expect(
      Effect.runPromise(Effect.flip(concern.run(runtime, Effect.succeed({ ok: true })))),
    ).resolves.toMatchObject({
      name: 'RateLimitExceededError',
      message: 'Slow down.',
      remaining: 0,
    } satisfies Partial<RateLimitExceededError>);
    expect(adapter.acquireSlot).toHaveBeenCalledWith(
      { id: 'tests.runtime.rate-limit', limit: 1, window: '1 minute' },
      'progbook',
    );
  });

  it('refunds acquired slots when the wrapped effect fails and the predicate matches', async () => {
    const adapter = createAdapter();
    configureServerRuntime({ rateLimit: adapter });
    const runtime = createRuntime({ bookSlug: 'progbook' });
    const failure = new Error('temporary failure');
    const refundOn = vi.fn(() => true);
    const concern = rateLimit<TestInput>({
      policy: { id: 'book-read', limit: 10, window: '1 minute' },
      key: input('bookSlug'),
      refundOn,
    });

    await expect(
      Effect.runPromise(Effect.flip(concern.run(runtime, Effect.fail(failure)))),
    ).resolves.toBe(failure);
    expect(refundOn).toHaveBeenCalledWith(failure, runtime);
    expect(adapter.releaseSlot).toHaveBeenCalledWith(
      { id: 'book-read', limit: 10, window: '1 minute' },
      'progbook',
    );
  });

  it('does not refund when the refund predicate declines', async () => {
    const adapter = createAdapter();
    configureServerRuntime({ rateLimit: adapter });
    const runtime = createRuntime({ bookSlug: 'progbook' });
    const concern = rateLimit<TestInput>({
      policy: { id: 'book-read', limit: 10, window: '1 minute' },
      key: input('bookSlug'),
      refundOn: () => false,
    });

    await expect(
      Effect.runPromise(
        Effect.flip(concern.run(runtime, Effect.fail(new Error('permanent failure')))),
      ),
    ).resolves.toMatchObject({ message: 'permanent failure' });
    expect(adapter.releaseSlot).not.toHaveBeenCalled();
  });
});
