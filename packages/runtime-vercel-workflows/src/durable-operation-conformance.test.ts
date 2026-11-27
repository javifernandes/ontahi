import {
  createEventApplication,
  type EventOccurrence,
  type EventRuntime,
} from '@ontahi/core/runtime/server';
import {
  createInMemoryTaskStorage,
  taskReconciliationCases,
  verifyTaskReconciliationConformance,
  type TaskDefinition,
  verifyDurableOperationConformance,
  type TaskRunIdentity,
  type TaskSnapshot,
  type TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { Effect, Stream } from 'effect';
import { expect, it, vi } from 'vitest';

import { createVercelWorkflowTaskExecutor } from './executor.js';
import { createVercelWorkflowTaskRuntime } from './runtime.js';

const sdk = vi.hoisted(() => ({
  start: vi.fn(),
  getRun: vi.fn(),
  resumeHook: vi.fn(),
  createHook: vi.fn(),
  sleep: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('workflow/api', () => ({
  start: sdk.start,
  getRun: sdk.getRun,
  resumeHook: sdk.resumeHook,
}));
vi.mock('workflow', () => ({ sleep: sdk.sleep, createHook: sdk.createHook }));

const retainedEvents = (): EventRuntime => {
  const occurrences: EventOccurrence[] = [];
  const subscriptions = new Map<
    string,
    { eventId: string; eventVersion: number; correlation?: Readonly<Record<string, unknown>> }
  >();
  const consumed = new Set<string>();
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
        subscriptions.set(subscription.id, subscription);
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
            !consumed.has(`${subscriptionId}:${value.occurrenceId}`),
        );
        if (!occurrence) return undefined;
        const deliveryId = `${subscriptionId}:${occurrence.occurrenceId}`;
        return {
          claimId: deliveryId,
          consumerId,
          leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          delivery: { kind: 'event-delivery', deliveryId, subscriptionId, occurrence, attempt: 1 },
        };
      },
      acknowledge: async claim => {
        consumed.add(claim.delivery.deliveryId);
      },
      release: async () => {},
      retryAfter: async () => {},
      fail: async () => {},
      cancel: async id => {
        subscriptions.delete(id);
      },
    },
  };
};

const observedStorage = (): TaskStorage => {
  const storage = createInMemoryTaskStorage();
  const history: TaskSnapshot[] = [];
  const record = (snapshot: TaskSnapshot | undefined) =>
    Effect.sync(() => {
      if (snapshot) history.push(snapshot);
    });
  return {
    ...storage,
    update: (ref, patch) => storage.update(ref, patch).pipe(Effect.tap(record)),
    updateIfStatus: (ref, status, patch, expected) =>
      storage.updateIfStatus!(ref, status, patch, expected).pipe(Effect.tap(record)),
    claimInteraction: (ref, id, checkpoint) =>
      storage.claimInteraction(ref, id, checkpoint).pipe(Effect.tap(record)),
    observeSnapshots: ref =>
      Stream.unwrap(
        Effect.map(storage.getSnapshot(ref), initial => {
          let cursor = history.length;
          return Stream.concat(
            Stream.succeed(initial),
            Stream.repeatEffect(
              Effect.sync(() => {
                const updates = history.slice(cursor);
                cursor = history.length;
                return updates.filter(
                  snapshot => snapshot.runId === ref.runId && snapshot.taskId === ref.taskId,
                );
              }).pipe(Effect.delay('5 millis')),
            ).pipe(Stream.flatMap(Stream.fromIterable)),
          );
        }),
      ),
  };
};

it.each([
  'atomic-admission',
  'approval-resumption',
  'retained-event-resumption',
  'ordered-observation',
  'running-cancellation',
] as const)(
  'satisfies %s through the Vercel adapter with a controlled Workflow host',
  async scenario => {
    const storage = observedStorage();
    const cancelProvider = vi.fn(async () => {});
    const events = retainedEvents();
    const jobs = new Map<string, { ref: TaskRunIdentity; execution?: Promise<unknown> }>();
    const hooks = new Map<string, (response: unknown) => void>();
    const sleeping: (() => void)[] = [];

    sdk.start.mockImplementation(async (_workflow, [ref]: [TaskRunIdentity]) => {
      const runId = `workflow-${ref.runId}`;
      jobs.set(runId, { ref });
      return { runId, status: Promise.resolve('pending') };
    });
    sdk.getRun.mockImplementation((id: string) => ({
      // Vercel can report a workflow as running while Ontahí is waiting for an Event or Hook.
      status: Promise.resolve(jobs.get(id)?.execution ? 'running' : 'pending'),
      completedAt: Promise.resolve(null),
      cancel: cancelProvider,
    }));
    sdk.createHook.mockImplementation(({ token }: { token: string }) =>
      Object.assign(new Promise(resolve => hooks.set(token, resolve)), {
        getConflict: async () => null,
        dispose: () => hooks.delete(token),
      }),
    );
    sdk.resumeHook.mockImplementation(async (token: string, response: unknown) => {
      const resume = hooks.get(token);
      if (!resume) throw new Error('Expected a live workflow hook');
      resume(response);
    });
    sdk.sleep.mockImplementation(() => new Promise<void>(resolve => sleeping.push(resolve)));

    await verifyDurableOperationConformance(scenario, {
      open: (task, declarations) => {
        const runtime = createVercelWorkflowTaskRuntime({
          taskRunStore: storage,
          resolveWorkflow: () => async () => undefined,
        });
        const executor = createVercelWorkflowTaskExecutor({
          taskRunStore: storage,
          getTaskDefinition: id => (id === task.id ? task : undefined),
          ...(declarations ? { events: { runtime: events, declarations } } : {}),
        });
        return {
          runtime,
          drive: async () => {
            const job = [...jobs.values()].reverse().find(entry => entry.ref.taskId === task.id);
            if (!job) throw new Error('Expected an accepted workflow');
            if (!job.execution) {
              job.execution = executor.runTask(job.ref, async () => undefined);
              if (scenario === 'running-cancellation') {
                await job.execution.catch(error => {
                  if (error?.reason !== 'task_execution_stopped') throw error;
                });
                return;
              }
              void job.execution.catch(() => {});
              await vi.waitFor(async () => {
                const snapshot = await Effect.runPromise(storage.getSnapshot(job.ref));
                if (snapshot.status === 'failed') throw new Error(snapshot.error?.message);
                if (scenario === 'retained-event-resumption') {
                  if (sleeping.length === 0) throw new Error('Waiting for Workflow sleep');
                } else if (snapshot.status !== 'waiting' && snapshot.status !== 'completed') {
                  throw new Error('Waiting for the persisted workflow boundary');
                }
              });
              return;
            }
            if (scenario === 'running-cancellation') return;
            for (const wake of sleeping.splice(0)) wake();
            await job.execution;
          },
        };
      },
      cancel: async ref => {
        const host = createVercelWorkflowTaskRuntime({
          taskRunStore: storage,
          resolveWorkflow: () => undefined,
        });
        const changed = await Effect.runPromise(host.cancel!(ref));
        return changed !== undefined;
      },
      publish: async (declaration, requestId) => {
        const occurrence = await createEventApplication({
          declarations: [declaration],
          runtime: events,
        }).api.ingest(declaration, {
          payload: { requestId },
          correlation: { requestId },
          ingress: {
            provider: 'fixture',
            deliveryId: requestId,
            receivedAt: new Date().toISOString(),
          },
        });
        return occurrence.occurrenceId;
      },
    });
    if (scenario === 'running-cancellation') expect(cancelProvider).toHaveBeenCalled();
  },
);

it('keeps an uncertain Workflow submission tied to the original admission', async () => {
  const storage = createInMemoryTaskStorage();
  const task = { id: 'Conformance.uncertain-submission', run: () => Effect.succeed(undefined) };
  sdk.start.mockReset();
  sdk.start.mockRejectedValueOnce(new Error('Workflow API response lost'));
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => async () => undefined,
  });
  const admission = { key: 'callback', policy: 'skip-if-completed' } as const;
  await expect(
    Effect.runPromise(Effect.flip(runtime.start(task, undefined, { admission }))),
  ).resolves.toMatchObject({ reason: 'task_effect_outcome_ambiguous' });
  const [failed] = await Effect.runPromise(storage.listRecent());
  expect(await Effect.runPromise(runtime.start(task, undefined, { admission }))).toMatchObject({
    runId: failed?.runId,
    status: 'failed',
    admission: 'reconciliation-required',
  });
  expect(sdk.start).toHaveBeenCalledTimes(1);
});

it('rejects atomic admission before submitting when storage lacks that capability', async () => {
  const storage = createInMemoryTaskStorage();
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: { ...storage, admit: undefined },
    resolveWorkflow: () => async () => undefined,
  });
  sdk.start.mockClear();
  const task = { id: 'Conformance.unsupported-admission', run: () => Effect.succeed(undefined) };
  const admission = { key: 'callback', policy: 'reuse-running' } as const;
  expect(runtime.supportsAtomicAdmission).toBe(false);
  await expect(
    Effect.runPromise(Effect.flip(runtime.start(task, undefined, { admission }))),
  ).resolves.toMatchObject({ reason: 'task_admission_unavailable' });
  expect(await Effect.runPromise(storage.listRecent())).toEqual([]);
  expect(sdk.start).not.toHaveBeenCalled();
});

// The controlled SDK has no process-loss replay. The Local World integration covers SIGKILL.
it.each(taskReconciliationCases.filter(row => row.scenario !== 'worker-recreated'))(
  'preserves external-effect reconciliation for $scenario inside a Workflow',
  row => {
    const storage = createInMemoryTaskStorage();
    let definition: TaskDefinition<any, any> | undefined;
    sdk.getRun.mockReturnValue({
      status: Promise.resolve('running'),
      completedAt: Promise.resolve(null),
    });
    const executor = createVercelWorkflowTaskExecutor({
      taskRunStore: storage,
      getTaskDefinition: id => (definition?.id === id ? definition : undefined),
    });
    sdk.start.mockImplementation(async (_workflow, [ref]: [TaskRunIdentity]) => {
      setImmediate(() => {
        void executor.runTask(ref, async () => undefined).catch(() => {});
      });
      return { runId: `workflow-${ref.runId}`, status: Promise.resolve('pending') };
    });
    return verifyTaskReconciliationConformance(row, {
      createStorage: () => storage,
      createRuntime: store => {
        const runtime = createVercelWorkflowTaskRuntime({
          taskRunStore: store,
          resolveWorkflow: () => async () => undefined,
        });
        return {
          ...runtime,
          start: (task, input, options) =>
            Effect.suspend(() => {
              definition = task;
              return runtime.start(task, input, options);
            }),
        };
      },
    });
  },
);

it('keeps the cancellation fence when the provider rejects and lets the host retry', async () => {
  const storage = createInMemoryTaskStorage();
  const ref = { taskId: 'Conformance.cancel-retry', runId: 'run' };
  await Effect.runPromise(
    storage.create({
      ...ref,
      runtime: { name: 'vercel-workflow', runId: 'provider-run' },
    }),
  );
  await Effect.runPromise(storage.update(ref, { status: 'running' }));
  const cancel = vi.fn(async () => {}).mockRejectedValueOnce(new Error('provider disconnected'));
  sdk.getRun.mockReturnValue({ status: Promise.resolve('running'), cancel });
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => undefined,
  });
  await expect(Effect.runPromise(Effect.flip(runtime.cancel!(ref)))).resolves.toMatchObject({
    reason: 'task_provider_cancellation_failed',
  });
  await expect(Effect.runPromise(runtime.getSnapshot(ref))).resolves.toMatchObject({
    status: 'cancelled',
    error: { code: 'task_effect_outcome_ambiguous' },
  });
  await expect(Effect.runPromise(runtime.cancel!(ref))).resolves.toBeUndefined();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it('journals a provider-only failure for an active observer', async () => {
  const storage = observedStorage();
  const ref = { taskId: 'Conformance.provider-only-failure', runId: 'run' };
  await Effect.runPromise(
    storage.create({ ...ref, runtime: { name: 'vercel-workflow', runId: 'provider-run' } }),
  );
  await Effect.runPromise(storage.update(ref, { status: 'running' }));
  sdk.getRun.mockReturnValue({ status: Promise.resolve('failed') });
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => undefined,
  });
  const updates = await Effect.runPromise(
    runtime.observe!(ref).pipe(Stream.take(2), Stream.runCollect, Effect.timeout('4 seconds')),
  );
  expect(Array.from(updates, snapshot => snapshot.status)).toEqual(['running', 'failed']);
  expect(await Effect.runPromise(storage.getSnapshot(ref))).toMatchObject({ status: 'failed' });
});

it('retains admission when cancellation wins before a lost submission response', async () => {
  const storage = createInMemoryTaskStorage();
  const task = { id: 'Conformance.cancel-submission', run: () => Effect.void };
  const ref = { taskId: task.id, runId: 'run' };
  const admission = { key: 'callback', policy: 'skip-if-completed' } as const;
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => async () => undefined,
  });
  sdk.start.mockReset();
  sdk.start.mockImplementationOnce(async () => {
    const cancelled = await Effect.runPromise(runtime.cancel!(ref));
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      error: { code: 'task_effect_outcome_ambiguous' },
    });
    expect(await Effect.runPromise(runtime.start(task, undefined, { admission }))).toMatchObject({
      runId: ref.runId,
      admission: 'reconciliation-required',
    });
    throw new Error('Workflow API response lost');
  });
  await expect(
    Effect.runPromise(Effect.flip(runtime.start(task, undefined, { ...ref, admission }))),
  ).resolves.toMatchObject({ reason: 'task_effect_outcome_ambiguous' });
  expect(await Effect.runPromise(runtime.start(task, undefined, { admission }))).toMatchObject({
    runId: ref.runId,
    status: 'cancelled',
    admission: 'reconciliation-required',
  });
  expect(sdk.start).toHaveBeenCalledTimes(1);
});

it('returns the stored cancellation when the initial provider status arrives late', async () => {
  const storage = createInMemoryTaskStorage();
  const task = { id: 'Conformance.cancel-status', run: () => Effect.void };
  const ref = { taskId: task.id, runId: 'run' };
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => async () => undefined,
  });
  const cancel = vi.fn(async () => {});
  sdk.getRun.mockReturnValue({ status: Promise.resolve('running'), cancel });
  sdk.start.mockReset();
  sdk.start.mockResolvedValueOnce({
    runId: 'provider-run',
    get status() {
      return Effect.runPromise(runtime.cancel!(ref)).then(() => 'running');
    },
  });
  await expect(Effect.runPromise(runtime.start(task, undefined, ref))).resolves.toMatchObject({
    status: 'cancelled',
  });
  expect(cancel).toHaveBeenCalledOnce();
});

it('recomputes cancellation when a queued Workflow acquires a provider run ID', async () => {
  const storage = createInMemoryTaskStorage();
  const ref = { taskId: 'Conformance.attach-during-cancel', runId: 'run' };
  await Effect.runPromise(storage.create({ ...ref, runtime: { name: 'vercel-workflow' } }));
  const cancel = vi.fn(async () => {});
  sdk.getRun.mockReturnValue({ status: Promise.resolve('running'), cancel });
  const updateIfStatus = vi.fn(storage.updateIfStatus!);
  updateIfStatus.mockImplementationOnce((identity, status, patch, expected) =>
    Effect.zipRight(
      storage.attachRuntimeRef(ref, { name: 'vercel-workflow', runId: 'provider-run' }),
      storage.updateIfStatus!(identity, status, patch, expected),
    ),
  );
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: { ...storage, updateIfStatus },
    resolveWorkflow: () => undefined,
  });
  await expect(Effect.runPromise(runtime.cancel!(ref))).resolves.toMatchObject({
    status: 'cancelled',
    error: { code: 'task_effect_outcome_ambiguous' },
  });
  expect(updateIfStatus).toHaveBeenCalledTimes(2);
  expect(cancel).toHaveBeenCalledOnce();
});

it('skips Workflow submission when cancellation wins before the submission fence', async () => {
  const storage = createInMemoryTaskStorage();
  const task = { id: 'Conformance.cancel-before-submission', run: () => Effect.void };
  const ref = { taskId: task.id, runId: 'run' };
  const admission = { key: 'callback', policy: 'skip-if-completed' } as const;
  const updateIfStatus = vi.fn(storage.updateIfStatus!);
  const runtime = createVercelWorkflowTaskRuntime({
    taskRunStore: { ...storage, updateIfStatus },
    resolveWorkflow: () => async () => undefined,
  });
  updateIfStatus.mockImplementationOnce((identity, status, patch, expected) =>
    Effect.zipRight(
      runtime.cancel!(ref),
      storage.updateIfStatus!(identity, status, patch, expected),
    ),
  );
  sdk.start.mockReset();
  await expect(
    Effect.runPromise(runtime.start(task, undefined, { runId: ref.runId, admission })),
  ).resolves.toMatchObject({ status: 'cancelled' });
  const cancelled = await Effect.runPromise(storage.loadSource(ref));
  expect(cancelled.error).toBeUndefined();
  expect(sdk.start).not.toHaveBeenCalled();
});

it('uses Event-wait cancellation when a Workflow owns a pending subscription', async () => {
  const storage = createInMemoryTaskStorage();
  const ref = { taskId: 'Conformance.cancel-event', runId: 'run' };
  await Effect.runPromise(storage.create({ ...ref, runtime: { name: 'vercel-workflow' } }));
  await Effect.runPromise(
    storage.update(ref, {
      status: 'waiting',
      checkpoint: {
        version: 1,
        state: { step: 'wait' },
        eventWait: {
          id: 'wait-id',
          kind: 'event',
          eventId: 'Ready',
          eventVersion: 1,
          createdAt: new Date().toISOString(),
        },
      },
    }),
  );
  const host = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => undefined,
  });
  await expect(Effect.runPromise(Effect.flip(host.cancel!(ref)))).resolves.toMatchObject({
    reason: 'task_event_wait_cancel_required',
  });
  await expect(Effect.runPromise(host.cancelEventWait!(ref))).resolves.toMatchObject({
    status: 'cancelled',
  });
});

it('cancels the provider when its run ID arrives after local cancellation', async () => {
  const storage = createInMemoryTaskStorage();
  const task = { id: 'Conformance.late-provider-id', run: () => Effect.void };
  const ref = { taskId: task.id, runId: 'run' };
  const host = createVercelWorkflowTaskRuntime({
    taskRunStore: storage,
    resolveWorkflow: () => async () => undefined,
  });
  const cancel = vi.fn(async () => {});
  sdk.getRun.mockReturnValue({ status: Promise.resolve('running'), cancel });
  sdk.start.mockReset();
  sdk.start.mockImplementationOnce(async () => {
    await Effect.runPromise(host.cancel!(ref));
    return { runId: 'provider-run', status: Promise.resolve('running') };
  });
  await expect(Effect.runPromise(host.start(task, undefined, ref))).resolves.toMatchObject({
    status: 'cancelled',
  });
  const source = await Effect.runPromise(storage.loadSource(ref));
  expect(source).toMatchObject({
    runtime: { runId: 'provider-run' },
    error: { code: 'task_effect_outcome_ambiguous' },
  });
  expect(cancel).toHaveBeenCalledOnce();
});
