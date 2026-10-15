import {
  duplicateTaskRunFailure,
  missingTaskRunFailure,
  normalizeTaskTrigger,
  projectTaskRunListItem,
  projectTaskSnapshot,
  type TaskActor,
  type TaskExecutionCheckpoint,
  type TaskFailure,
  type TaskRunCreateInput,
  type TaskRunIdentity,
  type TaskRunSource,
  type TaskStatus,
  type TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { resolveMysqlTaskTableName, type MysqlTaskTableNames } from './schema.js';

type MysqlTaskRow = RowDataPacket & {
  task_id: string;
  run_id: string;
  status: TaskStatus;
  input: unknown | null;
  trigger: TaskRunSource['trigger'] | string;
  subject: TaskRunSource['subject'] | string | null;
  runtime: TaskRunSource['runtime'] | string | null;
  progress: TaskRunSource['progress'] | string | null;
  checkpoint: TaskRunSource['checkpoint'] | string | null;
  result: unknown | null;
  execution_metadata: TaskRunSource['executionMetadata'] | string | null;
  error: TaskRunSource['error'] | string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
};

export type MysqlTaskStorageOptions = {
  readonly pool: Pick<Pool, 'query'>;
  readonly tables?: MysqlTaskTableNames;
  readonly now?: () => Date;
};

const jsonValue = <T>(value: T | string | null): T | undefined => {
  if (value === null) return undefined;
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
};

const fromRow = (row: MysqlTaskRow): TaskRunSource => {
  const {
    task_id: taskId,
    run_id: runId,
    status,
    input,
    trigger,
    subject,
    runtime,
    progress,
    checkpoint,
    result,
    execution_metadata: executionMetadata,
    error,
    created_at: createdAt,
    started_at: startedAt,
    updated_at: updatedAt,
    completed_at: completedAt,
  } = row;
  return {
    taskId,
    runId,
    status,
    input: jsonValue(input),
    trigger: normalizeTaskTrigger(jsonValue(trigger)),
    subject: jsonValue(subject),
    runtime: jsonValue(runtime),
    progress: jsonValue(progress),
    checkpoint: jsonValue(checkpoint),
    result: jsonValue(result),
    executionMetadata: jsonValue(executionMetadata),
    error: jsonValue(error),
    createdAt,
    startedAt: startedAt ?? undefined,
    updatedAt,
    completedAt: completedAt ?? undefined,
  };
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

export const createMysqlTaskStorage = ({
  pool,
  tables,
  now = () => new Date(),
}: MysqlTaskStorageOptions): TaskStorage => {
  const table = `\`${resolveMysqlTaskTableName(tables)}\``;
  const load = async (ref: TaskRunIdentity) => {
    const [rows] = await pool.query<MysqlTaskRow[]>(
      `SELECT * FROM ${table} WHERE task_id = ? AND run_id = ?`,
      [ref.taskId, ref.runId],
    );
    const row = rows[0];
    if (!row) throw missingTaskRunFailure(ref);
    return fromRow(row);
  };

  const update = async (ref: TaskRunIdentity, patch: Partial<TaskRunSource>) => {
    const current = await load(ref);
    const updatedAt = patch.updatedAt ?? now().toISOString();
    await pool.query<ResultSetHeader>(
      `UPDATE ${table} SET
        status = ?, input = CAST(? AS JSON), \`trigger\` = CAST(? AS JSON),
        subject = CAST(? AS JSON), runtime = CAST(? AS JSON), progress = CAST(? AS JSON),
        checkpoint = CAST(? AS JSON), result = CAST(? AS JSON),
        execution_metadata = CAST(? AS JSON), error = CAST(? AS JSON),
        started_at = ?, updated_at = ?, completed_at = ?
       WHERE task_id = ? AND run_id = ?`,
      [
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
        ref.taskId,
        ref.runId,
      ],
    );
    return load(ref);
  };

  const claim = async (
    ref: TaskRunIdentity,
    waitColumn: 'interaction' | 'eventWait',
    waitId: string,
    checkpoint: TaskExecutionCheckpoint,
  ) => {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE ${table}
       SET status = 'running', checkpoint = CAST(? AS JSON), updated_at = ?
       WHERE task_id = ? AND run_id = ? AND status = 'waiting'
         AND JSON_UNQUOTE(JSON_EXTRACT(checkpoint, '$.${waitColumn}.id')) = ?`,
      [json(checkpoint), now().toISOString(), ref.taskId, ref.runId, waitId],
    );
    return result.affectedRows === 1 ? projectTaskSnapshot(await load(ref)) : undefined;
  };

  const create = async (input: TaskRunCreateInput) => {
    const timestamp = now().toISOString();
    try {
      await pool.query<ResultSetHeader>(
        `INSERT INTO ${table}
          (task_id, run_id, status, input, \`trigger\`, subject, runtime, created_at, updated_at)
         VALUES (?, ?, 'queued', CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
                 CAST(? AS JSON), ?, ?)`,
        [
          input.taskId,
          input.runId,
          json(input.input),
          json(normalizeTaskTrigger(input.trigger)),
          json(input.subject),
          json(input.runtime),
          timestamp,
          timestamp,
        ],
      );
      return load(input);
    } catch (cause) {
      if ((cause as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw duplicateTaskRunFailure(input);
      }
      throw cause;
    }
  };

  const attempt = <T>(message: string, work: () => Promise<T>) =>
    Effect.tryPromise({ try: work, catch: caughtFailure(message) });

  return {
    create: input => attempt('Failed to create task run.', () => create(input)),
    update: (ref, patch) =>
      attempt('Failed to update task run.', async () =>
        projectTaskSnapshot(await update(ref, patch)),
      ),
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
        const timestamp = now().toISOString();
        const [result] = await pool.query<ResultSetHeader>(
          `UPDATE ${table}
           SET status = ?, checkpoint = NULL, error = CAST(? AS JSON),
               completed_at = ?, updated_at = ?
           WHERE task_id = ? AND run_id = ? AND status = 'waiting'
             AND JSON_UNQUOTE(JSON_EXTRACT(checkpoint, '$.eventWait.id')) = ?`,
          [status, json(error), timestamp, timestamp, ref.taskId, ref.runId, waitId],
        );
        return result.affectedRows === 1 ? projectTaskSnapshot(await load(ref)) : undefined;
      }),
    attachRuntimeRef: (ref, runtime) =>
      attempt('Failed to attach task runtime.', async () =>
        projectTaskSnapshot(await update(ref, { runtime })),
      ),
    get: ref =>
      attempt('Failed to get task run.', async () => projectTaskSnapshot(await load(ref))),
    getSnapshot: ref =>
      attempt('Failed to get task run snapshot.', async () => projectTaskSnapshot(await load(ref))),
    loadSource: ref => attempt('Failed to load task run.', () => load(ref)),
    listRecent: (limit = 20) =>
      attempt('Failed to list task runs.', async () => {
        const [rows] = await pool.query<MysqlTaskRow[]>(
          `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ?`,
          [limit],
        );
        return rows.map(row => projectTaskRunListItem(fromRow(row)));
      }),
    listRecentForActor: (actor: TaskActor, limit = 20) =>
      attempt('Failed to list task runs for actor.', async () => {
        const idFilter = actor.id === undefined ? 'actor_id IS NULL' : 'actor_id = ?';
        const parameters =
          actor.id === undefined ? [actor.kind, limit] : [actor.kind, actor.id, limit];
        const [rows] = await pool.query<MysqlTaskRow[]>(
          `SELECT * FROM ${table}
           WHERE actor_kind = ? AND ${idFilter}
           ORDER BY created_at DESC LIMIT ?`,
          parameters,
        );
        return rows.map(row => projectTaskRunListItem(fromRow(row)));
      }),
  };
};
