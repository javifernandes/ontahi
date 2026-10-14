import {
  duplicateTaskRunFailure,
  missingTaskRunFailure,
  normalizeTaskTrigger,
  type TaskActor,
  type TaskExecutionCheckpoint,
  type TaskFailure,
  type TaskRunCreateInput,
  type TaskRunIdentity,
  type TaskRunListItem,
  type TaskRunSource,
  type TaskSnapshot,
  type TaskStatus,
  type TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import type { Pool } from 'pg';

import { resolvePostgresTaskTableName, type PostgresTaskTableNames } from './schema.js';

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

const toSnapshot = (source: TaskRunSource): TaskSnapshot => ({
  taskId: source.taskId,
  runId: source.runId,
  status: source.status,
  subject: source.subject,
  createdAt: source.createdAt,
  startedAt: source.startedAt,
  updatedAt: source.updatedAt,
  completedAt: source.completedAt,
  progress: source.progress,
  interaction: source.checkpoint?.interaction,
  waitingOn: source.checkpoint?.interaction
    ? { kind: 'interaction', interaction: source.checkpoint.interaction }
    : source.checkpoint?.eventWait,
  resumedBy: source.checkpoint?.eventResume,
  error: source.error,
  result: source.result,
  ...(source.executionMetadata ? { executionMetadata: source.executionMetadata } : {}),
});

const toListItem = (source: TaskRunSource): TaskRunListItem => {
  const { result: _result, ...snapshot } = toSnapshot(source);
  return { ...snapshot, trigger: source.trigger, runtime: source.runtime };
};

const failure = (message: string, cause: unknown): TaskFailure => ({
  reason: 'task_run_store_failed',
  message,
  cause: cause instanceof Error ? cause.message : String(cause),
});

const caughtFailure =
  (message: string) =>
  (cause: unknown): TaskFailure =>
    typeof cause === 'object' &&
    cause !== null &&
    'reason' in cause &&
    typeof (cause as { reason: unknown }).reason === 'string'
      ? (cause as TaskFailure)
      : failure(message, cause);

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

export const createPostgresTaskStorage = ({
  pool,
  tables,
  now = () => new Date(),
}: PostgresTaskStorageOptions): TaskStorage => {
  const table = `"${resolvePostgresTaskTableName(tables)}"`;
  const load = async (ref: TaskRunIdentity) => {
    const result = await pool.query<PostgresTaskRow>(
      `SELECT * FROM ${table} WHERE task_id = $1 AND run_id = $2`,
      [ref.taskId, ref.runId],
    );
    const row = result.rows[0];
    if (!row) throw missingTaskRunFailure(ref);
    return fromRow(row);
  };

  const update = async (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) => {
    const current = await load(ref);
    const updatedAt = patch.updatedAt ? new Date(patch.updatedAt) : now();
    const result = await pool.query<PostgresTaskRow>(
      `UPDATE ${table} SET
        status = $3, input = $4::jsonb, trigger = $5::jsonb, subject = $6::jsonb,
        runtime = $7::jsonb, progress = $8::jsonb, checkpoint = $9::jsonb,
        result = $10::jsonb, execution_metadata = $11::jsonb, error = $12::jsonb,
        started_at = $13, updated_at = $14, completed_at = $15
       WHERE task_id = $1 AND run_id = $2 RETURNING *`,
      [
        ref.taskId,
        ref.runId,
        patch.status ?? current.status,
        json(patch.input === undefined ? current.input : patch.input),
        json(patch.trigger ?? current.trigger),
        json(patch.subject === undefined ? current.subject : patch.subject),
        json(patch.runtime === undefined ? current.runtime : patch.runtime),
        json(patch.progress ? { ...current.progress, ...patch.progress } : current.progress),
        json('checkpoint' in patch ? patch.checkpoint : current.checkpoint),
        json(patch.result === undefined ? current.result : patch.result),
        json(
          patch.executionMetadata === undefined
            ? current.executionMetadata
            : patch.executionMetadata,
        ),
        json(patch.error === undefined ? current.error : patch.error),
        patch.startedAt === undefined ? (current.startedAt ?? null) : patch.startedAt,
        updatedAt,
        patch.completedAt === undefined ? (current.completedAt ?? null) : patch.completedAt,
      ],
    );
    return fromRow(result.rows[0]!);
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
         AND checkpoint -> $3 ->> 'id' = $6
       RETURNING *`,
      [ref.taskId, ref.runId, waitColumn, json(checkpoint), now(), waitId],
    );
    return result.rows[0] ? toSnapshot(fromRow(result.rows[0])) : undefined;
  };

  const create = async (input: TaskRunCreateInput) => {
    const timestamp = now();
    try {
      const result = await pool.query<PostgresTaskRow>(
        `INSERT INTO ${table}
          (task_id, run_id, status, input, trigger, subject, runtime, created_at, updated_at)
         VALUES ($1, $2, 'queued', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $7)
         RETURNING *`,
        [
          input.taskId,
          input.runId,
          json(input.input),
          json(normalizeTaskTrigger(input.trigger)),
          json(input.subject),
          json(input.runtime),
          timestamp,
        ],
      );
      return fromRow(result.rows[0]!);
    } catch (cause) {
      if ((cause as { code?: string }).code === '23505') throw duplicateTaskRunFailure(input);
      throw cause;
    }
  };

  const attempt = <T>(message: string, work: () => Promise<T>) =>
    Effect.tryPromise({ try: work, catch: caughtFailure(message) });

  return {
    create: input => attempt('Failed to create task run.', () => create(input)),
    update: (ref, patch) =>
      attempt('Failed to update task run.', async () => toSnapshot(await update(ref, patch))),
    claimInteraction: (ref, interactionId, checkpoint) =>
      attempt('Failed to claim task interaction.', () =>
        claim(ref, 'interaction', interactionId, checkpoint),
      ),
    claimEvent: (ref, waitId, checkpoint) =>
      attempt('Failed to claim task Event wait.', () =>
        claim(ref, 'eventWait', waitId, checkpoint),
      ),
    cancelEvent: (ref, waitId, status, error) =>
      attempt('Failed to cancel task Event wait.', async () => {
        const result = await pool.query<PostgresTaskRow>(
          `UPDATE ${table}
           SET status = $4, checkpoint = NULL, error = $5::jsonb,
               completed_at = $6, updated_at = $6
           WHERE task_id = $1 AND run_id = $2 AND status = 'waiting'
             AND checkpoint -> 'eventWait' ->> 'id' = $3
           RETURNING *`,
          [ref.taskId, ref.runId, waitId, status, json(error), now()],
        );
        return result.rows[0] ? toSnapshot(fromRow(result.rows[0])) : undefined;
      }),
    attachRuntimeRef: (ref, runtime) =>
      attempt('Failed to attach task runtime.', async () =>
        toSnapshot(await update(ref, { runtime })),
      ),
    get: ref => attempt('Failed to get task run.', async () => toSnapshot(await load(ref))),
    getSnapshot: ref =>
      attempt('Failed to get task run snapshot.', async () => toSnapshot(await load(ref))),
    loadSource: ref => attempt('Failed to load task run.', () => load(ref)),
    listRecent: (limit = 20) =>
      attempt('Failed to list task runs.', async () => {
        const result = await pool.query<PostgresTaskRow>(
          `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1`,
          [limit],
        );
        return result.rows.map(row => toListItem(fromRow(row)));
      }),
    listRecentForActor: (actor: TaskActor, limit = 20) =>
      attempt('Failed to list task runs for actor.', async () => {
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
        return result.rows.map(row => toListItem(fromRow(row)));
      }),
  };
};
