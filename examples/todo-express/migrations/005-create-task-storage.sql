CREATE TABLE ontahi_task_runs (
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
);

CREATE INDEX ontahi_task_runs_created_idx ON ontahi_task_runs (created_at DESC);

CREATE INDEX ontahi_task_runs_actor_idx
  ON ontahi_task_runs (
    (trigger -> 'actor' ->> 'kind'),
    (trigger -> 'actor' ->> 'id'),
    created_at DESC
  );
