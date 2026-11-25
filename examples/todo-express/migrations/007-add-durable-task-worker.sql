ALTER TABLE "ontahi_task_runs" ADD COLUMN IF NOT EXISTS admission_key text,
      ADD COLUMN IF NOT EXISTS admission_policy text,
      ADD COLUMN IF NOT EXISTS worker_token text,
      ADD COLUMN IF NOT EXISTS worker_lease_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "ontahi_task_runs_admission_uidx"
      ON "ontahi_task_runs" (task_id, admission_policy, admission_key) WHERE admission_key IS NOT NULL AND (
  status IN ('queued', 'running', 'waiting')
  OR (status IN ('failed', 'cancelled') AND error ->> 'code' = 'task_effect_outcome_ambiguous')
  OR (admission_policy = 'skip-if-completed' AND status = 'completed')
);

CREATE INDEX IF NOT EXISTS "ontahi_task_runs_runnable_idx"
      ON "ontahi_task_runs" (task_id, created_at, run_id) WHERE runtime ->> 'name' = 'deferred-worker'
  AND status IN ('queued', 'running')
  AND checkpoint IS NOT NULL
  AND NOT (checkpoint ? 'interaction' OR checkpoint ? 'eventWait');

CREATE INDEX IF NOT EXISTS "ontahi_task_runs_event_wait_idx"
      ON "ontahi_task_runs" (task_id, created_at, run_id) WHERE runtime ->> 'name' = 'deferred-worker'
  AND status = 'waiting'
  AND checkpoint ? 'eventWait';

CREATE TABLE IF NOT EXISTS "ontahi_task_runs_observations" (
      task_id text NOT NULL,
      run_id text NOT NULL,
      sequence bigint GENERATED ALWAYS AS IDENTITY,
      snapshot jsonb NOT NULL,
      PRIMARY KEY (task_id, run_id, sequence),
      FOREIGN KEY (task_id, run_id) REFERENCES "ontahi_task_runs" ON DELETE CASCADE
    );

CREATE OR REPLACE FUNCTION "ontahi_task_runs_record_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND
          (to_jsonb(OLD) - ARRAY['worker_token', 'worker_lease_until']) =
          (to_jsonb(NEW) - ARRAY['worker_token', 'worker_lease_until'])
        THEN
          RETURN NEW;
        END IF;
        INSERT INTO "ontahi_task_runs_observations" (task_id, run_id, snapshot)
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
        DELETE FROM "ontahi_task_runs_observations"
        WHERE task_id = NEW.task_id AND run_id = NEW.run_id
          AND sequence < (
            SELECT sequence FROM "ontahi_task_runs_observations"
            WHERE task_id = NEW.task_id AND run_id = NEW.run_id
            ORDER BY sequence DESC OFFSET 255 LIMIT 1
          );
        RETURN NEW;
      END
    $$;

CREATE OR REPLACE TRIGGER ontahi_record_task_snapshot
      AFTER INSERT OR UPDATE ON "ontahi_task_runs"
      FOR EACH ROW WHEN (NEW.runtime ->> 'name' = 'deferred-worker')
      EXECUTE FUNCTION "ontahi_task_runs_record_snapshot"();
