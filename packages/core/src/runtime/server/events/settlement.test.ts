import { describe, expect, it } from 'vitest';

import {
  MAX_DURABLE_EVENT_RETRY_DELAY_MS,
  normalizeDurableEventDeliverySettlement,
} from './settlement.js';

describe('durable Event delivery settlement', () => {
  it('normalizes provider-neutral lifecycle outcomes', () => {
    expect(normalizeDurableEventDeliverySettlement({ kind: 'acknowledged' })).toEqual({
      state: 'acknowledged',
    });
    expect(normalizeDurableEventDeliverySettlement({ kind: 'pending' })).toEqual({
      state: 'pending',
    });
    expect(
      normalizeDurableEventDeliverySettlement({
        kind: 'pending',
        retryAfterMs: 5_000,
      }),
    ).toEqual({ state: 'pending', retryAfterMs: 5_000 });
    expect(
      normalizeDurableEventDeliverySettlement({ kind: 'failed', reason: 'destination-rejected' }),
    ).toEqual({ state: 'failed', failureReason: 'destination-rejected' });
    expect(
      normalizeDurableEventDeliverySettlement({ kind: 'failed', reason: 'x'.repeat(1_025) }),
    ).toEqual({ state: 'failed', failureReason: 'x'.repeat(1_024) });
  });

  it('rejects invalid provider-neutral lifecycle outcomes', () => {
    expect(() => normalizeDurableEventDeliverySettlement({ kind: 'failed', reason: ' ' })).toThrow(
      'Failure reason must be a non-empty string.',
    );
    expect(() =>
      normalizeDurableEventDeliverySettlement({ kind: 'pending', retryAfterMs: 0 }),
    ).toThrow('Retry delay must be a positive safe integer');
    expect(() =>
      normalizeDurableEventDeliverySettlement({
        kind: 'pending',
        retryAfterMs: MAX_DURABLE_EVENT_RETRY_DELAY_MS + 1,
      }),
    ).toThrow('Retry delay must be a positive safe integer');
  });
});
