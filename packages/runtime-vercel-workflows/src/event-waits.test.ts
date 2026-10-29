import { field, value } from '@ontahi/core/data-graph';
import { defineEvent, type EventOccurrence, type EventRuntime } from '@ontahi/core/runtime/server';
import type { TaskRunSource } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { waitForVercelWorkflowEvent } from './event-waits.js';

const Ready = defineEvent({
  id: 'Ready',
  version: 1,
  description: 'Ready.',
  payload: value('ReadyPayload', { requestId: field.string() }),
});

const occurrence = (eventId: string = Ready.id): EventOccurrence => ({
  kind: 'event-occurrence',
  occurrenceId: `occurrence-${eventId}`,
  eventId,
  eventVersion: Ready.version,
  occurredAt: '2026-06-03T00:01:00.000Z',
  payload: { requestId: 'request-1' },
  correlation: { requestId: 'request-1' },
});

const capabilities: EventRuntime['capabilities'] = {
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
};

const createHarness = ({
  sourceStatus = 'running',
  claimOccurrence = occurrence(),
  claimWinner = true,
}: {
  sourceStatus?: TaskRunSource['status'];
  claimOccurrence?: EventOccurrence;
  claimWinner?: boolean;
} = {}) => {
  const ref = { taskId: 'fixture.wait', runId: 'run-1' };
  let source: TaskRunSource = {
    ...ref,
    status: sourceStatus,
    input: {},
    trigger: { cause: 'user_request' },
    checkpoint: {
      version: 1,
      state: { step: 'wait' },
      eventWait: {
        id: 'wait-1',
        kind: 'event',
        eventId: Ready.id,
        eventVersion: Ready.version,
        correlation: { requestId: 'request-1' },
        createdAt: '2026-06-03T00:00:00.000Z',
      },
    },
    updatedAt: '2026-06-03T00:00:00.000Z',
  };
  const claim = {
    claimId: 'claim-1',
    consumerId: `task-runtime:${ref.taskId}:${ref.runId}`,
    leaseExpiresAt: '2026-06-03T00:02:00.000Z',
    delivery: {
      kind: 'event-delivery' as const,
      deliveryId: 'delivery-1',
      subscriptionId: `task:${ref.taskId}:${ref.runId}:event-wait:wait-1`,
      attempt: 1,
      occurrence: claimOccurrence,
    },
  };
  const register = vi.fn(() => Promise.resolve());
  const claimDelivery = vi.fn(() => Promise.resolve(claim));
  const acknowledge = vi.fn(() => Promise.resolve());
  const release = vi.fn(() => Promise.resolve());
  const cancel = vi.fn(() => Promise.resolve());
  const update = vi.fn((_identity, patch) => {
    source = { ...source, ...patch };
    return Effect.succeed(source);
  });
  const loadSource = vi.fn(() => Effect.succeed(source));
  const claimEvent = vi.fn((_identity, _waitId, checkpoint) => {
    if (!claimWinner) {
      source = { ...source, status: 'completed' };
      return Effect.succeed(undefined);
    }
    source = { ...source, status: 'running', checkpoint };
    return Effect.succeed(source);
  });
  const cancelEvent = vi.fn((_identity, _waitId, status, error) => {
    source = { ...source, status, error, checkpoint: undefined };
    return Effect.succeed(source);
  });
  const runtime: EventRuntime = {
    capabilities,
    accept: vi.fn(),
    subscribe: vi.fn(),
    durableDelivery: {
      register,
      claim: claimDelivery,
      acknowledge,
      release,
      retryAfter: vi.fn(),
      fail: vi.fn(),
      cancel,
    },
  };

  return {
    ref,
    runtime,
    store: { update, loadSource, claimEvent, cancelEvent },
    claim,
    register,
    claimDelivery,
    acknowledge,
    release,
    cancel,
    cancelEvent,
    update,
    loadSource,
    claimEvent,
  };
};

const wait = (harness: ReturnType<typeof createHarness>, options?: { now?: () => number }) =>
  waitForVercelWorkflowEvent({
    ref: harness.ref,
    state: { step: 'wait' },
    request: {
      id: 'wait-1',
      declaration: Ready,
      correlation: { requestId: 'request-1' },
      ...(options?.now ? { timeoutMs: 1 } : {}),
    },
    store: harness.store,
    events: { runtime: harness.runtime, declarations: [Ready] },
    sleep: () => Promise.resolve(),
    ...options,
  });

describe('Vercel Workflow Event waits', () => {
  it('reuses an exact persisted wait during workflow recovery', async () => {
    const harness = createHarness({ sourceStatus: 'waiting' });

    await expect(wait(harness)).resolves.toMatchObject({ kind: 'resumed' });
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task:fixture.wait:run-1:event-wait:wait-1' }),
    );
  });

  it('acknowledges a delivery that lost the atomic Task Storage claim', async () => {
    const harness = createHarness({ claimWinner: false });

    await expect(wait(harness)).resolves.toEqual({ kind: 'stopped' });
    expect(harness.acknowledge).toHaveBeenCalledWith(harness.claim);
    expect(harness.cancel).toHaveBeenCalledWith(harness.claim.delivery.subscriptionId);
  });

  it('fails a timed-out wait and cancels its durable subscription', async () => {
    const harness = createHarness();

    await expect(wait(harness, { now: () => Number.POSITIVE_INFINITY })).resolves.toEqual({
      kind: 'stopped',
    });
    expect(harness.cancelEvent).toHaveBeenCalledWith(
      harness.ref,
      'wait-1',
      'failed',
      expect.objectContaining({ code: 'task_event_wait_timed_out' }),
    );
    expect(harness.claimDelivery).not.toHaveBeenCalled();
  });

  it('releases a mismatched delivery before accepting a matching one', async () => {
    const harness = createHarness();
    const mismatched = {
      ...harness.claim,
      delivery: { ...harness.claim.delivery, occurrence: occurrence('Other') },
    };
    harness.claimDelivery.mockResolvedValueOnce(mismatched).mockResolvedValueOnce(harness.claim);

    await expect(wait(harness)).resolves.toMatchObject({
      kind: 'resumed',
      occurrence: { occurrenceId: 'occurrence-Ready' },
    });
    expect(harness.release).toHaveBeenCalledWith(mismatched);
  });

  it('retries transient registration and empty or failed claims', async () => {
    const harness = createHarness();
    harness.register.mockRejectedValueOnce(new Error('register unavailable'));
    harness.claimDelivery
      .mockRejectedValueOnce(new Error('claim unavailable'))
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce(harness.claim);

    await expect(wait(harness)).resolves.toMatchObject({ kind: 'resumed' });
    expect(harness.register).toHaveBeenCalledTimes(2);
    expect(harness.claimDelivery).toHaveBeenCalledTimes(3);
  });

  it('retries transient settlement failures before resuming', async () => {
    const harness = createHarness();
    harness.acknowledge.mockRejectedValueOnce(new Error('acknowledgement unavailable'));

    await expect(wait(harness)).resolves.toMatchObject({ kind: 'resumed' });
    expect(harness.acknowledge).toHaveBeenCalledTimes(2);
  });

  it('propagates stale settlement claims without retrying forever', async () => {
    const harness = createHarness();
    const staleClaim = new Error(
      `Durable Event claim ${harness.claim.claimId} is stale or already settled.`,
    );
    harness.acknowledge.mockRejectedValue(staleClaim);

    await expect(wait(harness)).rejects.toBe(staleClaim);
    expect(harness.acknowledge).toHaveBeenCalledTimes(1);
  });

  it('bounds retries for persistent delivery operation failures', async () => {
    const harness = createHarness();
    const unavailable = new Error('registration unavailable');
    harness.register.mockRejectedValue(unavailable);

    await expect(wait(harness)).rejects.toBe(unavailable);
    expect(harness.register).toHaveBeenCalledTimes(3);
    expect(harness.claimDelivery).not.toHaveBeenCalled();
  });

  it('stops and cancels the subscription when the Task wait is cancelled externally', async () => {
    const harness = createHarness();
    harness.update.mockImplementation((_identity, patch) =>
      Effect.succeed({
        ...harness.ref,
        ...patch,
        status: 'cancelled',
        input: {},
        trigger: { cause: 'user_request' },
        updatedAt: '2026-06-03T00:00:00.000Z',
      }),
    );
    harness.loadSource
      .mockImplementationOnce(() =>
        Effect.succeed({
          ...harness.ref,
          status: 'running',
          input: {},
          trigger: { cause: 'user_request' },
          updatedAt: '2026-06-03T00:00:00.000Z',
        }),
      )
      .mockImplementation(() =>
        Effect.succeed({
          ...harness.ref,
          status: 'cancelled',
          input: {},
          trigger: { cause: 'user_request' },
          updatedAt: '2026-06-03T00:00:00.000Z',
        }),
      );

    await expect(wait(harness)).resolves.toEqual({ kind: 'stopped' });
    expect(harness.claimDelivery).not.toHaveBeenCalled();
    expect(harness.cancel).toHaveBeenCalled();
  });

  it('fails before registration when the Event Runtime lacks durable capabilities', async () => {
    const harness = createHarness();
    harness.runtime = {
      ...harness.runtime,
      capabilities: { ...capabilities, retention: false },
    };

    await expect(wait(harness)).rejects.toMatchObject({
      reason: 'task_event_runtime_unavailable',
      message: expect.stringContaining('retention'),
    });
    expect(harness.register).not.toHaveBeenCalled();
  });
});
