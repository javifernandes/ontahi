import { describe, expect, it } from 'vitest';

import {
  inspectSqlEventDeliveries,
  materializeDurableEventDeliveryInspection,
} from './inspection.js';

const row = {
  delivery_id: 'delivery-1',
  subscription_id: 'subscription-1',
  occurrence_id: 'occurrence-1',
  event_id: 'Event',
  event_version: 1,
  state: 'failed',
  attempt: 2,
  created_at: 'created',
  available_at: 'available',
  lease_expires_at: null,
  acknowledged_at: null,
  failed_at: 'failed',
  failure_reason: 'rejected',
};

const timestamp = (value: unknown) => {
  if (typeof value !== 'string') throw new TypeError('Test timestamp is invalid.');
  return `timestamp:${value}`;
};

describe('SQL Event delivery inspection materialization', () => {
  it('materializes provider-neutral lifecycle evidence without payload data', () => {
    const inspected = materializeDurableEventDeliveryInspection(row, timestamp, 'Test SQL');

    expect(inspected).toEqual({
      kind: 'durable-event-delivery-inspection',
      deliveryId: 'delivery-1',
      subscriptionId: 'subscription-1',
      occurrenceId: 'occurrence-1',
      eventId: 'Event',
      eventVersion: 1,
      state: 'failed',
      attempt: 2,
      createdAt: 'timestamp:created',
      availableAt: 'timestamp:available',
      failedAt: 'timestamp:failed',
      failureReason: 'rejected',
    });
  });

  it('rejects an invalid failure reason instead of default object stringification', () => {
    expect(() =>
      materializeDurableEventDeliveryInspection(
        { ...row, failure_reason: { unsafe: true } },
        timestamp,
        'Test SQL',
      ),
    ).toThrow('Test SQL Event delivery failure reason is invalid');
  });

  it('normalizes the bound before loading and materializes every row', async () => {
    const inspected = await inspectSqlEventDeliveries({
      query: { limit: 3, states: ['failed', 'failed'] },
      loadRows: async query => {
        expect(query).toEqual({ limit: 3, states: ['failed'] });
        return [row];
      },
      timestamp,
      provider: 'Test SQL',
    });

    expect(inspected).toHaveLength(1);
    expect(inspected[0]?.deliveryId).toBe('delivery-1');
  });
});
