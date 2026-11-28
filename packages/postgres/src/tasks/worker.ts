import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import type { AnyEventDeclaration } from '@ontahi/core/runtime/server';
import {
  createInProcessTaskRuntime,
  deferredTaskRuntimeName,
  taskEventWaitSubscriptionId,
  type TaskExecutionCheckpoint,
  type TaskDefinition,
  type TaskRunIdentity,
} from '@ontahi/core/runtime/server/tasks';
import { Cause, Effect } from 'effect';
import type { Pool, PoolClient } from 'pg';

import { createTaskWorkerEventRuntime } from '../events/runtime.js';
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

const transaction = async <T>(client: PoolClient, work: () => Promise<T>): Promise<T> => {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
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
  const worker = {
    /** Trusted host cancellation for one deferred run. */
    cancel: async (ref: TaskRunIdentity): Promise<boolean> => {
      const client = await pool.connect();
      try {
        return await transaction(client, async () => {
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
            await createTaskWorkerEventRuntime(client, {
              tables: events.tables,
            }).durableDelivery!.cancel(taskEventWaitSubscriptionId(ref, wait.id));
          }
          return result.rowCount === 1;
        });
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
        let cursor: { task_id: string; run_id: string; created_at: string } | undefined;
        while (!controller.signal.aborted) {
          const candidates = await client.query<{
            task_id: string;
            run_id: string;
            created_at: string;
          }>(
            `SELECT task_id, run_id, created_at::text FROM "${table}"
             WHERE task_id = ANY($1::text[]) AND ${eligible}
               AND (worker_lease_until IS NULL OR worker_lease_until <= clock_timestamp())
               AND ($3::timestamptz IS NULL OR (created_at, task_id, run_id) > ($3, $4, $5))
             ORDER BY "${table}".created_at, task_id, run_id LIMIT $2`,
            [
              taskIds,
              batchSize,
              cursor?.created_at ?? null,
              cursor?.task_id ?? null,
              cursor?.run_id ?? null,
            ],
          );
          for (const candidate of candidates.rows) {
            cursor = candidate;
            if (controller.signal.aborted) return undefined;
            const ref = { taskId: candidate.task_id, runId: candidate.run_id };
            const token = randomUUID();
            const claimed = await client.query(
              `WITH candidate AS (
                 SELECT task_id, run_id FROM "${table}" WHERE task_id = $1 AND run_id = $2
                   AND ${eligible}
                   AND (worker_lease_until IS NULL OR worker_lease_until <= clock_timestamp())
                 FOR UPDATE SKIP LOCKED
               )
               UPDATE "${table}" AS runs SET worker_token = $3,
                 worker_lease_until = clock_timestamp() + ($4::bigint * interval '1 millisecond')
               FROM candidate WHERE runs.task_id = candidate.task_id AND runs.run_id = candidate.run_id`,
              [ref.taskId, ref.runId, token, leaseMs],
            );
            if (claimed.rowCount !== 1) continue;
            const storage = createLeasedPostgresTaskStorage({ pool: client, tables }, token);
            let inEventTransaction = false;
            const runtime = createInProcessTaskRuntime({
              storage,
              deferExplicitExecution: true,
              withEventWaitTransaction: async (eventRef, work) => {
                inEventTransaction = true;
                try {
                  return await transaction(client, async () => {
                    const lease = await client.query(
                      `SELECT 1 FROM "${table}" WHERE task_id = $1 AND run_id = $2
                     AND worker_token = $3 AND worker_lease_until > clock_timestamp() FOR UPDATE`,
                      [eventRef.taskId, eventRef.runId, token],
                    );
                    if (!lease.rowCount) {
                      throw {
                        reason: 'task_worker_lease_lost',
                        message: 'The Task worker no longer owns this run.',
                      };
                    }
                    return work();
                  });
                } finally {
                  inEventTransaction = false;
                }
              },
              createExecutionContext,
              ...(events
                ? {
                    events: {
                      runtime: createTaskWorkerEventRuntime(client, { tables: events.tables }),
                      declarations: events.declarations,
                    },
                  }
                : {}),
            });
            tasks.forEach(task => runtime.register?.(task));
            const stopRenewal = new AbortController();
            let lostByRenewal = false;
            const renewal = async () => {
              while (!stopRenewal.signal.aborted && !controller.signal.aborted) {
                await delay(Math.max(1, Math.floor(leaseMs / 3)), undefined, {
                  signal: stopRenewal.signal,
                  ref: false,
                });
                if (stopRenewal.signal.aborted || controller.signal.aborted || inEventTransaction)
                  continue;
                // This uses the existing execution connection, before any subsequent BEGIN.
                const result = await client.query(
                  `UPDATE "${table}" SET
                     worker_lease_until = clock_timestamp() + ($4::bigint * interval '1 millisecond')
                   WHERE task_id = $1 AND run_id = $2 AND worker_token = $3
                     AND worker_lease_until > clock_timestamp()`,
                  [ref.taskId, ref.runId, token, leaseMs],
                );
                if (result.rowCount !== 1) {
                  lostByRenewal = true;
                  controller.abort();
                  return;
                }
              }
            };
            const heartbeat = renewal().then(
              () => ({ ok: true as const }),
              (error: unknown) => {
                if (
                  stopRenewal.signal.aborted &&
                  error instanceof Error &&
                  error.name === 'AbortError'
                ) {
                  return { ok: true as const };
                }
                controller.abort();
                return { ok: false as const, error };
              },
            );
            const execution = await Effect.runPromiseExit(runtime.runCheckpoint(ref), {
              signal: controller.signal,
            }).finally(() => stopRenewal.abort());
            const renewed = await heartbeat;
            const release = await Effect.runPromiseExit(
              Effect.tryPromise(() =>
                client.query(
                  `UPDATE "${table}" SET worker_token = NULL, worker_lease_until = NULL
               WHERE task_id = $1 AND run_id = $2 AND worker_token = $3`,
                  [ref.taskId, ref.runId, token],
                ),
              ),
            );
            const failure =
              execution._tag === 'Failure' ? Cause.failureOption(execution.cause) : undefined;
            const lostLease =
              failure?._tag === 'Some' && failure.value.reason === 'task_worker_lease_lost';
            if (!renewed.ok) throw renewed.error;
            if (execution._tag === 'Failure' && !lostLease && !lostByRenewal) {
              if (release._tag === 'Failure') {
                // Preserve the execution failure. The enclosing catch discards the connection.
                const error = new AggregateError(
                  [Cause.squash(execution.cause), Cause.squash(release.cause)],
                  'Task checkpoint execution failed and its lease could not be released.',
                );
                throw error;
              }
              throw Cause.squash(execution.cause);
            }
            if (release._tag === 'Failure') throw Cause.squash(release.cause);
            if (execution._tag === 'Success' && execution.value) return ref;
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
    /** Runs one execution at a time, polling again after an idle interval. */
    run: async ({
      signal,
      pollIntervalMs = 1000,
    }: {
      signal: AbortSignal;
      pollIntervalMs?: number;
    }): Promise<void> => {
      if (
        !Number.isSafeInteger(pollIntervalMs) ||
        pollIntervalMs <= 0 ||
        pollIntervalMs > 2_147_483_647
      ) {
        throw new RangeError(
          'Task worker poll interval must be between 1 and 2147483647 milliseconds.',
        );
      }
      while (!signal.aborted) {
        if (await worker.runOnce(signal)) continue;
        try {
          await delay(pollIntervalMs, undefined, { signal });
        } catch (error) {
          if (signal.aborted && error instanceof Error && error.name === 'AbortError') return;
          throw error;
        }
      }
    },
  };
  return worker;
};
