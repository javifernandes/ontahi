import {
  applyTaskRunSourcePatch,
  createTaskStorageAdapter,
  duplicateTaskRunFailure,
  missingTaskRunFailure,
  normalizeTaskTrigger,
  projectTaskSnapshot,
  toTaskFailure,
  type TaskActor,
  type TaskExecutionCheckpoint,
  type TaskRunCreateInput,
  type TaskRunIdentity,
  type TaskRunSource,
  type TaskStartAdmission,
  type TaskRunsBySubjectQuery,
  type TaskStatus,
} from '@ontahi/core/runtime/server/tasks';
import { Effect, Stream } from 'effect';
import type { Pool } from 'pg';

import {
  resolvePostgresTaskTableName,
  resolveTaskObservationTableName,
  taskAdmissionIndexPredicate,
  type PostgresTaskTableNames,
} from './schema.js';

type PostgresTaskRow = {
  task_id: string;
  run_id: string;
  status: TaskStatus;
  input: unknown | null;
  trigger: TaskRunSource['trigger'];
  subject: TaskRunSource['subject'] | null;
  runtime: TaskRunSource['runtime'] | null;
  progress: TaskRunSource['progress'] | null;
  checkpoint: TaskRunSource['checkpoint'] | null;
  result: unknown | null;
  execution_metadata: TaskRunSource['executionMetadata'] | null;
  error: TaskRunSource['error'] | null;
  created_at: Date | string;
  started_at: Date | string | null;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

export type PostgresTaskStorageOptions = {
  readonly pool: Pick<Pool, 'query'>;
  readonly tables?: PostgresTaskTableNames;
  readonly observationPollMs?: number;
  readonly now?: () => Date;
};

const isoDate = (value: Date | string) => new Date(value).toISOString();

const fromRow = (row: PostgresTaskRow): TaskRunSource => ({
  taskId: row.task_id,
  runId: row.run_id,
  status: row.status,
  input: row.input ?? undefined,
  trigger: normalizeTaskTrigger(row.trigger),
  subject: row.subject ?? undefined,
  runtime: row.runtime ?? undefined,
  progress: row.progress ?? undefined,
  checkpoint: row.checkpoint ?? undefined,
  result: row.result ?? undefined,
  executionMetadata: row.execution_metadata ?? undefined,
  error: row.error ?? undefined,
  createdAt: isoDate(row.created_at),
  startedAt: row.started_at ? isoDate(row.started_at) : undefined,
  updatedAt: isoDate(row.updated_at),
  completedAt: row.completed_at ? isoDate(row.completed_at) : undefined,
});

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

const createStorage = (
  { pool, tables, now = () => new Date(), observationPollMs = 100 }: PostgresTaskStorageOptions,
  leaseToken?: string,
) => {
  const table = `"${resolvePostgresTaskTableName(tables)}"`;
  if (!Number.isSafeInteger(observationPollMs) || observationPollMs <= 0) {
    throw new RangeError('Task observation poll interval must be a positive integer.');
  }
  const observations = `"${resolveTaskObservationTableName(tables)}"`;
  const observeSnapshots = (ref: TaskRunIdentity) =>
    Stream.unwrap(
      Effect.tryPromise({
        try: async () => {
          const parameters = [ref.taskId, ref.runId];
          const initial = await pool.query<PostgresTaskRow & { cursor: string }>(
            `SELECT runs.*, COALESCE((
               SELECT MAX(sequence) FROM ${observations} WHERE task_id = $1 AND run_id = $2
             ), 0)::text AS cursor
             FROM ${table} AS runs WHERE task_id = $1 AND run_id = $2`,
            parameters,
          );
          const current = initial.rows[0];
          if (!current) throw missingTaskRunFailure(ref);
          let cursor = current.cursor;
          const readUpdates = Effect.tryPromise({
            try: async () => {
              const updates = await pool.query<{ sequence: string; snapshot: PostgresTaskRow }>(
                `SELECT sequence::text, snapshot FROM ${observations}
                 WHERE task_id = $1 AND run_id = $2 AND sequence > $3::bigint
                 ORDER BY sequence LIMIT 64`,
                [...parameters, cursor],
              );
              const last = updates.rows.at(-1);
              if (last) cursor = last.sequence;
              return updates.rows.map(row => projectTaskSnapshot(fromRow(row.snapshot)));
            },
            catch: toTaskFailure,
          });
          return Stream.concat(
            Stream.succeed(projectTaskSnapshot(fromRow(current))),
            Stream.repeatEffect(readUpdates.pipe(Effect.delay(observationPollMs))).pipe(
              Stream.flatMap(rows => Stream.fromIterable(rows)),
            ),
          );
        },
        catch: toTaskFailure,
      }),
    );
  const lease = (parameter: number) =>
    leaseToken ? `AND worker_token = $${parameter} AND worker_lease_until > clock_timestamp()` : '';
  const leaseParameters = leaseToken ? [leaseToken] : [];
  const missingWrite = (ref: TaskRunIdentity) =>
    leaseToken
      ? { reason: 'task_worker_lease_lost', message: 'The Task worker no longer owns this run.' }
      : missingTaskRunFailure(ref);
  // xmin stays constant for writes in one transaction. ctid identifies the tuple version.
  const loadRow = async (ref: TaskRunIdentity) => {
    const result = await pool.query<PostgresTaskRow & { revision: string }>(
      `SELECT *, (xmin::text || ctid::text) AS revision FROM ${table} WHERE task_id = $1 AND run_id = $2 ${lease(3)}`,
      [ref.taskId, ref.runId, ...leaseParameters],
    );
    const row = result.rows[0];
    if (!row) throw missingWrite(ref);
    return row;
  };
  const load = async (ref: TaskRunIdentity) => fromRow(await loadRow(ref));

  const write = async (
    ref: TaskRunIdentity,
    patch: Partial<TaskRunSource>,
    status?: TaskStatus,
    expected?: { runtime: TaskRunSource['runtime'] },
  ) => {
    const row = await loadRow(ref);
    const current = fromRow(row);
    if (status && row.status !== status) return undefined;
    const next = applyTaskRunSourcePatch(current, patch, patch.updatedAt ?? now().toISOString());
    const guardParameters = [
      ...leaseParameters,
      ...(status ? [status, row.revision] : []),
      ...(expected ? [json(expected.runtime)] : []),
    ];
    const firstGuard = 16 + leaseParameters.length;
    const result = await pool.query<PostgresTaskRow>(
      `UPDATE ${table} SET
        status = $3, input = $4::jsonb, trigger = $5::jsonb, subject = $6::jsonb,
        runtime = $7::jsonb, progress = $8::jsonb, checkpoint = $9::jsonb,
        result = $10::jsonb, execution_metadata = $11::jsonb, error = $12::jsonb,
        started_at = $13, updated_at = $14, completed_at = $15
       WHERE task_id = $1 AND run_id = $2 ${lease(16)}
         ${status ? `AND status = $${firstGuard} AND (xmin::text || ctid::text) = $${firstGuard + 1}` : ''}
         ${expected ? `AND runtime IS NOT DISTINCT FROM $${firstGuard + 2}::jsonb` : ''}
       RETURNING *`,
      [
        ref.taskId,
        ref.runId,
        next.status,
        json(next.input),
        json(next.trigger),
        json(next.subject),
        json(next.runtime),
        json(next.progress),
        json(next.checkpoint),
        json(next.result),
        json(next.executionMetadata),
        json(next.error),
        next.startedAt ?? null,
        next.updatedAt,
        next.completedAt ?? null,
        ...guardParameters,
      ],
    );
    const written = result.rows[0];
    if (!written && !status) throw missingWrite(ref);
    return written && fromRow(written);
  };

  const claim = async (
    ref: TaskRunIdentity,
    waitColumn: 'interaction' | 'eventWait',
    waitId: string,
    checkpoint: TaskExecutionCheckpoint,
  ) => {
    const result = await pool.query<PostgresTaskRow>(
      `UPDATE ${table}
       SET status = 'running', checkpoint = $4::jsonb, updated_at = $5
       WHERE task_id = $1 AND run_id = $2 AND status = 'waiting'
         AND checkpoint -> $3 ->> 'id' = $6 ${lease(7)}
       RETURNING *`,
      [ref.taskId, ref.runId, waitColumn, json(checkpoint), now(), waitId, ...leaseParameters],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  };

  const insert = async (input: TaskRunCreateInput, admission?: TaskStartAdmission) => {
    try {
      const result = await pool.query<PostgresTaskRow>(
        `INSERT INTO ${table}
          (task_id, run_id, status, input, trigger, subject, runtime, created_at, updated_at,
           admission_policy, admission_key, checkpoint)
         VALUES ($1, $2, 'queued', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $7, $8, $9, $10::jsonb)
         ${
           admission
             ? `ON CONFLICT (task_id, admission_policy, admission_key)
                        WHERE ${taskAdmissionIndexPredicate} DO NOTHING`
             : ''
         }
         RETURNING *`,
        [
          input.taskId,
          input.runId,
          json(input.input),
          json(normalizeTaskTrigger(input.trigger)),
          json(input.subject),
          json(input.runtime),
          now(),
          admission?.policy ?? null,
          admission?.key ?? null,
          json(input.checkpoint),
        ],
      );
      return result.rows[0];
    } catch (cause) {
      if ((cause as { code?: string }).code === '23505') throw duplicateTaskRunFailure(input);
      throw cause;
    }
  };

  const storage = createTaskStorageAdapter({
    create: async input => fromRow((await insert(input))!),
    admit: async (input, admission) => {
      while (true) {
        const created = await insert(input, admission);
        if (created) return { source: fromRow(created), created: true };

        // A new statement can see the row that caused the uniqueness conflict.
        const existing = await pool.query<PostgresTaskRow>(
          `SELECT * FROM ${table}
           WHERE task_id = $1 AND admission_policy = $2 AND admission_key = $3
             AND ${taskAdmissionIndexPredicate}`,
          [input.taskId, admission.policy, admission.key],
        );
        const selected = existing.rows[0];
        if (selected) return { source: fromRow(selected), created: false };
        // A conflicting run that stopped qualifying leaves the key free for another insert.
      }
    },
    update: async (ref, patch) => (await write(ref, patch))!,
    updateIfStatus: (ref, status, patch, expected) => write(ref, patch, status, expected),
    claim,
    cancelEvent: async (ref, waitId, status, error) => {
      const result = await pool.query<PostgresTaskRow>(
        `UPDATE ${table}
           SET status = $4, checkpoint = NULL, error = $5::jsonb,
               completed_at = $6, updated_at = $6
           WHERE task_id = $1 AND run_id = $2 AND status = 'waiting'
             AND checkpoint -> 'eventWait' ->> 'id' = $3 ${lease(7)}
           RETURNING *`,
        [ref.taskId, ref.runId, waitId, status, json(error), now(), ...leaseParameters],
      );
      return result.rows[0] ? fromRow(result.rows[0]) : undefined;
    },
    load,
    listRecent: async limit => {
      const result = await pool.query<PostgresTaskRow>(
        `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return result.rows.map(fromRow);
    },
    listRecentForActor: async (actor: TaskActor, limit) => {
      const parameters: unknown[] = [actor.kind];
      const idFilter = actor.id === undefined ? '' : ` AND trigger -> 'actor' ->> 'id' = $2`;
      if (actor.id !== undefined) parameters.push(actor.id);
      parameters.push(limit);
      const result = await pool.query<PostgresTaskRow>(
        `SELECT * FROM ${table}
           WHERE trigger -> 'actor' ->> 'kind' = $1${idFilter}
           ORDER BY created_at DESC LIMIT $${parameters.length}`,
        parameters,
      );
      return result.rows.map(fromRow);
    },
    listBySubject: async ({ subject, statuses, limit }: TaskRunsBySubjectQuery) => {
      const parameters: unknown[] = [subject.type, subject.id];
      const statusFilter = statuses
        ? ` AND status = ANY($${parameters.push(statuses)}::text[])`
        : '';
      parameters.push(limit);
      const result = await pool.query<PostgresTaskRow>(
        `SELECT * FROM ${table}
           WHERE subject ->> 'type' = $1 AND subject ->> 'id' = $2${statusFilter}
           ORDER BY created_at DESC LIMIT $${parameters.length}`,
        parameters,
      );
      return result.rows.map(fromRow);
    },
  });
  return { ...storage, observeSnapshots };
};

export const createPostgresTaskStorage = (options: PostgresTaskStorageOptions) =>
  createStorage(options);

/** Bind worker writes to the active lease on the Task row. */
export const createLeasedPostgresTaskStorage = (
  options: PostgresTaskStorageOptions,
  token: string,
) => createStorage(options, token);
