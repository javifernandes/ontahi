import { randomUUID } from 'node:crypto';

import type { AnyEventDeclaration } from '@ontahi/core/runtime/server';
import {
  createInProcessTaskRuntime,
  deferredTaskRuntimeName,
  taskEventWaitSubscriptionId,
  type TaskExecutionCheckpoint,
  type TaskDefinition,
  type TaskRunIdentity,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import type { Pool } from 'pg';

import { createPostgresEventRuntime } from '../events/runtime.js';
import type { PostgresEventTableNames } from '../events/schema.js';

import { createLeasedPostgresTaskStorage } from './runtime.js';
import {
  resolvePostgresTaskTableName,
  runnableTaskCheckpointPredicate,
  waitingTaskEventPredicate,
  type PostgresTaskTableNames,
} from './schema.js';

type PostgresTaskWorkerOptions = {
  pool: Pick<Pool, 'connect'>;
  tasks: readonly TaskDefinition<any, any>[];
  tables?: PostgresTaskTableNames;
  leaseMs?: number;
  events?: { declarations: readonly AnyEventDeclaration[]; tables?: PostgresEventTableNames };
  createExecutionContext?: Parameters<
    typeof createInProcessTaskRuntime
  >[0]['createExecutionContext'];
};

/** Polls PostgreSQL for a deferred Task checkpoint and runs it under a fenced lease. */
export const createPostgresTaskWorker = ({
  pool,
  tasks,
  tables,
  createExecutionContext,
  events,
  leaseMs = 60_000,
}: PostgresTaskWorkerOptions) => {
  const table = resolvePostgresTaskTableName(tables);
  const taskIds = tasks.map(task => task.id);

  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
    throw new RangeError('Task worker lease must be a positive integer in milliseconds.');
  }
  const eligible = `((${runnableTaskCheckpointPredicate})
    ${events ? `OR (${waitingTaskEventPredicate})` : ''})`;
  return {
    /** Trusted host cancellation for one deferred run. */
    cancel: async (ref: TaskRunIdentity): Promise<boolean> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ checkpoint: TaskExecutionCheckpoint | null }>(
          `WITH candidate AS (
             SELECT task_id, run_id, status, checkpoint FROM "${table}"
             WHERE task_id = $1 AND run_id = $2 AND runtime ->> 'name' = $3
               AND status IN ('queued', 'running', 'waiting')
             FOR UPDATE
           )
           UPDATE "${table}" AS runs
           SET status = 'cancelled', updated_at = now(), completed_at = now(),
             worker_token = NULL, worker_lease_until = NULL,
             checkpoint = CASE WHEN candidate.status = 'running' THEN candidate.checkpoint ELSE NULL END,
             error = CASE WHEN candidate.status = 'running'
               THEN '{"code":"task_effect_outcome_ambiguous","message":"Running Task cancelled before confirming its effects."}'::jsonb
               ELSE NULL END
           FROM candidate WHERE runs.task_id = candidate.task_id AND runs.run_id = candidate.run_id
           RETURNING candidate.checkpoint`,
          [ref.taskId, ref.runId, deferredTaskRuntimeName],
        );
        const wait = result.rows[0]?.checkpoint?.eventWait;
        if (wait && events) {
          await createPostgresEventRuntime({
            connection: client,
            tables: events.tables,
          }).durableDelivery!.cancel(taskEventWaitSubscriptionId(ref, wait.id));
        }
        await client.query('COMMIT');
        return result.rowCount === 1;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    runOnce: async (signal?: AbortSignal): Promise<TaskRunIdentity | undefined> => {
      if (!taskIds.length || signal?.aborted) return undefined;
      const client = await pool.connect();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      let discardConnection = false;
      client.on('error', onAbort);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      try {
        const batchSize = 32;
        for (let offset = 0; !controller.signal.aborted; offset += batchSize) {
          const candidates = await client.query<{ task_id: string; run_id: string }>(
            `SELECT task_id, run_id FROM "${table}"
             WHERE task_id = ANY($1::text[]) AND ${eligible}
               AND (worker_lease_until IS NULL OR worker_lease_until <= clock_timestamp())
             ORDER BY created_at, task_id, run_id LIMIT $2 OFFSET $3`,
            [taskIds, batchSize, offset],
          );
          for (const candidate of candidates.rows) {
            if (controller.signal.aborted) return undefined;
            const ref = { taskId: candidate.task_id, runId: candidate.run_id };
            const token = randomUUID();
            const claimed = await client.query(
              `UPDATE "${table}" SET worker_token = $3,
                 worker_lease_until = clock_timestamp() + ($4::bigint * interval '1 millisecond')
               WHERE task_id = $1 AND run_id = $2 AND ${eligible}
                 AND (worker_lease_until IS NULL OR worker_lease_until <= clock_timestamp())`,
              [ref.taskId, ref.runId, token, leaseMs],
            );
            if (claimed.rowCount !== 1) continue;
            const storage = createLeasedPostgresTaskStorage({ pool: client, tables }, token);
            const runtime = createInProcessTaskRuntime({
              storage,
              deferExplicitExecution: true,
              createExecutionContext,
              ...(events
                ? {
                    events: {
                      runtime: createPostgresEventRuntime({
                        connection: client,
                        tables: events.tables,
                      }),
                      declarations: events.declarations,
                    },
                  }
                : {}),
            });
            tasks.forEach(task => runtime.register?.(task));
            try {
              const outcome = await Effect.runPromise(Effect.either(runtime.runCheckpoint(ref)), {
                signal: controller.signal,
              });
              if (outcome._tag === 'Left') {
                if (outcome.left.reason !== 'task_worker_lease_lost') throw outcome.left;
              } else if (outcome.right) return ref;
            } finally {
              try {
                await client.query(
                  `UPDATE "${table}" SET worker_token = NULL, worker_lease_until = NULL
                   WHERE task_id = $1 AND run_id = $2 AND worker_token = $3`,
                  [ref.taskId, ref.runId, token],
                );
              } catch (error) {
                if (!controller.signal.aborted) throw error;
              }
            }
          }
          if (candidates.rows.length < batchSize) return undefined;
        }
        return undefined;
      } catch (error) {
        discardConnection = true;
        if (signal?.aborted) return undefined;
        throw error;
      } finally {
        signal?.removeEventListener('abort', onAbort);
        client.off('error', onAbort);
        client.release(discardConnection || controller.signal.aborted);
      }
    },
  };
};
