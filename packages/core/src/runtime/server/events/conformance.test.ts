import { describe, expect, it } from 'vitest';

import { verifyDurableEventRuntimeConformance } from './conformance.js';
import type {
  DurableEventSubscription,
  EventDelivery,
  EventDeliveryClaim,
  EventOccurrence,
  EventRuntime,
} from './types.js';

const createConformanceRuntimeFactory = () => {
  const occurrences: EventOccurrence[] = [];
  const subscriptions = new Map<string, DurableEventSubscription>();
  const deliveries = new Map<
    string,
    {
      delivery: EventDelivery;
      state: 'pending' | 'claimed' | 'acknowledged' | 'failed';
      availableAt: number;
      claimId?: string;
      consumerId?: string;
      leaseExpiresAt?: number;
    }
  >();
  let sequence = 0;
  const matches = (subscription: DurableEventSubscription, occurrence: EventOccurrence) =>
    subscription.eventId === occurrence.eventId &&
    subscription.eventVersion === occurrence.eventVersion &&
    Object.entries(subscription.correlation ?? {}).every(
      ([key, value]) => occurrence.correlation?.[key] === value,
    );
  const enqueue = (subscription: DurableEventSubscription, occurrence: EventOccurrence) => {
    if (!matches(subscription, occurrence)) return;
    const id = `${subscription.id}:${occurrence.occurrenceId}`;
    if (deliveries.has(id)) return;
    deliveries.set(id, {
      state: 'pending',
      availableAt: Date.now(),
      delivery: {
        kind: 'event-delivery',
        deliveryId: id,
        subscriptionId: subscription.id,
        attempt: 0,
        occurrence,
      },
    });
  };

  return (): EventRuntime => ({
    capabilities: {
      liveSubscription: false,
      retention: true,
      replay: false,
      durableAcceptance: true,
      durableDelivery: true,
      deliveryInspection: false,
      acknowledgement: true,
      ordering: 'subscription',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'spill',
    },
    accept: async emission => {
      const occurrence: EventOccurrence = {
        kind: 'event-occurrence',
        occurrenceId: `occurrence-${++sequence}`,
        eventId: emission.eventId,
        eventVersion: emission.eventVersion,
        occurredAt: '2026-10-12T00:00:00.000Z',
        payload: emission.payload,
        ...(emission.correlation ? { correlation: emission.correlation } : {}),
      };
      occurrences.push(occurrence);
      for (const subscription of subscriptions.values()) enqueue(subscription, occurrence);
      return occurrence;
    },
    subscribe: () => ({ id: 'unused', cancel: () => {} }),
    durableDelivery: {
      register: async subscription => {
        subscriptions.set(subscription.id, subscription);
        for (const occurrence of occurrences) enqueue(subscription, occurrence);
      },
      claim: async (subscriptionId, options) => {
        const entry = [...deliveries.values()].find(
          candidate =>
            candidate.delivery.subscriptionId === subscriptionId &&
            ((candidate.state === 'pending' && candidate.availableAt <= Date.now()) ||
              (candidate.state === 'claimed' && candidate.leaseExpiresAt! <= Date.now())),
        );
        if (!entry) return undefined;
        const claimId = `claim-${++sequence}`;
        entry.state = 'claimed';
        entry.claimId = claimId;
        entry.consumerId = options.consumerId;
        entry.leaseExpiresAt = Date.now() + options.leaseMs;
        entry.delivery = { ...entry.delivery, attempt: entry.delivery.attempt + 1 };
        return {
          claimId,
          consumerId: options.consumerId,
          leaseExpiresAt: new Date(entry.leaseExpiresAt).toISOString(),
          delivery: entry.delivery,
        };
      },
      acknowledge: async (claim: EventDeliveryClaim) => {
        const entry = deliveries.get(claim.delivery.deliveryId)!;
        if (
          entry.state !== 'claimed' ||
          entry.claimId !== claim.claimId ||
          entry.consumerId !== claim.consumerId ||
          entry.leaseExpiresAt! <= Date.now()
        ) {
          throw new Error('stale claim');
        }
        entry.state = 'acknowledged';
      },
      release: async (claim: EventDeliveryClaim) => {
        const entry = deliveries.get(claim.delivery.deliveryId)!;
        if (entry.claimId !== claim.claimId) throw new Error('stale claim');
        entry.state = 'pending';
        entry.availableAt = Date.now();
      },
      retryAfter: async (claim, delayMs) => {
        const entry = deliveries.get(claim.delivery.deliveryId)!;
        if (entry.claimId !== claim.claimId) throw new Error('stale claim');
        entry.state = 'pending';
        entry.availableAt = Date.now() + delayMs;
      },
      fail: async (claim, _failure) => {
        const entry = deliveries.get(claim.delivery.deliveryId)!;
        if (entry.claimId !== claim.claimId) throw new Error('stale claim');
        entry.state = 'failed';
      },
      cancel: async subscriptionId => {
        subscriptions.delete(subscriptionId);
      },
    },
  });
};

describe('Durable Event Runtime conformance verifier', () => {
  it('accepts a runtime that retains, claims, retries, acknowledges, and survives recreation', async () => {
    await expect(
      verifyDurableEventRuntimeConformance({
        createRuntime: createConformanceRuntimeFactory(),
        identityPrefix: 'reference',
      }),
    ).resolves.toBeUndefined();
  });
});
