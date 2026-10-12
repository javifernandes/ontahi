import { cloneJson } from '../../../value/json.js';

import type { EventDelivery, EventOccurrence, EventRuntime, EventSubscriber } from './types.js';

export type InMemoryEventRuntimeOptions = {
  readonly capacity?: number;
  readonly deliveryTimeoutMs?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly onSubscriberError?: (cause: unknown, delivery: EventDelivery) => void;
};

let eventIdentitySequence = 0;
const createDefaultEventIdentity = () =>
  globalThis.crypto?.randomUUID?.() ?? `ontahi-event-${Date.now()}-${++eventIdentitySequence}`;

const deliverWithTimeout = async (
  subscriber: EventSubscriber,
  delivery: EventDelivery,
  timeoutMs: number,
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => subscriber(delivery)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Event delivery ${delivery.deliveryId} timed out.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

export const createInMemoryEventRuntime = (
  options: InMemoryEventRuntimeOptions = {},
): EventRuntime => {
  const capacity = options.capacity ?? 1024;
  const deliveryTimeoutMs = options.deliveryTimeoutMs ?? 30_000;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new TypeError('In-memory Event Runtime capacity must be a positive integer.');
  }
  if (!Number.isFinite(deliveryTimeoutMs) || deliveryTimeoutMs <= 0) {
    throw new TypeError('In-memory Event Runtime delivery timeout must be positive.');
  }
  const createId = options.createId ?? createDefaultEventIdentity;
  const subscriptions = new Map<string, { eventId: string; subscriber: EventSubscriber }>();
  let pending = 0;

  return {
    capabilities: {
      liveSubscription: true,
      retention: false,
      replay: false,
      durableAcceptance: false,
      durableDelivery: false,
      acknowledgement: false,
      ordering: 'acceptance',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'reject',
    },
    accept: async emission => {
      if (pending >= capacity) throw new Error('In-memory Event Runtime capacity exceeded.');
      pending += 1;
      try {
        const occurrence = cloneJson<EventOccurrence>({
          kind: 'event-occurrence',
          occurrenceId: createId(),
          eventId: emission.eventId,
          eventVersion: emission.eventVersion,
          occurredAt: (options.now ?? (() => new Date()))().toISOString(),
          payload: emission.payload,
          ...(emission.causation ? { causation: emission.causation } : {}),
          ...(emission.correlation ? { correlation: emission.correlation } : {}),
        });
        const deliveries = [...subscriptions.entries()]
          .filter(([, subscription]) => subscription.eventId === occurrence.eventId)
          .map(async ([subscriptionId, subscription]) => {
            const delivery = cloneJson<EventDelivery>({
              kind: 'event-delivery',
              deliveryId: createId(),
              subscriptionId,
              attempt: 1,
              occurrence,
            });
            try {
              await deliverWithTimeout(subscription.subscriber, delivery, deliveryTimeoutMs);
            } catch (cause) {
              try {
                options.onSubscriberError?.(cause, delivery);
              } catch {
                // Diagnostic reporting cannot turn subscriber failure into publication failure.
              }
            }
          });
        await Promise.all(deliveries);
        return occurrence;
      } finally {
        pending -= 1;
      }
    },
    subscribe: (eventId, subscriber) => {
      const id = createId();
      subscriptions.set(id, { eventId, subscriber });
      let active = true;
      return {
        id,
        cancel: () => {
          if (!active) return;
          active = false;
          subscriptions.delete(id);
        },
      };
    },
  };
};
