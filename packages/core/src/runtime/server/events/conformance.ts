import { requireDurableEventDelivery } from './capabilities.js';
import type { EventEmission, EventRuntime } from './types.js';

export type DurableEventRuntimeConformanceHarness = {
  readonly createRuntime: () => EventRuntime;
  readonly identityPrefix?: string;
  readonly waitForLeaseExpiry?: (leaseMs: number) => Promise<void>;
};

const invariant: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(`Durable Event Runtime conformance failed: ${message}`);
};

/**
 * Runs the provider-neutral durable delivery proof used by Ontahi adapter packages.
 * The harness must create runtimes backed by the same isolated storage namespace.
 */
export const verifyDurableEventRuntimeConformance = async (
  harness: DurableEventRuntimeConformanceHarness,
) => {
  const prefix = harness.identityPrefix ?? `conformance-${Date.now()}`;
  const eventId = `${prefix}.Event`;
  const emission = (value: string): EventEmission => ({
    kind: 'event-emission',
    eventId,
    eventVersion: 1,
    payload: { value },
    correlation: { requestId: value },
  });
  const runtime = harness.createRuntime();
  invariant(runtime.capabilities.retention, 'retention must be advertised');
  invariant(runtime.capabilities.durableAcceptance, 'durable acceptance must be advertised');
  invariant(runtime.capabilities.durableDelivery, 'durable delivery must be advertised');
  invariant(runtime.capabilities.acknowledgement, 'acknowledgement must be advertised');
  const durableDelivery = requireDurableEventDelivery(runtime);

  await runtime.accept(emission('unrelated'));
  const occurrence = await runtime.accept(emission('early'));
  await durableDelivery.register({
    id: `${prefix}.subscription`,
    eventId,
    eventVersion: 1,
    correlation: { requestId: 'early' },
  });
  const [left, right] = await Promise.all([
    durableDelivery.claim(`${prefix}.subscription`, {
      consumerId: 'consumer-left',
      leaseMs: 10_000,
    }),
    durableDelivery.claim(`${prefix}.subscription`, {
      consumerId: 'consumer-right',
      leaseMs: 10_000,
    }),
  ]);
  const claims = [left, right].filter(claim => claim !== undefined);
  invariant(claims.length === 1, 'one pending delivery must have only one active claim');
  const first = claims[0]!;
  invariant(
    first.delivery.occurrence.occurrenceId === occurrence.occurrenceId,
    'registration must match an occurrence accepted before the subscription',
  );
  invariant(first.delivery.attempt === 1, 'the first claim must be attempt one');

  await durableDelivery.release(first);
  const retried = await durableDelivery.claim(`${prefix}.subscription`, {
    consumerId: 'consumer-retry',
    leaseMs: 10_000,
  });
  invariant(retried, 'a released delivery must become claimable');
  invariant(
    retried.delivery.deliveryId === first.delivery.deliveryId,
    'retry must preserve delivery identity',
  );
  invariant(retried.delivery.attempt === 2, 'retry must increment the attempt');
  await durableDelivery.acknowledge(retried);
  invariant(
    (await durableDelivery.claim(`${prefix}.subscription`, {
      consumerId: 'consumer-after-ack',
      leaseMs: 10_000,
    })) === undefined,
    'an acknowledged delivery must not be claimed again',
  );

  await durableDelivery.register({
    id: `${prefix}.delayed-retry`,
    eventId,
    eventVersion: 1,
    correlation: { requestId: 'delayed-retry' },
  });
  await runtime.accept(emission('delayed-retry'));
  const delayed = await durableDelivery.claim(`${prefix}.delayed-retry`, {
    consumerId: 'consumer-delayed',
    leaseMs: 10_000,
  });
  invariant(delayed, 'a delivery to retry later must be claimable');
  const retryDelayMs = 250;
  await durableDelivery.retryAfter(delayed, retryDelayMs);
  invariant(
    (await durableDelivery.claim(`${prefix}.delayed-retry`, {
      consumerId: 'consumer-too-early',
      leaseMs: 10_000,
    })) === undefined,
    'a delayed retry must not be claimable before its availability time',
  );
  await new Promise(resolve => setTimeout(resolve, retryDelayMs + 50));
  const afterDelay = await durableDelivery.claim(`${prefix}.delayed-retry`, {
    consumerId: 'consumer-after-delay',
    leaseMs: 10_000,
  });
  invariant(afterDelay, 'a delayed retry must become claimable after its availability time');
  invariant(afterDelay.delivery.attempt === 2, 'a delayed retry must increment the attempt');
  await durableDelivery.acknowledge(afterDelay);

  await durableDelivery.register({
    id: `${prefix}.terminal-failure`,
    eventId,
    eventVersion: 1,
    correlation: { requestId: 'terminal-failure' },
  });
  await runtime.accept(emission('terminal-failure'));
  const terminal = await durableDelivery.claim(`${prefix}.terminal-failure`, {
    consumerId: 'consumer-terminal',
    leaseMs: 10_000,
  });
  invariant(terminal, 'a delivery to fail terminally must be claimable');
  await durableDelivery.fail(terminal, { reason: 'destination-rejected' });
  invariant(
    (await durableDelivery.claim(`${prefix}.terminal-failure`, {
      consumerId: 'consumer-after-failure',
      leaseMs: 10_000,
    })) === undefined,
    'a terminally failed delivery must not be claimed again',
  );

  await durableDelivery.register({
    id: `${prefix}.lease-expiry`,
    eventId,
    eventVersion: 1,
    correlation: { requestId: 'lease-expiry' },
  });
  await runtime.accept(emission('lease-expiry'));
  const leaseMs = 10;
  const expiring = await durableDelivery.claim(`${prefix}.lease-expiry`, {
    consumerId: 'consumer-expiring',
    leaseMs,
  });
  invariant(expiring, 'a pending delivery must be claimable with a lease');
  await (
    harness.waitForLeaseExpiry ??
    (duration => new Promise(resolve => setTimeout(resolve, duration + 10)))
  )(leaseMs);
  const reclaimed = await durableDelivery.claim(`${prefix}.lease-expiry`, {
    consumerId: 'consumer-after-expiry',
    leaseMs: 10_000,
  });
  invariant(reclaimed, 'an expired delivery lease must become claimable again');
  invariant(
    reclaimed.delivery.deliveryId === expiring.delivery.deliveryId,
    'lease expiry must preserve delivery identity',
  );
  invariant(reclaimed.delivery.attempt === 2, 'lease expiry retry must increment the attempt');
  let staleClaimRejected = false;
  try {
    await durableDelivery.acknowledge(expiring);
  } catch {
    staleClaimRejected = true;
  }
  if (!staleClaimRejected) {
    const stillClaimed = await durableDelivery.claim(`${prefix}.lease-expiry`, {
      consumerId: 'consumer-probe',
      leaseMs: 10_000,
    });
    invariant(
      stillClaimed === undefined,
      'a stale claim must not acknowledge a delivery held by a newer claim',
    );
  }
  await durableDelivery.acknowledge(reclaimed);

  await durableDelivery.register({
    id: `${prefix}.restart`,
    eventId,
    eventVersion: 1,
    correlation: { requestId: 'restart' },
  });
  const restartOccurrence = await runtime.accept(emission('restart'));
  const recreated = harness.createRuntime();
  invariant(recreated.durableDelivery, 'a recreated runtime must expose durable delivery');
  const recreatedDurableDelivery = recreated.durableDelivery;
  const afterRestart = await recreatedDurableDelivery.claim(`${prefix}.restart`, {
    consumerId: 'consumer-after-restart',
    leaseMs: 10_000,
  });
  invariant(
    afterRestart?.delivery.occurrence.occurrenceId === restartOccurrence.occurrenceId,
    'pending delivery must survive runtime recreation',
  );
};
