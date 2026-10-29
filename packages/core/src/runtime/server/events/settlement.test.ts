import { describe, expect, it } from 'vitest';

import { normalizeDurableEventDeliverySettlement } from './settlement.js';

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
        availableAt: '2026-10-29T12:00:00Z',
      }),
    ).toEqual({ state: 'pending', availableAt: '2026-10-29T12:00:00.000Z' });
    expect(
      normalizeDurableEventDeliverySettlement({ kind: 'failed', reason: 'destination-rejected' }),
    ).toEqual({ state: 'failed', failureReason: 'destination-rejected' });
  });

  it('rejects invalid provider-neutral lifecycle outcomes', () => {
    expect(() => normalizeDurableEventDeliverySettlement({ kind: 'failed', reason: ' ' })).toThrow(
      'Failure reason must be a non-empty string.',
    );
    expect(() =>
      normalizeDurableEventDeliverySettlement({ kind: 'pending', availableAt: 'not-a-date' }),
    ).toThrow('Retry availability must be a valid timestamp.');
  });
});
