import { setTimeout as delay } from 'node:timers/promises';

import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { graphSchema } from '@ontahi/core';
import { defineEvent } from '@ontahi/core/runtime/server';
import { defineTask, defineTaskExecution } from '@ontahi/core/runtime/server/tasks';
import { createPostgresEventRuntime } from '@ontahi/postgres/events';
import { createPostgresTaskStorage } from '@ontahi/postgres/tasks';
import { Effect } from 'effect';
import { Pool } from 'pg';

import { createLangGraphTaskExecutor } from '../../dist/index.js';

const pool = new Pool({ connectionString: process.env.ONTAHI_POSTGRES_TEST_URL });
const { mode, sqlitePath, tables, ref } = JSON.parse(process.argv[2]);
const saver = SqliteSaver.fromConnString(sqlitePath);
const storage = createPostgresTaskStorage({ pool, tables: tables.tasks });
const ready = defineEvent({
  id: 'LangGraphIntegrationReady',
  version: 1,
  description: 'Callback for the LangGraph restart integration test.',
  payload: graphSchema.object({ ref: graphSchema.string() }),
});
const events = createPostgresEventRuntime({ pool, tables: tables.events });
const task = defineTask({
  id: ref.taskId,
  execution: defineTaskExecution({
    initial: () => ({ step: 'wait' }),
    steps: {
      wait: {
        run: ({ state, event }) =>
          event
            ? Effect.promise(async () => {
                await pool.query(
                  `INSERT INTO "${tables.audit}" (run_id, occurrence_id) VALUES ($1, $2)`,
                  [ref.runId, event.occurrenceId],
                );
                return { kind: 'complete', result: event.occurrenceId };
              })
            : Effect.succeed({
                kind: 'event',
                state,
                event: {
                  id: 'retained-ready',
                  declaration: ready,
                  correlation: { ref: ref.runId },
                },
              }),
      },
    },
  }),
  run: () => Effect.dieMessage('Explicit execution required'),
});
const runtime = createLangGraphTaskExecutor({ checkpointer: saver }).createRuntime(storage, {
  events: { runtime: events, declarations: [ready] },
});
runtime.register(task);

try {
  if (mode === 'wait') {
    await Effect.runPromise(runtime.start(task, undefined, ref));
  } else {
    const source = await Effect.runPromise(storage.loadSource(ref));
    const saved = await saver.getTuple({ configurable: { thread_id: source.runtime.runId } });
    if (!saved) throw new Error('Replacement worker could not reopen the SQLite checkpoint');
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (mode === 'resume') await Effect.runPromise(runtime.getSnapshot(ref));
    const source = await Effect.runPromise(storage.loadSource(ref));
    if (source.error) throw new Error(JSON.stringify(source.error));
    if (
      !source.runtime.executionLease &&
      source.status === (mode === 'wait' ? 'waiting' : 'completed')
    ) {
      const thread = await saver.getTuple({ configurable: { thread_id: source.runtime.runId } });
      if (!thread) throw new Error('SQLite did not persist the provider thread');
      process.send({
        pid: process.pid,
        runId: source.runId,
        status: source.status,
        waitingOn: source.checkpoint?.eventWait?.kind,
        result: source.result,
        providerThread: source.runtime.runId,
      });
      if (mode === 'wait') await new Promise(resolve => process.once('disconnect', resolve));
      break;
    }
    await delay(25);
  }
  if (Date.now() >= deadline) throw new Error('Worker did not reach the expected checkpoint');
} finally {
  saver.db.close();
  await pool.end();
  if (process.connected) process.disconnect();
}
