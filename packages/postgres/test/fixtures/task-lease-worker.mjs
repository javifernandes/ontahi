import { defineTask, defineTaskExecution } from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import { Pool } from 'pg';

import { createPostgresTaskWorker } from '../../dist/tasks/index.js';

const [taskId, table, leaseMs] = process.argv.slice(2);
const pool = new Pool({ connectionString: process.env.ONTAHI_POSTGRES_TEST_URL });
const task = defineTask({
  id: taskId,
  execution: defineTaskExecution({
    initial: () => ({ step: 'prepare' }),
    steps: {
      prepare: {
        run: () => Effect.succeed({ kind: 'continue', state: { step: 'work', marker: 'saved' } }),
      },
      work: {
        run: ({ state }) =>
          Effect.promise(async () => {
            const finish = new Promise(resolve => process.once('message', resolve));
            process.send({ marker: state.marker });
            await finish;
            return { kind: 'complete', result: 'original' };
          }),
      },
    },
  }),
  run: () => Effect.dieMessage('Explicit execution required'),
});

try {
  await createPostgresTaskWorker({
    pool,
    tasks: [task],
    tables: { runs: table },
    leaseMs: Number(leaseMs),
  }).runOnce();
} finally {
  await pool.end();
  if (process.connected) process.disconnect();
}
