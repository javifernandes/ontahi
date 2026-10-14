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
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPostgresEventRuntime } from '../events/runtime.js';
import { createPostgresEventSchemaSql } from '../events/schema.js';

import { createPostgresTaskStorage } from './runtime.js';
import { createPostgresTaskSchemaSql } from './schema.js';

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
    for (const statement of [...createPostgresTaskSchemaSql(), ...createPostgresEventSchemaSql()])
      await pool.query(statement);
  });

  beforeEach(() =>
    pool.query(
      'TRUNCATE ontahi_task_runs, ontahi_event_deliveries, ontahi_event_subscriptions, ontahi_event_occurrences CASCADE',
    ),
  );

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const storage = () =>
    createPostgresTaskStorage({ pool, now: () => new Date('2026-10-14T00:00:00.000Z') });

  it('passes the provider-neutral Task Storage conformance proof', async () => {
    await verifyTaskStorageConformance({
      createStorage: storage,
      identityPrefix: 'postgres-conformance',
    });
  });

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
    const firstEvents = createPostgresEventRuntime({ pool });
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

    const recoveredEvents = createPostgresEventRuntime({ pool });
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
