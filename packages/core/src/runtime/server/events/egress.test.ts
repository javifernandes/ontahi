import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { graphSchema } from '../../../data-graph/index.js';

import { defineEvent } from './declaration.js';
import {
  eventEgressSubscription,
  processNextEventEgressDelivery,
  registerEventEgressSubscription,
  type EventEgressAttempt,
} from './egress.js';
import { createInMemoryEventRuntime } from './in-memory-runtime.js';
import type { DurableEventDeliveryCapability, EventDelivery, EventRuntime } from './types.js';

const ExportReady = defineEvent({
  id: 'ExportReady',
  version: 1,
  description: 'An export is ready.',
  payload: graphSchema.object({ exportId: graphSchema.string() }),
});

const subscription = eventEgressSubscription({
  id: 'customer-export-webhook',
  event: ExportReady,
  destinationId: 'customer-webhook',
  project: occurrence => ({
    id: occurrence.occurrenceId,
    data: occurrence.payload,
  }),
});

const delivery = (attempt: number): EventDelivery => ({
  kind: 'event-delivery',
  deliveryId: 'delivery-1',
  subscriptionId: subscription.id,
  attempt,
  occurrence: {
    kind: 'event-occurrence',
    occurrenceId: 'occurrence-1',
    eventId: ExportReady.id,
    eventVersion: ExportReady.version,
    occurredAt: '2026-10-28T00:00:00.000Z',
    payload: { exportId: 'export-1' },
  },
});

const runtimeHarness = () => {
  let nextAttempt = 1;
  let available = true;
  const register = vi.fn<DurableEventDeliveryCapability['register']>();
  const acknowledge = vi.fn<DurableEventDeliveryCapability['acknowledge']>(async () => {
    available = false;
  });
  const release = vi.fn<DurableEventDeliveryCapability['release']>(async () => {
    nextAttempt += 1;
  });
  const retryAt = vi.fn<DurableEventDeliveryCapability['retryAt']>(async () => {
    nextAttempt += 1;
  });
  const fail = vi.fn<DurableEventDeliveryCapability['fail']>(async () => {
    available = false;
  });
  const claim = vi.fn<DurableEventDeliveryCapability['claim']>(async (_subscriptionId, options) => {
    if (!available) return undefined;
    return {
      claimId: `claim-${nextAttempt}`,
      consumerId: options.consumerId,
      leaseExpiresAt: '2026-10-28T00:01:00.000Z',
      delivery: delivery(nextAttempt),
    };
  });
  const durableDelivery: DurableEventDeliveryCapability = {
    register,
    claim,
    acknowledge,
    release,
    retryAt,
    fail,
    cancel: vi.fn(),
  };
  const runtime: EventRuntime = {
    capabilities: {
      liveSubscription: false,
      retention: true,
      replay: false,
      durableAcceptance: true,
      durableDelivery: true,
      acknowledgement: true,
      ordering: 'subscription',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'block',
    },
    accept: vi.fn(),
    subscribe: vi.fn(),
    durableDelivery,
  };
  return { runtime, register, claim, acknowledge, release, retryAt, fail };
};

describe('managed Event egress kernel', () => {
  it('registers the application subscription through durable Event delivery', async () => {
    const { runtime, register } = runtimeHarness();

    await registerEventEgressSubscription(runtime, subscription);

    expect(register).toHaveBeenCalledWith({
      id: subscription.id,
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
    });
  });

  it('projects one claim through the transport and acknowledges an accepted attempt', async () => {
    const { runtime, acknowledge, release } = runtimeHarness();
    const seen: EventEgressAttempt<{ readonly url: string }>[] = [];

    const result = await processNextEventEgressDelivery({
      runtime,
      subscription,
      consumerId: 'worker-1',
      leaseMs: 60_000,
      resolveDestination: async destinationId => ({ url: `https://${destinationId}.example` }),
      transport: {
        deliver: async attempt => {
          seen.push(attempt);
          return { kind: 'accepted' };
        },
      },
    });

    expect(seen).toEqual([
      {
        subscriptionId: subscription.id,
        eventId: ExportReady.id,
        eventVersion: ExportReady.version,
        occurrenceId: 'occurrence-1',
        deliveryId: 'delivery-1',
        attempt: 1,
        destinationId: 'customer-webhook',
        destination: { url: 'https://customer-webhook.example' },
        body: { id: 'occurrence-1', data: { exportId: 'export-1' } },
      },
    ]);
    expect(result).toEqual({
      kind: 'accepted',
      subscriptionId: subscription.id,
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
      occurrenceId: 'occurrence-1',
      deliveryId: 'delivery-1',
      attempt: 1,
      destinationId: 'customer-webhook',
    });
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it('persists the availability time for a retryable attempt', async () => {
    const { runtime, acknowledge, release, retryAt } = runtimeHarness();
    const result = await processNextEventEgressDelivery({
      runtime,
      subscription,
      consumerId: 'worker-1',
      leaseMs: 60_000,
      now: () => new Date('2026-10-28T00:00:00.000Z'),
      resolveDestination: async () => ({ url: 'https://customer.example' }),
      transport: {
        deliver: async () => ({ kind: 'retryable', reason: 'unavailable', retryAfterMs: 1_000 }),
      },
    });

    expect(result).toEqual({
      kind: 'retryable',
      subscriptionId: subscription.id,
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
      occurrenceId: 'occurrence-1',
      deliveryId: 'delivery-1',
      attempt: 1,
      destinationId: 'customer-webhook',
      reason: 'unavailable',
      retryAt: '2026-10-28T00:00:01.000Z',
    });
    expect(retryAt).toHaveBeenCalledWith(expect.anything(), '2026-10-28T00:00:01.000Z');
    expect(release).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('applies the explicit default retry policy when the transport has no retry hint', async () => {
    const { runtime, retryAt } = runtimeHarness();

    const result = await processNextEventEgressDelivery({
      runtime,
      subscription,
      consumerId: 'worker-1',
      leaseMs: 60_000,
      retryDelayMs: 2_000,
      now: () => new Date('2026-10-28T00:00:00.000Z'),
      resolveDestination: async () => ({ url: 'https://customer.example' }),
      transport: {
        deliver: async () => ({ kind: 'retryable', reason: 'connection-reset' }),
      },
    });

    expect(result).toMatchObject({
      kind: 'retryable',
      deliveryId: 'delivery-1',
      reason: 'connection-reset',
      retryAt: '2026-10-28T00:00:02.000Z',
    });
    expect(retryAt).toHaveBeenCalledOnce();
  });

  it('persists a rejected attempt as a terminal failure', async () => {
    const { runtime, fail, retryAt } = runtimeHarness();

    const result = await processNextEventEgressDelivery({
      runtime,
      subscription,
      consumerId: 'worker-1',
      leaseMs: 60_000,
      resolveDestination: async () => ({ url: 'https://customer.example' }),
      transport: { deliver: async () => ({ kind: 'rejected', reason: 'http-status-400' }) },
    });

    expect(result).toMatchObject({
      kind: 'failed',
      deliveryId: 'delivery-1',
      reason: 'http-status-400',
    });
    expect(fail).toHaveBeenCalledWith(expect.anything(), { reason: 'http-status-400' });
    expect(retryAt).not.toHaveBeenCalled();
  });

  it('rejects a zero-delay retry policy and safely releases the claim', async () => {
    const { runtime, release, retryAt } = runtimeHarness();

    await expect(
      processNextEventEgressDelivery({
        runtime,
        subscription,
        consumerId: 'worker-1',
        leaseMs: 60_000,
        retryDelayMs: 0,
        resolveDestination: async () => ({ url: 'https://customer.example' }),
        transport: { deliver: async () => ({ kind: 'retryable', reason: 'unavailable' }) },
      }),
    ).rejects.toThrow('retry delay must be a positive safe integer');
    expect(release).toHaveBeenCalledOnce();
    expect(retryAt).not.toHaveBeenCalled();
  });

  it('returns idle without resolving a destination when no delivery is available', async () => {
    const { runtime } = runtimeHarness();
    await processNextEventEgressDelivery({
      runtime,
      subscription,
      consumerId: 'worker-1',
      leaseMs: 60_000,
      resolveDestination: async () => ({ url: 'https://customer.example' }),
      transport: { deliver: async () => ({ kind: 'accepted' }) },
    });
    const resolveDestination = vi.fn(async () => ({ url: 'https://customer.example' }));

    const result = await processNextEventEgressDelivery({
      runtime,
      subscription,
      consumerId: 'worker-1',
      leaseMs: 60_000,
      resolveDestination,
      transport: { deliver: async () => ({ kind: 'accepted' }) },
    });

    expect(result).toEqual({ kind: 'idle', subscriptionId: subscription.id });
    expect(resolveDestination).not.toHaveBeenCalled();
  });

  it('releases the claim when destination resolution or projection fails', async () => {
    const destinationHarness = runtimeHarness();
    const destinationFailure = new Error('destination unavailable');

    await expect(
      processNextEventEgressDelivery({
        runtime: destinationHarness.runtime,
        subscription,
        consumerId: 'worker-1',
        leaseMs: 60_000,
        resolveDestination: async () => {
          throw destinationFailure;
        },
        transport: { deliver: async () => ({ kind: 'accepted' }) },
      }),
    ).rejects.toBe(destinationFailure);
    expect(destinationHarness.release).toHaveBeenCalledOnce();

    const projectionHarness = runtimeHarness();
    const invalidProjection = eventEgressSubscription({
      ...subscription,
      project: () => ({ value: Number.NaN }),
    });
    await expect(
      processNextEventEgressDelivery({
        runtime: projectionHarness.runtime,
        subscription: invalidProjection,
        consumerId: 'worker-1',
        leaseMs: 60_000,
        resolveDestination: async () => ({ url: 'https://customer.example' }),
        transport: { deliver: async () => ({ kind: 'accepted' }) },
      }),
    ).rejects.toThrow('Expected a finite, acyclic JSON value.');
    expect(projectionHarness.release).toHaveBeenCalledOnce();
  });

  it('releases a delivery whose Event identity does not match the subscription', async () => {
    const harness = runtimeHarness();
    harness.claim.mockResolvedValueOnce({
      claimId: 'wrong-event-claim',
      consumerId: 'worker-1',
      leaseExpiresAt: '2026-10-28T00:01:00.000Z',
      delivery: {
        ...delivery(1),
        occurrence: { ...delivery(1).occurrence, eventVersion: 2 },
      },
    });
    const transport = { deliver: vi.fn(async () => ({ kind: 'accepted' as const })) };

    await expect(
      processNextEventEgressDelivery({
        runtime: harness.runtime,
        subscription,
        consumerId: 'worker-1',
        leaseMs: 60_000,
        resolveDestination: async () => ({ url: 'https://customer.example' }),
        transport,
      }),
    ).rejects.toThrow('expected ExportReady@1 but claimed ExportReady@2');
    expect(harness.release).toHaveBeenCalledOnce();
    expect(transport.deliver).not.toHaveBeenCalled();
  });

  it('reports both the attempt failure and a claim release failure', async () => {
    const harness = runtimeHarness();
    const attemptFailure = new Error('destination unavailable');
    const releaseFailure = new Error('claim lost');
    harness.release.mockRejectedValueOnce(releaseFailure);

    await expect(
      processNextEventEgressDelivery({
        runtime: harness.runtime,
        subscription,
        consumerId: 'worker-1',
        leaseMs: 60_000,
        resolveDestination: async () => {
          throw attemptFailure;
        },
        transport: { deliver: async () => ({ kind: 'accepted' }) },
      }),
    ).rejects.toEqual(
      new AggregateError(
        [attemptFailure, releaseFailure],
        'Event egress attempt delivery-1 failed and its claim could not be released.',
      ),
    );
  });

  it('fails before claiming when the Event Runtime cannot provide durable delivery', async () => {
    const runtime = createInMemoryEventRuntime();
    const transport = { deliver: vi.fn(async () => ({ kind: 'accepted' as const })) };

    await expect(
      processNextEventEgressDelivery({
        runtime,
        subscription,
        consumerId: 'worker-1',
        leaseMs: 60_000,
        resolveDestination: async () => ({ url: 'https://customer.example' }),
        transport,
      }),
    ).rejects.toThrow('Event Runtime cannot support a durable consumer');
    expect(transport.deliver).not.toHaveBeenCalled();
  });

  it('preserves the event payload type in subscription projections', () => {
    eventEgressSubscription({
      id: 'typed',
      event: ExportReady,
      destinationId: 'destination',
      project: occurrence => {
        expectTypeOf(occurrence.payload.exportId).toEqualTypeOf<string>();
        return occurrence.payload;
      },
    });
  });

  it('rejects empty subscription and destination identities', () => {
    expect(() => eventEgressSubscription({ ...subscription, id: ' ' })).toThrow(
      'Event egress subscription id must not be empty.',
    );
    expect(() => eventEgressSubscription({ ...subscription, destinationId: '' })).toThrow(
      'Event egress destination id must not be empty.',
    );
  });
});
