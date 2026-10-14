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

export const createPostgresTaskSchemaSql = (tables?: PostgresTaskTableNames): readonly string[] => {
  const runs = `"${resolvePostgresTaskTableName(tables)}"`;
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
    `CREATE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_created_idx"
      ON ${runs} (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS "${resolvePostgresTaskTableName(tables)}_actor_idx"
      ON ${runs} ((trigger -> 'actor' ->> 'kind'), (trigger -> 'actor' ->> 'id'), created_at DESC)`,
  ];
};
