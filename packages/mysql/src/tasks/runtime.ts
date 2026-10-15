import {
  applyTaskRunSourcePatch,
  createTaskStorageAdapter,
  duplicateTaskRunFailure,
  missingTaskRunFailure,
  normalizeTaskTrigger,
  type TaskActor,
  type TaskExecutionCheckpoint,
  type TaskRunCreateInput,
  type TaskRunIdentity,
  type TaskRunSource,
  type TaskStatus,
} from '@ontahi/core/runtime/server/tasks';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { resolveMysqlTaskTableName, type MysqlTaskTableNames } from './schema.js';

type MysqlTaskRow = RowDataPacket & {
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

const jsonValue = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

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

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

export const createMysqlTaskStorage = ({
  pool,
  tables,
  now = () => new Date(),
}: MysqlTaskStorageOptions) => {
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
    const next = applyTaskRunSourcePatch(current, patch, patch.updatedAt ?? now().toISOString());
    await pool.query<ResultSetHeader>(
      `UPDATE ${table} SET
        status = ?, input = CAST(? AS JSON), \`trigger\` = CAST(? AS JSON),
        subject = CAST(? AS JSON), runtime = CAST(? AS JSON), progress = CAST(? AS JSON),
        checkpoint = CAST(? AS JSON), result = CAST(? AS JSON),
        execution_metadata = CAST(? AS JSON), error = CAST(? AS JSON),
        started_at = ?, updated_at = ?, completed_at = ?
       WHERE task_id = ? AND run_id = ?`,
      [
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
    return result.affectedRows === 1 ? load(ref) : undefined;
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

  return createTaskStorageAdapter({
    create,
    update,
    claim,
    cancelEvent: async (ref, waitId, status, error) => {
      const timestamp = now().toISOString();
      const [result] = await pool.query<ResultSetHeader>(
        `UPDATE ${table}
           SET status = ?, checkpoint = NULL, error = CAST(? AS JSON),
               completed_at = ?, updated_at = ?
           WHERE task_id = ? AND run_id = ? AND status = 'waiting'
             AND JSON_UNQUOTE(JSON_EXTRACT(checkpoint, '$.eventWait.id')) = ?`,
        [status, json(error), timestamp, timestamp, ref.taskId, ref.runId, waitId],
      );
      return result.affectedRows === 1 ? load(ref) : undefined;
    },
    load,
    listRecent: async limit => {
      const [rows] = await pool.query<MysqlTaskRow[]>(
        `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ?`,
        [limit],
      );
      return rows.map(fromRow);
    },
    listRecentForActor: async (actor: TaskActor, limit) => {
      const idFilter = actor.id === undefined ? '' : ' AND actor_id = ?';
      const parameters =
        actor.id === undefined ? [actor.kind, limit] : [actor.kind, actor.id, limit];
      const [rows] = await pool.query<MysqlTaskRow[]>(
        `SELECT * FROM ${table}
           WHERE actor_kind = ?${idFilter}
           ORDER BY created_at DESC LIMIT ?`,
        parameters,
      );
      return rows.map(fromRow);
    },
  });
};
