import { graphSchema } from '@ontahi/core';
import {
  createEventApplication,
  defineEvent,
  defineTask,
  defineTaskExecution,
  defineTaskExecutionStep,
} from '@ontahi/core/runtime/server';
import {
  createInProcessTaskRuntime,
  createTaskEventResume,
  durableOperationConformanceCases,
  verifyDurableOperationConformance,
  taskEventWaitSubscriptionId,
  taskReconciliationCases,
  verifyTaskReconciliationConformance,
  verifyTaskStorageConformance,
} from '@ontahi/core/runtime/server/tasks';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Chunk, Deferred, Effect, Stream } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPostgresEventRuntime } from '../events/runtime.js';
import { createPostgresEventSchemaSql } from '../events/schema.js';

import { createPostgresTaskStorage } from './runtime.js';
import { createPostgresTaskSchemaSql } from './schema.js';
import { createPostgresTaskWorker } from './worker.js';

const taskTables = { runs: 'ontahi_task_storage_test_runs' } as const;
const eventTables = {
  occurrences: 'ontahi_task_storage_test_event_occurrences',
  subscriptions: 'ontahi_task_storage_test_event_subscriptions',
  deliveries: 'ontahi_task_storage_test_event_deliveries',
} as const;

describe('PostgreSQL Task Storage', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool;

  beforeAll(async () => {
    const externalConnectionUri = process.env.ONTAHI_POSTGRES_TEST_URL;
    if (externalConnectionUri) pool = new Pool({ connectionString: externalConnectionUri });
    else {
      container = await new PostgreSqlContainer('postgres:17-alpine').start();
      pool = new Pool({ connectionString: container.getConnectionUri() });
    }
    for (const statement of [
      ...createPostgresTaskSchemaSql(taskTables),
      ...createPostgresEventSchemaSql(eventTables),
    ])
      await pool.query(statement);
  });

  beforeEach(() =>
    pool.query(
      `TRUNCATE ${taskTables.runs}, ${eventTables.deliveries}, ${eventTables.subscriptions}, ${eventTables.occurrences} CASCADE`,
    ),
  );

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const storage = () =>
    createPostgresTaskStorage({
      pool,
      tables: taskTables,
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    });

  it('passes the provider-neutral Task Storage conformance proof', async () => {
    await verifyTaskStorageConformance({
      createStorage: storage,
      identityPrefix: 'postgres-conformance',
    });
  });

  it.each(taskReconciliationCases)('reconciles a remote Customer when $scenario', row =>
    verifyTaskReconciliationConformance(row, {
      createStorage: storage,
      createRuntime: store => createInProcessTaskRuntime({ storage: store }),
    }),
  );

  it.each(taskReconciliationCases)(
    'queue worker reconciles a remote Customer when $scenario',
    row =>
      verifyTaskReconciliationConformance(row, {
        createStorage: storage,
        createRuntime: store =>
          createInProcessTaskRuntime({ storage: store, deferExplicitExecution: true }),
        runWorker: (task, signal) =>
          createPostgresTaskWorker({
            pool,
            tables: taskTables,
            tasks: [task],
          }).runOnce(signal),
      }),
  );

  it('releases an approval wait and lets a worker resume the claimed response', async () => {
    const task = defineTask<undefined, string>({
      id: 'Customer.approval',
      execution: defineTaskExecution<undefined, { step: string }, string>({
        initial: () => ({ step: 'approve' }),
        steps: {
          approve: {
            run: ({ response, state }) =>
              Effect.succeed(
                response && 'decision' in response
                  ? { kind: 'complete', result: response.decision }
                  : {
                      kind: 'interaction',
                      state,
                      interaction: {
                        id: 'customer-approval',
                        prompt: 'Approve?',
                        proposal: { id: 'proposal', summary: 'Approve customer', requests: [{}] },
                      },
                    },
              ),
          },
        },
      }),
      run: () => Effect.dieMessage('Explicit execution required'),
    });
    const runtime = createInProcessTaskRuntime({
      storage: storage(),
      deferExplicitExecution: true,
    });
    const worker = createPostgresTaskWorker({ pool, tables: taskTables, tasks: [task] });
    await Effect.runPromise(
      storage().create({
        taskId: task.id,
        runId: 'inline-run',
        checkpoint: { version: 1, state: { step: 'approve' } },
      }),
    );
    expect(await worker.runOnce()).toBeUndefined();
    const actor = { kind: 'system' } as const;
    const queued = await Effect.runPromise(
      runtime.start(task, undefined, { runId: 'cancel-queued' }),
    );
    expect(await worker.cancel(queued)).toBe(true);
    await expect(Effect.runPromise(runtime.getSnapshot(queued))).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(await worker.runOnce()).toBeUndefined();
    const run = await Effect.runPromise(
      runtime.start(task, undefined, {
        trigger: { cause: 'system', actor },
      }),
    );
    const ref = { taskId: run.taskId, runId: run.runId };
    expect(await worker.runOnce()).toEqual(ref);
    expect(await worker.runOnce()).toBeUndefined();
    await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
      status: 'waiting',
      interaction: { id: 'customer-approval' },
    });
    await Effect.runPromise(
      runtime.respondToInteraction!(
        run,
        { interactionId: 'customer-approval', decision: 'approve' },
        { actor },
      ),
    );
    await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
      status: 'running',
    });
    expect(await worker.runOnce()).toEqual(ref);
    await expect(Effect.runPromise(runtime.getSnapshot(run))).resolves.toMatchObject({
      status: 'completed',
      result: 'approve',
    });
    const pending = await Effect.runPromise(
      runtime.start(task, undefined, {
        trigger: { cause: 'system', actor },
        runId: 'cancel-waiting',
      }),
    );
    const locking = await pool.connect();
    try {
      await locking.query('BEGIN');
      await locking.query(
        `SELECT 1 FROM ${taskTables.runs} WHERE task_id = $1 AND run_id = $2 FOR UPDATE`,
        [pending.taskId, pending.runId],
      );
      expect(await worker.runOnce()).toBeUndefined();
    } finally {
      await locking.query('ROLLBACK');
      locking.release();
    }
    await worker.runOnce();
    expect(await worker.cancel(pending)).toBe(true);
    await expect(Effect.runPromise(runtime.getSnapshot(pending))).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(await worker.runOnce()).toBeUndefined();
  });

  it.each(['reuse-running', 'skip-if-completed'] as const)(
    'enforces %s across storage instances and lifecycle transitions',
    async policy => {
      const first = storage();
      const second = storage();
      const admit = (store: ReturnType<typeof storage>, runId: string) =>
        Effect.runPromise(
          store.admit!({ taskId: 'Customer.sync', runId }, { key: 'delivery', policy }),
        );
      const contenders = await Promise.all([
        admit(first, 'candidate-a'),
        admit(second, 'candidate-b'),
      ]);
      expect(contenders.filter(result => result.created)).toHaveLength(1);
      expect(contenders[0].source.runId).toBe(contenders[1].source.runId);

      let active = contenders[0].source;
      for (const status of ['running', 'waiting'] as const) {
        await Effect.runPromise(first.update(active, { status }));
        const reused = await admit(second, `while-${status}`);
        expect(reused.created).toBe(false);
        expect(reused.source.runId).toBe(active.runId);
      }
      for (const status of ['failed', 'cancelled'] as const) {
        await Effect.runPromise(first.update(active, { status }));
        const replacement = await admit(second, `after-${status}`);
        expect(replacement.created).toBe(true);
        active = replacement.source;
      }
      await Effect.runPromise(first.update(active, { status: 'completed' }));
      const afterCompletion = await admit(second, 'after-completed');
      expect(afterCompletion.created).toBe(policy === 'reuse-running');
      expect(afterCompletion.source.runId).toBe(
        policy === 'reuse-running' ? 'after-completed' : active.runId,
      );
      await Effect.runPromise(
        first.update(afterCompletion.source, {
          status: 'failed',
          error: { code: 'task_effect_outcome_ambiguous', message: 'Reconciliation needed' },
        }),
      );
      const blocked = await admit(second, 'after-ambiguous');
      expect(blocked.created).toBe(false);
      expect(blocked.source.runId).toBe(afterCompletion.source.runId);
    },
  );

  it('atomically cancels an Event wait once', async () => {
    const store = storage();
    const ref = { taskId: 'TodoList.export', runId: 'cancel-run' };
    await Effect.runPromise(store.create(ref));
    await Effect.runPromise(
      store.update(ref, {
        status: 'waiting',
        checkpoint: {
          version: 1,
          state: { step: 'wait' },
          eventWait: {
            id: 'export-ready',
            kind: 'event',
            eventId: 'TodoListExportReady',
            eventVersion: 1,
            createdAt: '2026-10-14T00:00:00.000Z',
          },
        },
      }),
    );

    const outcomes = await Promise.all([
      Effect.runPromise(store.cancelEvent(ref, 'export-ready', 'cancelled')),
      Effect.runPromise(store.cancelEvent(ref, 'export-ready', 'cancelled')),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    await expect(Effect.runPromise(store.getSnapshot(ref))).resolves.toMatchObject({
      status: 'cancelled',
      waitingOn: undefined,
    });
  });

  it('returns canonical missing failures', async () => {
    await expect(
      Effect.runPromise(
        Effect.flip(storage().getSnapshot({ taskId: 'missing', runId: 'missing' })),
      ),
    ).resolves.toMatchObject({ reason: 'task_run_not_found' });
  });

  it('journals Vercel snapshots and rejects a stale completion after cancellation', async () => {
    const writer = storage();
    const reader = storage();
    const ref = { taskId: 'Vercel.export', runId: 'workflow-run' };
    await Effect.runPromise(writer.create({ ...ref, runtime: { name: 'vercel-workflow' } }));
    const subscribed = await Effect.runPromise(Deferred.make<void>());
    const controller = new AbortController();
    const observed = Effect.runPromise(
      reader.observeSnapshots(ref).pipe(
        Stream.tap(() => Deferred.succeed(subscribed, undefined)),
        Stream.takeUntil(snapshot => snapshot.status === 'cancelled'),
        Stream.runCollect,
        Effect.timeout('5 seconds'),
      ),
      { signal: controller.signal },
    );
    try {
      await Effect.runPromise(Deferred.await(subscribed).pipe(Effect.timeout('5 seconds')));
      await Effect.runPromise(writer.updateIfStatus!(ref, 'queued', { status: 'running' }));
      await Effect.runPromise(writer.updateIfStatus!(ref, 'running', { status: 'cancelled' }));
      await expect(
        Effect.runPromise(
          writer.updateIfStatus!(ref, 'running', { status: 'completed', result: 'late' }),
        ),
      ).resolves.toBeUndefined();
      expect(Chunk.toReadonlyArray(await observed).map(snapshot => snapshot.status)).toEqual([
        'queued',
        'running',
        'cancelled',
      ]);
      await expect(Effect.runPromise(reader.getSnapshot(ref))).resolves.toMatchObject({
        status: 'cancelled',
        result: undefined,
      });
    } finally {
      controller.abort();
      await observed.catch(() => {});
    }
  });

  it.each(durableOperationConformanceCases)('satisfies the durable contract for %s', scenario =>
    verifyDurableOperationConformance(scenario, {
      open: (task, declarations) => {
        const runtime = createInProcessTaskRuntime({
          storage: storage(),
          deferExplicitExecution: true,
        });
        runtime.register?.(task);
        const worker = createPostgresTaskWorker({
          pool,
          tables: taskTables,
          tasks: [task],
          ...(declarations ? { events: { tables: eventTables, declarations } } : {}),
        });
        return {
          runtime,
          drive: async () => {
            await worker.runOnce();
          },
        };
      },
      publish: async (declaration, requestId) => {
        const runtime = createPostgresEventRuntime({ pool, tables: eventTables });
        const occurrence = await createEventApplication({
          runtime,
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
      expireClaim: async ref => {
        // Move the persisted deadline without stopping the original worker.
        await pool.query(
          `UPDATE ${taskTables.runs} SET worker_lease_until = clock_timestamp() - interval '1 second'
           WHERE task_id = $1 AND run_id = $2`,
          [ref.taskId, ref.runId],
        );
      },
      cancel: ref => createPostgresTaskWorker({ pool, tables: taskTables, tasks: [] }).cancel(ref),
    }),
  );

  it.each(['while waiting', 'after persisting the claim', 'after timeout cleanup fails'] as const)(
    'resumes a retained Event once after restarting the queue worker %s',
    async restart => {
      const Ready = defineEvent({
        id: 'CustomerReady',
        version: 1,
        description: 'The remote customer is ready.',
        payload: graphSchema.object({ customerId: graphSchema.string() }),
      });
      const continued = vi.fn();
      const task = defineTask<{ requestId: string }, string>({
        id: 'Customer.awaitReady',
        execution: defineTaskExecution<{ requestId: string }, { step: 'wait' }, string>({
          initial: () => ({ step: 'wait' }),
          steps: {
            wait: {
              run: ({ input, state, event }) =>
                Effect.sync(() => {
                  if (event) {
                    continued(event.occurrenceId);
                    return {
                      kind: 'complete',
                      result: (event.payload as { customerId: string }).customerId,
                    };
                  }
                  return {
                    kind: 'event',
                    state,
                    event: {
                      id: 'ready',
                      declaration: Ready,
                      correlation: { requestId: input.requestId },
                    },
                  };
                }),
            },
          },
        }),
        run: () => Effect.dieMessage('Explicit execution required'),
      });
      const createWorker = () =>
        createPostgresTaskWorker({
          pool,
          tables: taskTables,
          tasks: [task],
          events: { declarations: [Ready], tables: eventTables },
        });
      const api = createInProcessTaskRuntime({ storage: storage(), deferExplicitExecution: true });
      const run = await Effect.runPromise(api.start(task, { requestId: 'request-1' }));
      const ref = { taskId: run.taskId, runId: run.runId };
      expect(await createWorker().runOnce()).toEqual(ref);
      await expect(Effect.runPromise(api.getSnapshot(run))).resolves.toMatchObject({
        status: 'waiting',
        waitingOn: { kind: 'event', eventId: Ready.id },
      });
      expect(continued).not.toHaveBeenCalled();

      if (restart === 'after timeout cleanup fails') {
        const worker = createWorker();
        expect(await worker.runOnce()).toBeUndefined();
        const store = storage();
        const source = await Effect.runPromise(store.loadSource(ref));
        await Effect.runPromise(
          store.update(ref, {
            checkpoint: {
              ...source.checkpoint!,
              eventWait: { ...source.checkpoint!.eventWait!, timeoutAt: new Date(0).toISOString() },
            },
          }),
        );
        await pool.query(`
          CREATE FUNCTION reject_event_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Injected Event cleanup failure'; END
          $$;
          CREATE TRIGGER reject_event_cleanup BEFORE UPDATE OF active ON ${eventTables.subscriptions}
            FOR EACH ROW WHEN (NEW.active = false) EXECUTE FUNCTION reject_event_cleanup();
        `);
        try {
          await expect(worker.runOnce()).rejects.toMatchObject({ reason: 'task_failed' });
          await expect(Effect.runPromise(api.getSnapshot(run))).resolves.toMatchObject({
            status: 'waiting',
          });
        } finally {
          await pool.query(`
            DROP TRIGGER reject_event_cleanup ON ${eventTables.subscriptions};
            DROP FUNCTION reject_event_cleanup();
          `);
        }
        expect(await worker.runOnce()).toEqual(ref);
        await expect(Effect.runPromise(api.getSnapshot(run))).resolves.toMatchObject({
          status: 'failed',
          error: { code: 'task_event_wait_timed_out' },
        });
        return;
      }

      // No worker or subscription is active when the external delivery arrives.
      const producer = createPostgresEventRuntime({ pool, tables: eventTables });
      const events = createEventApplication({ runtime: producer, declarations: [Ready] }).api;
      const ingest = (requestId: string, deliveryId: string, customerId: string) =>
        events.ingest(Ready, {
          payload: { customerId },
          correlation: { requestId },
          ingress: { provider: 'fixture', deliveryId, receivedAt: new Date().toISOString() },
        });
      await ingest('unrelated', 'other-delivery', 'wrong-customer');
      const first = await ingest('request-1', 'duplicate-delivery', 'customer-1');
      const duplicate = await ingest('request-1', 'duplicate-delivery', 'customer-1');
      expect(duplicate.occurrenceId).not.toBe(first.occurrenceId);

      if (restart === 'after persisting the claim') {
        const waiting = await Effect.runPromise(storage().loadSource(ref));
        const checkpoint = waiting.checkpoint!;
        const wait = checkpoint.eventWait!;
        const subscriptionId = taskEventWaitSubscriptionId(ref, wait.id);
        const delivery = producer.durableDelivery!;
        await delivery.register({
          id: subscriptionId,
          eventId: wait.eventId,
          eventVersion: wait.eventVersion,
          correlation: wait.correlation,
        });
        const claim = (await delivery.claim(subscriptionId, {
          consumerId: 'stopped-worker',
          leaseMs: 10_000,
        }))!;
        await Effect.runPromise(
          storage().claimEvent(ref, wait.id, {
            version: 1,
            state: checkpoint.state,
            eventOccurrence: claim.delivery.occurrence,
            eventResume: createTaskEventResume(wait, claim),
          }),
        );
        // The Task owns its continuation even though the original worker never acknowledged.
      }

      const outcomes = await Promise.all([createWorker().runOnce(), createWorker().runOnce()]);
      expect(outcomes.filter(Boolean)).toEqual([ref]);
      expect(continued).toHaveBeenCalledExactlyOnceWith(first.occurrenceId);
      await expect(
        producer.deliveryInspection!.inspect(taskEventWaitSubscriptionId(ref, 'ready'), {
          states: ['acknowledged'],
          limit: 10,
        }),
      ).resolves.toEqual([expect.objectContaining({ occurrenceId: first.occurrenceId })]);
      await expect(Effect.runPromise(api.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: 'customer-1',
      });

      await ingest('request-1', 'duplicate-delivery', 'customer-1');
      expect(await createWorker().runOnce()).toBeUndefined();
      expect(continued).toHaveBeenCalledTimes(1);
    },
  );

  it('resumes a Todo Event wait after recreating both PostgreSQL-backed runtimes', async () => {
    const ExportReady = defineEvent({
      id: 'TodoListExportReady',
      version: 1,
      description: 'A requested Todo list export is ready.',
      payload: graphSchema.object({ requestId: graphSchema.string(), url: graphSchema.string() }),
    });
    const exportTask = defineTask({
      id: 'TodoList.export',
      execution: defineTaskExecution<{ requestId: string }, { step: 'wait' }, { url: string }>({
        initial: () => ({ step: 'wait' }),
        steps: {
          wait: defineTaskExecutionStep({
            run: ({ input, state, event }) =>
              Effect.succeed(
                event
                  ? {
                      kind: 'complete' as const,
                      result: { url: (event.payload as { url: string }).url },
                    }
                  : {
                      kind: 'event' as const,
                      state,
                      event: {
                        id: `export:${input.requestId}`,
                        declaration: ExportReady,
                        correlation: { requestId: input.requestId },
                      },
                    },
              ),
          }),
        },
      }),
      run: () => Effect.dieMessage('Explicit execution must run.'),
    });
    const firstEvents = createPostgresEventRuntime({ pool, tables: eventTables });
    const first = createInProcessTaskRuntime({
      storage: storage(),
      events: { runtime: firstEvents, declarations: [ExportReady] },
    });
    const run = await Effect.runPromise(
      first.start(exportTask, { requestId: 'restart-request' }, { runId: 'restart-run' }),
    );
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(first.getSnapshot(run))).resolves.toMatchObject({
        status: 'waiting',
        waitingOn: { eventId: ExportReady.id },
      });
    });

    const recoveredEvents = createPostgresEventRuntime({ pool, tables: eventTables });
    const recovered = createInProcessTaskRuntime({
      storage: storage(),
      events: { runtime: recoveredEvents, declarations: [ExportReady] },
    });
    recovered.register?.(exportTask);
    await Effect.runPromise(recovered.getSnapshot(run));
    await createEventApplication({
      declarations: [ExportReady],
      runtime: recoveredEvents,
    }).api.ingest(ExportReady, {
      payload: {
        requestId: 'restart-request',
        url: 'https://example.test/restarted-export.json',
      },
      correlation: { requestId: 'restart-request' },
      ingress: {
        provider: 'postgres-restart-fixture',
        receivedAt: '2026-10-14T00:01:00.000Z',
        deliveryId: 'restart-delivery',
      },
    });
    await vi.waitFor(async () => {
      await expect(Effect.runPromise(recovered.getSnapshot(run))).resolves.toMatchObject({
        status: 'completed',
        result: { url: 'https://example.test/restarted-export.json' },
      });
    });
  });
});
