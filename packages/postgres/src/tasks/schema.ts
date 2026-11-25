import { deferredTaskRuntimeName } from '@ontahi/core/runtime/server/tasks';

export type PostgresTaskTableNames = { readonly runs?: string };

const DEFAULT_TASK_RUNS_TABLE = 'ontahi_task_runs';

const requireIdentifier = (value: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`Invalid PostgreSQL Task table name: ${value}.`);
  }
  return value;
};

export const resolvePostgresTaskTableName = (tables?: PostgresTaskTableNames) =>
  requireIdentifier(tables?.runs ?? DEFAULT_TASK_RUNS_TABLE);

export const resolveTaskObservationTableName = (tables?: PostgresTaskTableNames) =>
  `${resolvePostgresTaskTableName(tables)}_observations`;

export const taskAdmissionIndexPredicate = `admission_key IS NOT NULL AND (
  status IN ('queued', 'running', 'waiting')
  OR (status IN ('failed', 'cancelled') AND error ->> 'code' = 'task_effect_outcome_ambiguous')
  OR (admission_policy = 'skip-if-completed' AND status = 'completed')
)`;

export const runnableTaskCheckpointPredicate = `runtime ->> 'name' = '${deferredTaskRuntimeName}'
  AND status IN ('queued', 'running')
  AND checkpoint IS NOT NULL
  AND NOT (checkpoint ? 'interaction' OR checkpoint ? 'eventWait')`;

export const waitingTaskEventPredicate = `runtime ->> 'name' = '${deferredTaskRuntimeName}'
  AND status = 'waiting'
  AND checkpoint ? 'eventWait'`;

export const createPostgresTaskSchemaSql = (tables?: PostgresTaskTableNames): readonly string[] => {
  const runs = `"${resolvePostgresTaskTableName(tables)}"`;
  const observations = `"${resolveTaskObservationTableName(tables)}"`;
  const recordSnapshot = `"${resolvePostgresTaskTableName(tables)}_record_snapshot"`;
  return [
    `CREATE TABLE IF NOT EXISTS ${runs} (
      task_id text NOT NULL,
      run_id text NOT NULL,
      status text NOT NULL,
      input jsonb,
      trigger jsonb NOT NULL,
      subject jsonb,
      runtime jsonb,
      progress jsonb,
      checkpoint jsonb,
      result jsonb,
      execution_metadata jsonb,
      error jsonb,
      created_at timestamptz NOT NULL,
      started_at timestamptz,
      updated_at timestamptz NOT NULL,
      completed_at timestamptz,
      PRIMARY KEY (task_id, run_id)
    )`,
    `ALTER TABLE ${runs} ADD COLUMN IF NOT EXISTS admission_key text,
      ADD COLUMN IF NOT EXISTS admission_policy text,
      ADD COLUMN IF NOT EXISTS worker_token text,
      ADD COLUMN IF NOT EXISTS worker_lease_until timestamptz`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_admission_uidx"
      ON ${runs} (task_id, admission_policy, admission_key) WHERE ${taskAdmissionIndexPredicate}`,
    `CREATE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_runnable_idx"
      ON ${runs} (task_id, created_at, run_id) WHERE ${runnableTaskCheckpointPredicate}`,
    `CREATE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_event_wait_idx"
      ON ${runs} (task_id, created_at, run_id) WHERE ${waitingTaskEventPredicate}`,
    `CREATE TABLE IF NOT EXISTS ${observations} (
      task_id text NOT NULL,
      run_id text NOT NULL,
      sequence bigint GENERATED ALWAYS AS IDENTITY,
      snapshot jsonb NOT NULL,
      PRIMARY KEY (task_id, run_id, sequence),
      FOREIGN KEY (task_id, run_id) REFERENCES ${runs} ON DELETE CASCADE
    )`,
    `CREATE OR REPLACE FUNCTION ${recordSnapshot}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND
          (to_jsonb(OLD) - ARRAY['worker_token', 'worker_lease_until']) =
          (to_jsonb(NEW) - ARRAY['worker_token', 'worker_lease_until'])
        THEN
          RETURN NEW;
        END IF;
        INSERT INTO ${observations} (task_id, run_id, snapshot)
        VALUES (NEW.task_id, NEW.run_id,
          jsonb_build_object(
            'task_id', NEW.task_id, 'run_id', NEW.run_id, 'status', NEW.status,
            'subject', NEW.subject, 'progress', NEW.progress, 'result', NEW.result,
            'execution_metadata', NEW.execution_metadata, 'error', NEW.error,
            'created_at', NEW.created_at, 'started_at', NEW.started_at,
            'updated_at', NEW.updated_at, 'completed_at', NEW.completed_at,
            'checkpoint', COALESCE((
              SELECT jsonb_object_agg(key, value) FROM jsonb_each(NEW.checkpoint)
              WHERE key IN ('interaction', 'eventWait', 'eventResume')
            ), '{}'::jsonb)
          )
        );
        DELETE FROM ${observations}
        WHERE task_id = NEW.task_id AND run_id = NEW.run_id
          AND sequence < (
            SELECT sequence FROM ${observations}
            WHERE task_id = NEW.task_id AND run_id = NEW.run_id
            ORDER BY sequence DESC OFFSET 255 LIMIT 1
          );
        RETURN NEW;
      END
    $$`,
    `CREATE OR REPLACE TRIGGER ontahi_record_task_snapshot
      AFTER INSERT OR UPDATE ON ${runs}
      FOR EACH ROW WHEN (NEW.runtime ->> 'name' = '${deferredTaskRuntimeName}')
      EXECUTE FUNCTION ${recordSnapshot}()`,
    `CREATE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_created_idx"
      ON ${runs} (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_actor_idx"
      ON ${runs} ((trigger -> 'actor' ->> 'kind'), (trigger -> 'actor' ->> 'id'), created_at DESC)`,
  ];
};
