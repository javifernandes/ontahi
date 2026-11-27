import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { graphSchema } from '@ontahi/core';
import { createEventApplication, defineEvent } from '@ontahi/core/runtime/server';
import { createPostgresEventRuntime, createPostgresEventSchemaSql } from '@ontahi/postgres/events';
import { createPostgresTaskSchemaSql } from '@ontahi/postgres/tasks';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { expect, it } from 'vitest';

type WorkerCheckpoint = {
  pid: number;
  runId: string;
  status: string;
  waitingOn?: string;
  result?: string;
  providerThread: string;
};

const startWorker = (
  connectionString: string,
  options: {
    mode: 'wait' | 'resume';
    sqlitePath: string;
    tables: {
      tasks: { runs: string };
      events: { occurrences: string; subscriptions: string; deliveries: string };
      audit: string;
    };
    ref: { taskId: string; runId: string };
  },
) => {
  const worker = fork(
    fileURLToPath(new URL('../test/fixtures/event-worker.mjs', import.meta.url)),
    [JSON.stringify(options)],
    {
      execArgv: [],
      env: { ...process.env, ONTAHI_POSTGRES_TEST_URL: connectionString },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
  let diagnostics = '';
  worker.stderr?.setEncoding('utf8').on('data', data => {
    diagnostics += data;
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    worker.once('exit', (code, signal) => resolve({ code, signal }));
    worker.once('error', () => resolve({ code: null, signal: null }));
  });
  const result = Promise.race([
    new Promise<WorkerCheckpoint>(resolve =>
      worker.once('message', message => resolve(message as WorkerCheckpoint)),
    ),
    exited.then(() => {
      throw new Error(`LangGraph worker exited before checkpoint: ${diagnostics}`);
    }),
  ]);
  return { worker, result, exited };
};

it('resumes a retained Event once after killing the LangGraph worker', async () => {
  const external = process.env.ONTAHI_POSTGRES_TEST_URL;
  const container = external
    ? undefined
    : await new PostgreSqlContainer('postgres:17-alpine').start();
  const connectionString = external ?? container!.getConnectionUri();
  const pool = new Pool({ connectionString });
  const directory = await mkdtemp(join(tmpdir(), 'ontahi-langgraph-event-'));
  const prefix = `lg_event_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tables = {
    tasks: { runs: `${prefix}_runs` },
    events: {
      occurrences: `${prefix}_occurrences`,
      subscriptions: `${prefix}_subscriptions`,
      deliveries: `${prefix}_deliveries`,
    },
    audit: `${prefix}_audit`,
  };
  const ref = { taskId: 'LangGraph.restart-event', runId: 'original-run' };
  const sqlitePath = join(directory, 'checkpoints.sqlite');
  const workers: ReturnType<typeof startWorker>[] = [];
  try {
    for (const sql of [
      ...createPostgresTaskSchemaSql(tables.tasks),
      ...createPostgresEventSchemaSql(tables.events),
    ]) {
      await pool.query(sql);
    }
    await pool.query(
      `CREATE TABLE "${tables.audit}" (run_id text NOT NULL, occurrence_id text NOT NULL)`,
    );

    const first = startWorker(connectionString, { mode: 'wait', sqlitePath, tables, ref });
    workers.push(first);
    const waiting = await first.result;
    expect(waiting).toMatchObject({
      pid: first.worker.pid,
      runId: ref.runId,
      status: 'waiting',
      waitingOn: 'event',
    });
    expect(first.worker.kill('SIGKILL')).toBe(true);
    await expect(first.exited).resolves.toMatchObject({ signal: 'SIGKILL' });

    const ready = defineEvent({
      id: 'LangGraphIntegrationReady',
      version: 1,
      description: 'Callback for the LangGraph restart integration test.',
      payload: graphSchema.object({ ref: graphSchema.string() }),
    });
    const { api } = createEventApplication({
      runtime: createPostgresEventRuntime({ pool, tables: tables.events }),
      declarations: [ready],
    });
    const publish = (runId: string) =>
      api.ingest(ready, {
        payload: { ref: runId },
        correlation: { ref: runId },
        ingress: {
          provider: 'integration',
          deliveryId: runId,
          receivedAt: new Date().toISOString(),
        },
      });
    const unrelated = await publish('unrelated-run');
    const matching = await publish(ref.runId);
    const duplicate = await publish(ref.runId);
    expect(duplicate.occurrenceId).not.toBe(matching.occurrenceId);

    const second = startWorker(connectionString, { mode: 'resume', sqlitePath, tables, ref });
    workers.push(second);
    const completed = await second.result;
    expect(completed).toMatchObject({
      pid: second.worker.pid,
      runId: ref.runId,
      status: 'completed',
      providerThread: waiting.providerThread,
    });
    expect([matching.occurrenceId, duplicate.occurrenceId]).toContain(completed.result);
    expect(second.worker.pid).not.toBe(first.worker.pid);
    await expect(second.exited).resolves.toMatchObject({ code: 0 });
    const audit = await pool.query(`SELECT run_id, occurrence_id FROM "${tables.audit}"`);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ run_id: ref.runId, occurrence_id: completed.result });
    expect(audit.rows[0].occurrence_id).not.toBe(unrelated.occurrenceId);
  } finally {
    for (const { worker, exited } of workers) {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL');
      await exited;
    }
    try {
      const names = [tables.audit, tables.tasks.runs, ...Object.values(tables.events)];
      await pool.query(`DROP TABLE IF EXISTS ${names.map(name => `"${name}"`).join(', ')} CASCADE`);
    } finally {
      await pool.end();
      await container?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }
}, 120_000);
