import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { graphSchema } from '../../../data-graph/index.js';
import { createEventApplication } from '../events/application.js';
import { defineEvent } from '../events/declaration.js';
import { createInMemoryEventRuntime } from '../events/in-memory-runtime.js';
import type {
  DurableEventSubscription,
  EventDelivery,
  EventDeliveryClaim,
  EventOccurrence,
  EventRuntime,
} from '../events/types.js';

import { defineTask, defineTaskExecution, defineTaskExecutionStep } from './definitions.js';
import {
  eventWaitMatchesOccurrence,
  materializeTaskEventWait,
  taskEventWaitSubscriptionId,
} from './event-waits.js';
import { cancelTaskEventWait } from './facade.js';
import { createInProcessTaskRuntime } from './in-process-adapter.js';
import { createInMemoryTaskStorage } from './memory-store.js';

const ExportReady = defineEvent({
  id: 'TodoListExportReady',
  version: 1,
  description: 'A requested Todo list export is ready.',
  payload: graphSchema.object({ requestId: graphSchema.string(), url: graphSchema.string() }),
});

const createDurableRuntime = (
  failures: { register?: number; claim?: number; acknowledge?: number } = {},
): EventRuntime => {
  const occurrences: EventOccurrence[] = [];
  const subscriptions = new Map<string, DurableEventSubscription>();
  const deliveries = new Map<
    string,
    { delivery: EventDelivery; claim?: string; acknowledged: boolean }
  >();
  let sequence = 0;
  const enqueue = (subscription: DurableEventSubscription, occurrence: EventOccurrence) => {
    if (
      subscription.eventId !== occurrence.eventId ||
      subscription.eventVersion !== occurrence.eventVersion ||
      !Object.entries(subscription.correlation ?? {}).every(
        ([key, value]) => JSON.stringify(occurrence.correlation?.[key]) === JSON.stringify(value),
      )
    )
      return;
    const deliveryId = `${subscription.id}:${occurrence.occurrenceId}`;
    if (!deliveries.has(deliveryId)) {
      deliveries.set(deliveryId, {
        acknowledged: false,
        delivery: {
          kind: 'event-delivery',
          deliveryId,
          subscriptionId: subscription.id,
          attempt: 0,
          occurrence,
        },
      });
    }
  };
  return {
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
    accept: async emission => {
      const occurrence: EventOccurrence = {
        kind: 'event-occurrence',
        occurrenceId: `occurrence-${++sequence}`,
        eventId: emission.eventId,
        eventVersion: emission.eventVersion,
        occurredAt: new Date().toISOString(),
        payload: emission.payload,
        ...(emission.causation ? { causation: emission.causation } : {}),
        ...(emission.correlation ? { correlation: emission.correlation } : {}),
      };
      occurrences.push(occurrence);
      subscriptions.forEach(subscription => enqueue(subscription, occurrence));
      return occurrence;
    },
    subscribe: () => ({ id: 'unused', cancel: () => {} }),
    durableDelivery: {
      register: async subscription => {
        if ((failures.register ?? 0) > 0) {
          failures.register!--;
          throw new Error('register unavailable');
        }
        subscriptions.set(subscription.id, subscription);
        occurrences.forEach(occurrence => enqueue(subscription, occurrence));
      },
      claim: async (subscriptionId, options) => {
        if ((failures.claim ?? 0) > 0) {
          failures.claim!--;
          throw new Error('claim unavailable');
        }
        const entry = [...deliveries.values()].find(
          candidate =>
            candidate.delivery.subscriptionId === subscriptionId &&
            !candidate.acknowledged &&
            !candidate.claim,
        );
        if (!entry) return undefined;
        entry.claim = `claim-${++sequence}`;
        entry.delivery = { ...entry.delivery, attempt: entry.delivery.attempt + 1 };
        return {
          claimId: entry.claim,
          consumerId: options.consumerId,
          leaseExpiresAt: new Date(Date.now() + options.leaseMs).toISOString(),
          delivery: entry.delivery,
        };
      },
      acknowledge: async (claim: EventDeliveryClaim) => {
        if ((failures.acknowledge ?? 0) > 0) {
          failures.acknowledge!--;
          const entry = deliveries.get(claim.delivery.deliveryId);
          if (entry) entry.claim = undefined;
          throw new Error('acknowledgement unavailable');
        }
        const entry = deliveries.get(claim.delivery.deliveryId);
        if (!entry || entry.claim !== claim.claimId) throw new Error('stale claim');
        entry.acknowledged = true;
      },
      release: async (claim: EventDeliveryClaim) => {
        const entry = deliveries.get(claim.delivery.deliveryId);
        if (entry?.claim === claim.claimId) entry.claim = undefined;
      },
      cancel: async subscriptionId => {
        subscriptions.delete(subscriptionId);
      },
    },
  };
};

const createExportTask = (onComplete = () => {}, timeoutMs?: number) =>
  defineTask({
    id: 'TodoList.export',
    execution: defineTaskExecution<{ requestId: string }, { step: 'wait' }, { url: string }>({
      initial: () => ({ step: 'wait' }),
      steps: {
        wait: defineTaskExecutionStep({
          run: ({ input, state, event }) => {
            if (event) {
              onComplete();
              return Effect.succeed({
                kind: 'complete',
                result: { url: (event.payload as { url: string }).url },
              });
            }
            return Effect.succeed({
              kind: 'event',
              state,
              event: {
                id: `export:${input.requestId}`,
                declaration: ExportReady,
                correlation: { requestId: input.requestId },
                ...(timeoutMs === undefined ? {} : { timeoutMs }),
              },
            });
          },
        }),
      },
    }),
    run: () => Effect.dieMessage('Legacy Task execution must not run.'),
  });

describe('durable Task Event waits', () => {
  it('materializes only registered declarations and valid timeout policy', () => {
    const ref = { taskId: 'TodoList.export', runId: 'validation' };
    const declarations = new Map([[ExportReady.id, ExportReady]]);
    expect(
      materializeTaskEventWait(
        ref,
        { declaration: ExportReady, correlation: { requestId: 'request-1' }, timeoutMs: 100 },
        declarations,
      ),
    ).toMatchObject({
      kind: 'event',
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
      correlation: { requestId: 'request-1' },
      timeoutAt: expect.any(String),
    });
    expect(() => materializeTaskEventWait(ref, { declaration: ExportReady }, new Map())).toThrow();
    expect(() =>
      materializeTaskEventWait(ref, { declaration: ExportReady, timeoutMs: 0 }, declarations),
    ).toThrow();
    expect(taskEventWaitSubscriptionId(ref, 'wait-1')).toBe(
      'task:TodoList.export:validation:event-wait:wait-1',
    );
  });

  it('matches exact declaration identity and correlation values', () => {
    const wait = {
      id: 'wait-1',
      kind: 'event' as const,
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
      correlation: { requestId: 'request-1' },
      createdAt: '2026-10-14T00:00:00.000Z',
    };
    const occurrence = {
      kind: 'event-occurrence' as const,
      occurrenceId: 'occurrence-1',
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
      occurredAt: '2026-10-14T00:00:01.000Z',
      payload: { requestId: 'request-1', url: 'https://example.com/export' },
      correlation: { requestId: 'request-1' },
    };
    expect(eventWaitMatchesOccurrence(wait, occurrence)).toBe(true);
    expect(eventWaitMatchesOccurrence({ ...wait, eventVersion: 2 }, occurrence)).toBe(false);
    expect(
      eventWaitMatchesOccurrence({ ...wait, correlation: { requestId: 'other' } }, occurrence),
    ).toBe(false);
  });

  it.each(['occurrence-before-wait', 'wait-before-occurrence'] as const)(
    'resumes one correlated continuation for %s',
    async ordering => {
      const events = createDurableRuntime();
      const storage = createInMemoryTaskStorage();
      let completions = 0;
      const task = createExportTask(() => completions++);
      if (ordering === 'occurrence-before-wait') {
        await events.accept({
          ...ExportReady.emit({ requestId: 'request-1', url: 'https://example.com/export' }),
          correlation: { requestId: 'request-1' },
        });
      }
      const runtime = createInProcessTaskRuntime({
        storage,
        events: { runtime: events, declarations: [ExportReady] },
      });
      const run = await Effect.runPromise(
        runtime.start(task, { requestId: 'request-1' }, { runId: ordering }),
      );
      if (ordering === 'wait-before-occurrence') {
        await vi.waitFor(async () => {
          await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
            status: 'waiting',
            waitingOn: { kind: 'event', eventId: ExportReady.id },
          });
        });
        await events.accept({
          ...ExportReady.emit({ requestId: 'request-1', url: 'https://example.com/export' }),
          correlation: { requestId: 'request-1' },
        });
      }
      await vi.waitFor(async () => {
        await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
          status: 'completed',
          result: { url: 'https://example.com/export' },
        });
      });
      expect(completions).toBe(1);
    },
  );

  it('recovers a persisted wait after Task Runtime recreation and ignores mismatched correlation', async () => {
    const events = createDurableRuntime();
    const eventApplication = createEventApplication({
      declarations: [ExportReady],
      runtime: events,
    });
    const storage = createInMemoryTaskStorage();
    const task = createExportTask();
    const first = createInProcessTaskRuntime({
      storage,
      events: { runtime: events, declarations: [ExportReady] },
    });
    const run = await Effect.runPromise(
      first.start(task, { requestId: 'wanted' }, { runId: 'restart' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(first.getSnapshot(run))).resolves.toHaveProperty(
        'waitingOn.eventId',
        ExportReady.id,
      );
    });
    await events.accept({
      ...ExportReady.emit({ requestId: 'other', url: 'https://example.com/wrong' }),
      correlation: { requestId: 'other' },
    });
    const recovered = createInProcessTaskRuntime({
      storage,
      events: { runtime: events, declarations: [ExportReady] },
    });
    recovered.register?.(task);
    await Effect.runPromise(recovered.getSnapshot(run));
    const occurrence = await eventApplication.api.ingest(ExportReady, {
      payload: { requestId: 'wanted', url: 'https://example.com/right' },
      correlation: { requestId: 'wanted' },
      ingress: {
        provider: 'fixture-worker',
        event: 'export.ready',
        deliveryId: 'delivery-wanted',
        receivedAt: '2026-10-14T00:00:01.000Z',
      },
    });
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(recovered.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: { url: 'https://example.com/right' },
      });
    });
    expect(occurrence.causation).toEqual({
      kind: 'ingress',
      provider: 'fixture-worker',
      event: 'export.ready',
      deliveryId: 'delivery-wanted',
      receivedAt: '2026-10-14T00:00:01.000Z',
    });
  });

  it('does not consume a retained delivery until the recovered Task definition is registered', async () => {
    const events = createDurableRuntime();
    const storage = createInMemoryTaskStorage();
    const task = createExportTask();
    const run = { taskId: task.id, runId: 'register-later' };
    await Effect.runPromise(storage.create({ ...run, input: { requestId: 'register-later' } }));
    await Effect.runPromise(
      storage.update(run, {
        status: 'waiting',
        checkpoint: {
          version: 1,
          state: { step: 'wait' },
          eventWait: {
            id: 'export:register-later',
            kind: 'event',
            eventId: ExportReady.id,
            eventVersion: ExportReady.version,
            correlation: { requestId: 'register-later' },
            createdAt: '2026-10-14T00:00:00.000Z',
          },
        },
      }),
    );
    const recovered = createInProcessTaskRuntime({
      storage,
      events: { runtime: events, declarations: [ExportReady] },
    });
    await Effect.runPromise(recovered.getSnapshot(run));
    await events.accept({
      ...ExportReady.emit({
        requestId: 'register-later',
        url: 'https://example.com/register-later',
      }),
      correlation: { requestId: 'register-later' },
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    await expect(Effect.runPromise(storage.getSnapshot(run))).resolves.toHaveProperty(
      'status',
      'waiting',
    );

    recovered.register?.(task);
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(recovered.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: { url: 'https://example.com/register-later' },
      });
    });
  });

  it('retries transient registration, claim, and acknowledgement failures', async () => {
    const failures = { register: 1, claim: 1, acknowledge: 1 };
    const events = createDurableRuntime(failures);
    const errors: unknown[] = [];
    const runtime = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      events: { runtime: events, declarations: [ExportReady] },
      onBackgroundError: error => errors.push(error),
    });
    const run = await Effect.runPromise(
      runtime.start(createExportTask(), { requestId: 'retry' }, { runId: 'retry' }),
    );
    await events.accept({
      ...ExportReady.emit({ requestId: 'retry', url: 'https://example.com/retried' }),
      correlation: { requestId: 'retry' },
    });

    await vi.waitFor(
      async () => {
        await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
          status: 'completed',
          result: { url: 'https://example.com/retried' },
        });
        expect(failures).toEqual({ register: 0, claim: 0, acknowledge: 0 });
      },
      { timeout: 3_000 },
    );
    expect(errors).toHaveLength(3);
  });

  it('fails rather than silently waiting on an ephemeral Event Runtime', async () => {
    const runtime = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      events: { runtime: createInMemoryEventRuntime(), declarations: [ExportReady] },
    });
    const run = await Effect.runPromise(
      runtime.start(createExportTask(), { requestId: 'request-1' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'task_event_runtime_unavailable' },
      });
    });
  });

  it('fails when its Event declaration is not registered with the Task Runtime', async () => {
    const runtime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    const run = await Effect.runPromise(
      runtime.start(createExportTask(), { requestId: 'request-1' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'task_event_not_registered' },
      });
    });
  });

  it('fails a recovered persisted wait when no durable Event Runtime is configured', async () => {
    const storage = createInMemoryTaskStorage();
    const ref = { taskId: 'TodoList.export', runId: 'missing-runtime' };
    await Effect.runPromise(storage.create(ref));
    await Effect.runPromise(
      storage.update(ref, {
        status: 'waiting',
        checkpoint: {
          version: 1,
          state: { step: 'wait' },
          eventWait: {
            id: 'export:missing-runtime',
            kind: 'event',
            eventId: ExportReady.id,
            eventVersion: ExportReady.version,
            createdAt: '2026-10-14T00:00:00.000Z',
          },
        },
      }),
    );
    const runtime = createInProcessTaskRuntime({ storage });
    await Effect.runPromise(runtime.getSnapshot(ref));
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(runtime.getSnapshot(ref))).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'task_event_runtime_unavailable' },
      });
    });
  });

  it('times out and cancels a stable subscription without consuming a later occurrence', async () => {
    const events = createDurableRuntime();
    const storage = createInMemoryTaskStorage();
    const runtime = createInProcessTaskRuntime({
      storage,
      events: { runtime: events, declarations: [ExportReady] },
    });
    const timedOut = await Effect.runPromise(
      runtime.start(
        createExportTask(() => {}, 5),
        { requestId: 'late' },
        { runId: 'timeout' },
      ),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(runtime.getSnapshot(timedOut))).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'task_event_wait_timed_out' },
      });
    });
    await events.accept({
      ...ExportReady.emit({ requestId: 'late', url: 'https://example.com/retained' }),
      correlation: { requestId: 'late' },
    });
    const later = await Effect.runPromise(
      runtime.start(createExportTask(), { requestId: 'late' }, { runId: 'after-timeout' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(runtime.getSnapshot(later))).resolves.toMatchObject({
        status: 'completed',
        result: { url: 'https://example.com/retained' },
      });
    });
  });

  it('cancels the run and its subscription without deleting the occurrence', async () => {
    const events = createDurableRuntime();
    const runtime = createInProcessTaskRuntime({
      storage: createInMemoryTaskStorage(),
      events: { runtime: events, declarations: [ExportReady] },
    });
    const run = await Effect.runPromise(
      runtime.start(createExportTask(), { requestId: 'cancelled' }, { runId: 'cancel' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toHaveProperty(
        'status',
        'waiting',
      );
    });
    await expect(Effect.runPromise(cancelTaskEventWait(runtime, run))).resolves.toHaveProperty(
      'status',
      'cancelled',
    );
    await expect(Effect.runPromise(cancelTaskEventWait(runtime, run))).rejects.toThrow(
      'task_event_wait_not_pending',
    );
    await events.accept({
      ...ExportReady.emit({ requestId: 'cancelled', url: 'https://example.com/not-consumed' }),
      correlation: { requestId: 'cancelled' },
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toHaveProperty(
      'status',
      'cancelled',
    );
  });

  it('reports when Task Event wait cancellation is unavailable', async () => {
    const runtime = createInProcessTaskRuntime({ storage: createInMemoryTaskStorage() });
    await expect(
      Effect.runPromise(
        cancelTaskEventWait(
          { ...runtime, cancelEventWait: undefined },
          { taskId: 'TodoList.export', runId: 'missing' },
        ),
      ),
    ).rejects.toThrow('task_cancellation_unavailable');
  });

  it('stops polling when another Task Runtime cancels the persisted wait', async () => {
    const events = createDurableRuntime();
    const claim = vi.spyOn(events.durableDelivery!, 'claim');
    const storage = createInMemoryTaskStorage();
    const task = createExportTask();
    const owner = createInProcessTaskRuntime({
      storage,
      events: { runtime: events, declarations: [ExportReady] },
    });
    const run = await Effect.runPromise(
      owner.start(task, { requestId: 'cross-runtime-cancel' }, { runId: 'cross-runtime-cancel' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(owner.getSnapshot(run))).resolves.toHaveProperty(
        'status',
        'waiting',
      );
    });
    const observer = createInProcessTaskRuntime({
      storage,
      events: { runtime: events, declarations: [ExportReady] },
    });
    observer.register?.(task);
    await Effect.runPromise(observer.getSnapshot(run));
    await Effect.runPromise(owner.cancelEventWait!(run));
    await new Promise(resolve => setTimeout(resolve, 40));
    const settledClaims = claim.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 40));

    expect(claim).toHaveBeenCalled();
    expect(claim).toHaveBeenCalledTimes(settledClaims);
  });
});
