import { graphSchema } from '@ontahi/core/data-graph';
import {
  createEventApplication,
  defineEvent,
  defineTask,
  defineTaskExecution,
  defineTaskExecutionStep,
} from '@ontahi/core/runtime/server';
import {
  createInProcessTaskRuntime,
  verifyTaskStorageConformance,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startMysqlTestDatabase } from '../data-graph/mysql.test-support.js';
import { createMysqlEventRuntime } from '../events/runtime.js';
import { createMysqlEventSchemaSql } from '../events/schema.js';

import { createMysqlTaskStorage } from './runtime.js';
import { createMysqlTaskSchemaSql } from './schema.js';

const taskTables = { runs: 'ontahi_task_storage_test_runs' } as const;
const eventTables = {
  occurrences: 'ontahi_task_test_event_occurrences',
  subscriptions: 'ontahi_task_test_event_subscriptions',
  deliveries: 'ontahi_task_test_event_deliveries',
} as const;

describe('MySQL Task Storage', () => {
  let pool: Pool;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const database = await startMysqlTestDatabase();
    pool = database.pool;
    close = database.close;
    await pool.query(`DROP TABLE IF EXISTS \`${eventTables.deliveries}\``);
    await pool.query(`DROP TABLE IF EXISTS \`${eventTables.subscriptions}\``);
    await pool.query(`DROP TABLE IF EXISTS \`${eventTables.occurrences}\``);
    await pool.query(`DROP TABLE IF EXISTS \`${taskTables.runs}\``);
    for (const statement of [
      ...createMysqlTaskSchemaSql(taskTables),
      ...createMysqlEventSchemaSql(eventTables),
    ])
      await pool.query(statement);
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM \`${eventTables.deliveries}\``);
    await pool.query(`DELETE FROM \`${eventTables.subscriptions}\``);
    await pool.query(`DELETE FROM \`${eventTables.occurrences}\``);
    await pool.query(`DELETE FROM \`${taskTables.runs}\``);
  });

  afterAll(async () => close?.());

  const storage = () =>
    createMysqlTaskStorage({
      pool,
      tables: taskTables,
      now: () => new Date('2026-10-15T00:00:00.000Z'),
    });

  it('passes the provider-neutral Task Storage conformance proof', async () => {
    await verifyTaskStorageConformance({
      createStorage: storage,
      identityPrefix: 'mysql-conformance',
    });
  });

  it('atomically claims and cancels waits across independent storage instances', async () => {
    const first = storage();
    const second = storage();
    const interactionRef = { taskId: 'TodoList.export', runId: 'interaction-run' };
    await Effect.runPromise(first.create(interactionRef));
    await Effect.runPromise(
      first.update(interactionRef, {
        status: 'waiting',
        checkpoint: {
          version: 1,
          state: { step: 'approval' },
          interaction: {
            id: 'approval',
            kind: 'approval',
            prompt: 'Continue?',
            proposal: { id: 'proposal', summary: 'Continue.', requests: [{}] },
            createdAt: '2026-10-15T00:00:00.000Z',
          },
        },
      }),
    );
    const resumed = {
      version: 1 as const,
      state: { step: 'approved' },
      response: { interactionId: 'approval', decision: 'approve' as const },
    };
    const claims = await Promise.all([
      Effect.runPromise(first.claimInteraction(interactionRef, 'approval', resumed)),
      Effect.runPromise(second.claimInteraction(interactionRef, 'approval', resumed)),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);

    const eventRef = { taskId: 'TodoList.export', runId: 'cancel-run' };
    await Effect.runPromise(first.create(eventRef));
    await Effect.runPromise(
      first.update(eventRef, {
        status: 'waiting',
        checkpoint: {
          version: 1,
          state: { step: 'wait' },
          eventWait: {
            id: 'export-ready',
            kind: 'event',
            eventId: 'TodoListExportReady',
            eventVersion: 1,
            createdAt: '2026-10-15T00:00:00.000Z',
          },
        },
      }),
    );
    const cancellations = await Promise.all([
      Effect.runPromise(first.cancelEvent(eventRef, 'export-ready', 'cancelled')),
      Effect.runPromise(second.cancelEvent(eventRef, 'export-ready', 'cancelled')),
    ]);
    expect(cancellations.filter(Boolean)).toHaveLength(1);
  });

  it('returns canonical missing failures', async () => {
    await expect(
      Effect.runPromise(
        Effect.flip(storage().getSnapshot({ taskId: 'missing', runId: 'missing' })),
      ),
    ).resolves.toMatchObject({ reason: 'task_run_not_found' });
  });

  it('round-trips string JSON values and applies canonical actor matching', async () => {
    const taskStorage = storage();
    const upper = { taskId: 'TodoList.export', runId: 'upper-actor' };
    const lower = { taskId: 'TodoList.export', runId: 'lower-actor' };
    await Effect.runPromise(
      taskStorage.create({
        ...upper,
        input: 'hello',
        trigger: { cause: 'user_request', actor: { kind: 'user', id: 'Alex' } },
      }),
    );
    await Effect.runPromise(taskStorage.update(upper, { result: 'true' }));
    await Effect.runPromise(
      taskStorage.create({
        ...lower,
        trigger: { cause: 'user_request', actor: { kind: 'user', id: 'alex' } },
      }),
    );

    await expect(Effect.runPromise(taskStorage.loadSource(upper))).resolves.toMatchObject({
      input: 'hello',
      result: 'true',
    });
    await expect(
      Effect.runPromise(taskStorage.listRecentForActor({ kind: 'user', id: 'Alex' }, 20)),
    ).resolves.toMatchObject([{ runId: upper.runId }]);
    await expect(
      Effect.runPromise(taskStorage.listRecentForActor({ kind: 'user' }, 20)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: upper.runId }),
        expect.objectContaining({ runId: lower.runId }),
      ]),
    );
  });

  it('resumes a Todo Event wait after recreating both MySQL-backed runtimes', async () => {
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
    const firstEvents = createMysqlEventRuntime({ pool, tables: eventTables });
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

    const recoveredEvents = createMysqlEventRuntime({ pool, tables: eventTables });
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
        provider: 'mysql-restart-fixture',
        receivedAt: '2026-10-15T00:01:00.000Z',
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
