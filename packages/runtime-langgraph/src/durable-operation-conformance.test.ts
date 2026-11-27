import { MemorySaver } from '@langchain/langgraph';
import { graphSchema } from '@ontahi/core';
import {
  configureServerRuntime,
  createEventApplication,
  resetServerRuntimeForTests,
  defineEvent,
  type AnyEventDeclaration,
  type EventOccurrence,
  type EventRuntime,
} from '@ontahi/core/runtime/server';
import {
  createInMemoryTaskStorage,
  defineTask,
  defineTaskExecution,
  taskReconciliationCases,
  verifyDurableOperationConformance,
  verifyTaskReconciliationConformance,
  type TaskRunIdentity,
} from '@ontahi/core/runtime/server/tasks';
import { Deferred, Effect, Stream } from 'effect';
import { expect, it, vi } from 'vitest';

import { createLangGraphTaskExecutor, langGraphTasks } from './runtime.js';

const createRetainedEvents = (): EventRuntime => {
  const occurrences: EventOccurrence[] = [];
  const subscriptions = new Map<
    string,
    { eventId: string; eventVersion: number; correlation?: Readonly<Record<string, unknown>> }
  >();
  const claimed = new Set<string>();
  const cancelled = new Set<string>();
  return {
    capabilities: {
      liveSubscription: false,
      retention: true,
      replay: true,
      durableAcceptance: true,
      durableDelivery: true,
      deliveryInspection: false,
      acknowledgement: true,
      ordering: 'acceptance',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'spill',
    },
    accept: async emission => {
      const occurrence: EventOccurrence = {
        ...emission,
        kind: 'event-occurrence',
        occurrenceId: `occurrence-${occurrences.length + 1}`,
        occurredAt: new Date().toISOString(),
      };
      occurrences.push(occurrence);
      return occurrence;
    },
    subscribe: () => {
      throw new Error('Live Event delivery is outside this fixture');
    },
    durableDelivery: {
      register: async subscription => {
        if (!cancelled.has(subscription.id)) subscriptions.set(subscription.id, subscription);
      },
      claim: async (subscriptionId, { consumerId, leaseMs }) => {
        const subscription = subscriptions.get(subscriptionId);
        const occurrence = occurrences.find(
          value =>
            subscription?.eventId === value.eventId &&
            subscription.eventVersion === value.eventVersion &&
            Object.entries(subscription.correlation ?? {}).every(
              ([key, expected]) => value.correlation?.[key] === expected,
            ) &&
            !claimed.has(`${subscriptionId}:${value.occurrenceId}`),
        );
        if (!occurrence) return undefined;
        const deliveryId = `${subscriptionId}:${occurrence.occurrenceId}`;
        claimed.add(deliveryId);
        return {
          claimId: deliveryId,
          consumerId,
          leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          delivery: { kind: 'event-delivery', deliveryId, subscriptionId, occurrence, attempt: 1 },
        };
      },
      acknowledge: async () => {},
      release: async claim => {
        claimed.delete(claim.delivery.deliveryId);
      },
      retryAfter: async () => {},
      fail: async () => {},
      cancel: async id => {
        cancelled.add(id);
        subscriptions.delete(id);
      },
    },
  };
};

const createHarness = (executionLeaseMs?: number) => {
  const storage = createInMemoryTaskStorage();
  const checkpointer = new MemorySaver();
  const events = createRetainedEvents();
  const onBackgroundError = vi.fn();
  const createRuntime = (declarations?: readonly AnyEventDeclaration[], taskStorage = storage) => {
    const config = langGraphTasks({
      storage: taskStorage,
      checkpointer,
      executionLeaseMs,
      onBackgroundError,
      events: declarations ? { runtime: events, declarations } : undefined,
    });
    return config.executor!.createRuntime(config.storage!, config.host);
  };
  const harness: Parameters<typeof verifyDurableOperationConformance>[1] = {
    open: (task, declarations) => {
      const runtime = createRuntime(declarations);
      runtime.register?.(task);
      return {
        runtime,
        drive: () =>
          vi.waitFor(async () => {
            const relevant = (await Effect.runPromise(storage.listRecent())).filter(
              run => run.taskId === task.id,
            );
            expect(relevant.length).toBeGreaterThan(0);
            const snapshots = declarations
              ? await Promise.all(relevant.map(run => Effect.runPromise(runtime.getSnapshot(run))))
              : relevant;
            expect(snapshots.some(run => run.status === 'queued' || run.status === 'running')).toBe(
              false,
            );
          }, 3000),
      };
    },
    publish: async (declaration, requestId) => {
      const occurrence = await createEventApplication({
        runtime: events,
        declarations: [declaration],
      }).api.ingest(declaration, {
        payload: { requestId },
        correlation: { requestId },
        ingress: {
          provider: 'conformance',
          deliveryId: requestId,
          receivedAt: new Date().toISOString(),
        },
      });
      return occurrence.occurrenceId;
    },
  };
  const expireClaim = (ref: TaskRunIdentity) =>
    Effect.gen(function* () {
      const source = yield* storage.loadSource(ref);
      const runtime = source.runtime!;
      expect(runtime.executionLease).toBeDefined();
      const expired = yield* storage.updateIfStatus!(
        ref,
        'running',
        {
          runtime: {
            ...runtime,
            executionLease: { ...runtime.executionLease!, expiresAt: '2000-01-01T00:00:00.000Z' },
          },
        },
        { runtime },
      );
      expect(expired).toBeDefined();
    });
  return { storage, harness, createRuntime, expireClaim, events, onBackgroundError };
};

it.each([
  'atomic-admission',
  'approval-resumption',
  'ordered-observation',
  'retained-event-resumption',
] as const)('satisfies %s across LangGraph hosts', scenario =>
  verifyDurableOperationConformance(scenario, createHarness().harness),
);

it('rejects an admission request before creating a run if storage cannot admit atomically', async () => {
  const storage = createInMemoryTaskStorage();
  const runtime = createLangGraphTaskExecutor().createRuntime({ ...storage, admit: undefined });
  const task = defineTask<undefined, undefined>({
    id: 'LangGraph.admission-unavailable',
    execution: defineTaskExecution({
      initial: () => ({ step: 'run' }),
      steps: {},
    }),
    run: () => Effect.succeed(undefined),
  });

  expect(runtime.supportsAtomicAdmission).toBe(false);
  await expect(
    Effect.runPromise(
      Effect.flip(
        runtime.start(task, undefined, {
          admission: { key: 'same-key', policy: 'reuse-running' },
        }),
      ),
    ),
  ).resolves.toMatchObject({ reason: 'task_admission_unavailable' });
  expect(await Effect.runPromise(storage.listRecent())).toEqual([]);
});

it.each(taskReconciliationCases)('reconciles a remote Customer when $scenario', row => {
  const { storage, createRuntime, expireClaim } = createHarness();
  let hostCount = 0;
  return verifyTaskReconciliationConformance(row, {
    createStorage: () => storage,
    createRuntime: () => {
      const runtime = createRuntime();
      if (++hostCount === 1) return runtime;
      // The shared recreation scenario holds the first worker in the provider call.
      let expired = false;
      return {
        ...runtime,
        getSnapshot: ref =>
          Effect.gen(function* () {
            if (!expired) {
              yield* expireClaim(ref);
              expired = true;
            }
            return yield* runtime.getSnapshot(ref);
          }),
      };
    },
  });
});

it.each(['lease expiry', 'cancellation'] as const)(
  'rejects a late result after %s',
  async scenario => {
    const cancelled = scenario === 'cancellation';
    const { harness, storage, createRuntime, expireClaim } = createHarness();
    const entered = await Effect.runPromise(Deferred.make<void>());
    const release = await Effect.runPromise(Deferred.make<void>());
    let attempts = 0;
    let lateWriteChecked = false;
    let released = false;
    const loadFirstSource = (ref: TaskRunIdentity) =>
      storage.loadSource(ref).pipe(
        Effect.tap(source =>
          Effect.sync(() => {
            if (released && source.status === (cancelled ? 'cancelled' : 'completed'))
              lateWriteChecked = true;
          }),
        ),
      );
    const task = defineTask<undefined, string>({
      id: 'LangGraph.held-checkpoint',
      execution: defineTaskExecution<undefined, { step: string }, string>({
        initial: () => ({ step: 'write' }),
        steps: {
          write: {
            run: () =>
              Effect.gen(function* () {
                if (++attempts === 1) {
                  yield* Deferred.succeed(entered, undefined);
                  yield* Deferred.await(release);
                  return { kind: 'complete', result: 'earlier-attempt' };
                }
                return { kind: 'complete', result: 'second-attempt' };
              }),
          },
        },
      }),
      run: () => Effect.dieMessage('Explicit execution required'),
    });
    const first = createRuntime(undefined, { ...storage, loadSource: loadFirstSource });
    const second = harness.open(task);
    const admission = { key: 'held-checkpoint', policy: 'skip-if-completed' } as const;
    const ref = await Effect.runPromise(first.start(task, undefined, { admission }));
    try {
      await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout('3 seconds')));
      const before = await Effect.runPromise(storage.loadSource(ref));
      await Effect.runPromise(second.runtime.getSnapshot(ref));
      expect((await Effect.runPromise(storage.loadSource(ref))).runtime).toEqual(before.runtime);
      expect(attempts).toBe(1);
      if (cancelled) {
        await expect(Effect.runPromise(second.runtime.cancel!(ref))).resolves.toMatchObject({
          status: 'cancelled',
          error: { code: 'task_effect_outcome_ambiguous' },
        });
        expect(
          (await Effect.runPromise(storage.loadSource(ref))).runtime?.executionLease,
        ).toBeUndefined();
      } else {
        await Effect.runPromise(expireClaim(ref));
        await vi.waitFor(async () => {
          expect(await Effect.runPromise(second.runtime.getSnapshot(ref))).toMatchObject({
            status: 'completed',
            result: 'second-attempt',
          });
        }, 3000);
        expect(attempts).toBe(2);
        const recovered = await Effect.runPromise(storage.loadSource(ref));
        expect(recovered.runtime?.runId).not.toBe(before.runtime?.runId);
      }
    } finally {
      released = true;
      await Effect.runPromise(Deferred.succeed(release, undefined));
    }
    await vi.waitFor(() => expect(lateWriteChecked).toBe(true), 3000);
    expect(await Effect.runPromise(storage.getSnapshot(ref))).toMatchObject({
      runId: ref.runId,
      status: cancelled ? 'cancelled' : 'completed',
      result: cancelled ? undefined : 'second-attempt',
    });
    if (cancelled) {
      await expect(Effect.runPromise(second.runtime.cancel!(ref))).resolves.toBeUndefined();
      await expect(
        Effect.runPromise(second.runtime.start(task, undefined, { admission })),
      ).resolves.toMatchObject({
        runId: ref.runId,
        status: 'cancelled',
        admission: 'reconciliation-required',
      });
      expect(attempts).toBe(1);
    }
  },
);

it('keeps a run cancelled if cancellation beats its queued-to-running transition', async () => {
  const { storage, createRuntime } = createHarness();
  const cancel = createRuntime().cancel!;
  const task = defineTask<undefined, undefined>({
    id: 'LangGraph.cancel-before-running',
    execution: defineTaskExecution({
      initial: () => ({ step: 'run' }),
      steps: {},
    }),
    run: () => Effect.succeed(undefined),
  });
  const updateIfStatus = vi.fn(storage.updateIfStatus!);
  updateIfStatus.mockImplementationOnce((ref, status, patch, expected) =>
    Effect.zipRight(cancel(ref), storage.updateIfStatus!(ref, status, patch, expected)),
  );
  const runtime = createRuntime(undefined, { ...storage, updateIfStatus });
  const admission = { key: 'queued', policy: 'skip-if-completed' } as const;
  const cancelled = await Effect.runPromise(runtime.start(task, undefined, { admission }));
  expect(cancelled).toMatchObject({ status: 'cancelled', admission: 'created' });
  expect((await Effect.runPromise(storage.loadSource(cancelled))).error).toBeUndefined();
  const next = await Effect.runPromise(runtime.start(task, undefined, { admission }));
  expect(next.runId).not.toBe(cancelled.runId);
  expect(next.admission).toBe('created');
});

it('renews a held execution past its original deadline without giving up ownership', async () => {
  const { storage, createRuntime, onBackgroundError } = createHarness(1_200);
  const entered = await Effect.runPromise(Deferred.make<void>());
  const release = await Effect.runPromise(Deferred.make<void>());
  const execute = vi.fn(() =>
    Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined);
      yield* Deferred.await(release);
      return { kind: 'complete' as const, result: 'original-worker' };
    }),
  );
  const task = defineTask<undefined, string>({
    id: 'LangGraph.renewal',
    execution: defineTaskExecution({
      initial: () => ({ step: 'work' }),
      steps: { work: { run: execute } },
    }),
    run: () => Effect.dieMessage('Explicit execution required'),
  });
  let unavailable = true;
  const updateIfStatus: NonNullable<typeof storage.updateIfStatus> = (
    ref,
    status,
    patch,
    guard,
  ) => {
    if (unavailable && patch.runtime?.executionLease && guard?.leaseState === 'live') {
      unavailable = false;
      return Effect.fail({ reason: 'storage_unavailable', message: 'Renewal failed once' });
    }
    return storage.updateIfStatus!(ref, status, patch, guard);
  };
  const first = createRuntime(undefined, { ...storage, updateIfStatus });
  const second = createRuntime();
  second.register?.(task);
  const ref = await Effect.runPromise(first.start(task, undefined));
  try {
    await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout('3 seconds')));
    const original = (await Effect.runPromise(storage.loadSource(ref))).runtime!.executionLease!;
    await vi.waitFor(async () => {
      expect(Date.now()).toBeGreaterThan(Date.parse(original.expiresAt));
      const source = await Effect.runPromise(storage.loadSource(ref));
      expect(source.runtime?.executionLease?.token).toBe(original.token);
      expect(Date.parse(source.runtime!.executionLease!.expiresAt)).toBeGreaterThan(Date.now());
    }, 3000);
    await Effect.runPromise(second.getSnapshot(ref));
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    await Effect.runPromise(Deferred.succeed(release, undefined));
  }
  await vi.waitFor(async () => {
    const source = await Effect.runPromise(storage.loadSource(ref));
    expect(source).toMatchObject({ status: 'completed', result: 'original-worker' });
    expect(source.runtime?.executionLease).toBeUndefined();
  }, 3000);
  expect(execute).toHaveBeenCalledOnce();
  expect(onBackgroundError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'storage_unavailable' }),
  );
});

it.each(['observe', 'cancel', 'timeout', 'unguarded'] as const)(
  'handles a durable Event wait through %s',
  async mode => {
    const { storage, createRuntime, events, onBackgroundError } = createHarness();
    const ready = defineEvent({
      id: 'LangGraphReady',
      version: 1,
      description: 'A callback for a waiting LangGraph Task.',
      payload: graphSchema.object({ requestId: graphSchema.string() }),
    });
    const cancelledSubscription = vi.spyOn(events.durableDelivery!, 'cancel');
    const resumed = vi.fn();
    const task = defineTask<undefined, string>({
      id: 'LangGraph.event-lifecycle',
      execution: defineTaskExecution({
        initial: () => ({ step: 'wait' }),
        steps: {
          wait: {
            run: ({ state, event }) =>
              Effect.sync(() => {
                if (event) {
                  resumed(event.occurrenceId);
                  return { kind: 'complete', result: event.occurrenceId };
                }
                return {
                  kind: 'event',
                  state,
                  event: {
                    id: 'ready-event',
                    declaration: ready,
                    correlation: { requestId: 'wanted' },
                    ...(mode === 'timeout' ? { timeoutMs: 30 } : {}),
                  },
                };
              }),
          },
        },
      }),
      run: () => Effect.dieMessage('Explicit execution required'),
    });
    const first = createRuntime(
      [ready],
      mode === 'unguarded' ? { ...storage, updateIfStatus: undefined } : storage,
    );
    const second = createRuntime([ready]);
    second.register?.(task);
    const ref = await Effect.runPromise(first.start(task, undefined));
    if (mode === 'unguarded') {
      await vi.waitFor(async () => {
        expect(await Effect.runPromise(storage.getSnapshot(ref))).toMatchObject({
          status: 'failed',
          error: { code: 'task_event_runtime_unavailable' },
        });
      }, 3000);
      return;
    }
    await vi.waitFor(async () => {
      expect(await Effect.runPromise(storage.getSnapshot(ref))).toMatchObject({
        status: 'waiting',
        waitingOn: { kind: 'event', id: 'ready-event' },
      });
    }, 3000);

    if (mode === 'cancel') {
      await expect(Effect.runPromise(Effect.flip(second.cancel!(ref)))).resolves.toMatchObject({
        reason: 'task_event_wait_cancel_required',
      });
      await Effect.runPromise(second.getSnapshot(ref));
      await expect(Effect.runPromise(second.cancelEventWait!(ref))).resolves.toMatchObject({
        status: 'cancelled',
      });
      await expect(
        Effect.runPromise(Effect.flip(second.cancelEventWait!(ref))),
      ).resolves.toMatchObject({
        reason: 'task_event_wait_not_pending',
      });
    } else if (mode === 'timeout') {
      await vi.waitFor(async () => {
        expect(await Effect.runPromise(second.getSnapshot(ref))).toMatchObject({
          status: 'failed',
          error: { code: 'task_event_wait_timed_out' },
        });
      }, 3000);
    }

    const observing = await Effect.runPromise(Deferred.make<void>());
    const completed =
      mode === 'observe'
        ? Effect.runPromise(
            second.observe!(ref).pipe(
              Stream.tap(snapshot =>
                snapshot.status === 'waiting'
                  ? Deferred.succeed(observing, undefined)
                  : Effect.void,
              ),
              Stream.filter(snapshot => snapshot.status === 'completed'),
              Stream.runHead,
              Effect.timeout('3 seconds'),
            ),
          )
        : undefined;
    if (completed) {
      await Effect.runPromise(Deferred.await(observing).pipe(Effect.timeout('3 seconds')));
      vi.spyOn(events.durableDelivery!, 'claim').mockRejectedValueOnce(
        new Error('Event polling unavailable'),
      );
      cancelledSubscription.mockRejectedValueOnce(new Error('Delivery cleanup unavailable'));
    }
    const occurrence = await createEventApplication({
      runtime: events,
      declarations: [ready],
    }).api.ingest(ready, {
      payload: { requestId: 'wanted' },
      correlation: { requestId: 'wanted' },
      ingress: { provider: 'conformance', receivedAt: new Date().toISOString() },
    });
    if (completed) {
      await completed;
      expect((await Effect.runPromise(storage.getSnapshot(ref))).result).toBe(
        occurrence.occurrenceId,
      );
      expect(resumed).toHaveBeenCalledExactlyOnceWith(occurrence.occurrenceId);
      expect(onBackgroundError).toHaveBeenCalledTimes(2);
    } else {
      await Effect.runPromise(second.getSnapshot(ref));
      expect(resumed).not.toHaveBeenCalled();
    }
    expect(cancelledSubscription).toHaveBeenCalledWith(
      `task:${ref.taskId}:${ref.runId}:event-wait:ready-event`,
    );
  },
);

it('recovers an approval reached by an Event after losing the provider thread', async () => {
  const { storage, createRuntime, events } = createHarness();
  const ready = defineEvent({
    id: 'LangGraphReviewReady',
    version: 1,
    description: 'A callback that enables review.',
    payload: graphSchema.object({ requestId: graphSchema.string() }),
  });
  const task = defineTask<undefined, string>({
    id: 'LangGraph.event-approval',
    execution: defineTaskExecution<undefined, { step: string; occurrenceId?: string }, string>({
      initial: () => ({ step: 'wait' }),
      steps: {
        wait: {
          run: ({ state, event, response }) =>
            Effect.sync(() => {
              if (response && state.occurrenceId) {
                return { kind: 'complete', result: state.occurrenceId };
              }
              if (event) {
                return {
                  kind: 'interaction',
                  state: { ...state, occurrenceId: event.occurrenceId },
                  interaction: {
                    id: 'review-event',
                    prompt: 'Approve the Event?',
                    proposal: { id: 'review', summary: 'Review the Event', requests: [{}] },
                  },
                };
              }
              return { kind: 'event', state, event: { declaration: ready } };
            }),
        },
      },
    }),
    run: () => Effect.dieMessage('Explicit execution required'),
  });
  const first = createRuntime([ready]);
  const actor = { kind: 'system' } as const;
  const ref = await Effect.runPromise(
    first.start(task, undefined, { trigger: { cause: 'system', actor } }),
  );
  const occurrence = await createEventApplication({
    runtime: events,
    declarations: [ready],
  }).api.ingest(ready, {
    payload: { requestId: 'review' },
    ingress: { provider: 'conformance', receivedAt: new Date().toISOString() },
  });
  await vi.waitFor(async () => {
    expect(await Effect.runPromise(first.getSnapshot(ref))).toMatchObject({
      status: 'waiting',
      interaction: { id: 'review-event' },
    });
  }, 3000);

  const recovered = createLangGraphTaskExecutor({ checkpointer: new MemorySaver() }).createRuntime(
    storage,
    { events: { runtime: events, declarations: [ready] } },
  );
  recovered.register?.(task);
  await Effect.runPromise(
    recovered.respondToInteraction!(
      ref,
      { interactionId: 'review-event', decision: 'approve' },
      { actor },
    ),
  );
  await vi.waitFor(async () => {
    expect(await Effect.runPromise(recovered.getSnapshot(ref))).toMatchObject({
      status: 'completed',
      result: occurrence.occurrenceId,
    });
  }, 3000);
});

it('rejects an invalid execution lease duration', () => {
  expect(() => createHarness(0).createRuntime()).toThrow(RangeError);
});

it('links LangGraph attempt telemetry to admission and records success and failure', async () => {
  const enqueue = { traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 };
  const span = {};
  const markSuccess = vi.fn();
  const markFailure = vi.fn();
  const withSpan = vi.fn(async (_name, _options, run) => run(span));
  configureServerRuntime({
    telemetry: {
      captureTraceContext: () => enqueue,
      getRuntimeAttributes: () => ({}),
      withSpan,
      markSuccess,
      markFailure,
    },
  });
  try {
    const { storage, createRuntime } = createHarness();
    const runtime = createRuntime();
    const task = defineTask<boolean, string>({
      id: 'LangGraph.attempt-telemetry',
      execution: defineTaskExecution({
        initial: () => ({ step: 'work' }),
        steps: {
          work: {
            run: ({ input, context }) =>
              input
                ? Effect.fail({ reason: 'fixture_failed', message: 'Fixture failed' })
                : context
                    .progress({ message: 'Working' })
                    .pipe(Effect.as({ kind: 'complete', result: 'finished' })),
          },
        },
      }),
      run: () => Effect.dieMessage('Explicit execution required'),
    });
    const success = await Effect.runPromise(runtime.start(task, false));
    const failure = await Effect.runPromise(runtime.start(task, true));
    await vi.waitFor(async () => {
      expect(await Effect.runPromise(storage.getSnapshot(success))).toMatchObject({
        status: 'completed',
        progress: { message: 'Working' },
      });
      expect(await Effect.runPromise(storage.getSnapshot(failure))).toMatchObject({
        status: 'failed',
      });
      expect(markSuccess).toHaveBeenCalledWith(span, undefined);
      expect(markFailure).toHaveBeenCalledWith(span, 'task_attempt_failed', undefined);
    });
    expect(withSpan.mock.calls.map(([name, options]) => [name, options])).toEqual(
      Array.from({ length: 2 }, () => [
        'ontahi.runtime.task.attempt',
        { attributes: { 'ontahi.task.runtime': 'langgraph' }, links: [enqueue] },
      ]),
    );
  } finally {
    resetServerRuntimeForTests();
  }
});
