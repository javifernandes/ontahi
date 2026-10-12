import { requireDurableEventDelivery } from './capabilities.js';
import type { EventEmission, EventRuntime } from './types.js';

export type DurableEventRuntimeConformanceHarness = {
  readonly createRuntime: () => EventRuntime;
  readonly identityPrefix?: string;
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
