import { describe, expect, it } from 'vitest';

import { requireDurableEventDelivery } from './capabilities.js';
import { createInMemoryEventRuntime } from './in-memory-runtime.js';
import type { DurableEventDeliveryCapability, EventRuntime } from './types.js';

describe('Event Runtime capability requirements', () => {
  it('rejects the ephemeral runtime with actionable missing guarantees', () => {
    expect(() => requireDurableEventDelivery(createInMemoryEventRuntime())).toThrow(
      'missing retention, durableAcceptance, durableDelivery, acknowledgement, durableDelivery API',
    );
  });

  it('returns the durable delivery API only when every required guarantee is advertised', () => {
    const durableDelivery = {} as DurableEventDeliveryCapability;
    const runtime = {
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
        overflowBehavior: 'spill',
      },
      accept: async () => {
        throw new Error('not used');
      },
      subscribe: () => ({ id: 'not-used', cancel: () => {} }),
      durableDelivery,
    } satisfies EventRuntime;

    expect(requireDurableEventDelivery(runtime)).toBe(durableDelivery);
  });
});
