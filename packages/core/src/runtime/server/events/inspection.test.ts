import { describe, expect, it } from 'vitest';

import {
  MAX_DURABLE_EVENT_DELIVERY_INSPECTION_LIMIT,
  normalizeDurableEventDeliveryInspectionQuery,
} from './inspection.js';

describe('durable Event delivery inspection query', () => {
  it('requires an explicit bounded limit', () => {
    expect(() => normalizeDurableEventDeliveryInspectionQuery({ limit: 0 })).toThrow(
      'positive safe integer',
    );
    expect(() => normalizeDurableEventDeliveryInspectionQuery({ limit: 1.5 })).toThrow(
      'positive safe integer',
    );
    expect(() =>
      normalizeDurableEventDeliveryInspectionQuery({
        limit: MAX_DURABLE_EVENT_DELIVERY_INSPECTION_LIMIT + 1,
      }),
    ).toThrow(`cannot exceed ${MAX_DURABLE_EVENT_DELIVERY_INSPECTION_LIMIT}`);
  });

  it('deduplicates valid state filters and rejects unknown states', () => {
    expect(
      normalizeDurableEventDeliveryInspectionQuery({
        limit: 2,
        states: ['failed', 'failed', 'pending'],
      }),
    ).toEqual({ limit: 2, states: ['failed', 'pending'] });
    expect(() =>
      normalizeDurableEventDeliveryInspectionQuery({
        limit: 1,
        states: ['unknown'] as never,
      }),
    ).toThrow('state is invalid');
  });
});
