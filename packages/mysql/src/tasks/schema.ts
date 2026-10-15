export type MysqlTaskTableNames = { readonly runs?: string };

const DEFAULT_TASK_RUNS_TABLE = 'ontahi_task_runs';

const requireIdentifier = (value: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`Invalid MySQL Task table name: ${value}.`);
  }
  if ([...value].length > 64) {
    throw new RangeError('MySQL Task identifiers must be 64 characters or fewer.');
  }
  return value;
};

export const resolveMysqlTaskTableName = (tables?: MysqlTaskTableNames) =>
  requireIdentifier(tables?.runs ?? DEFAULT_TASK_RUNS_TABLE);

export const createMysqlTaskSchemaSql = (tables?: MysqlTaskTableNames): readonly string[] => {
  const name = resolveMysqlTaskTableName(tables);
  const runs = `\`${name}\``;
  return [
    `CREATE TABLE IF NOT EXISTS ${runs} (
      task_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
      run_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
      status varchar(32) NOT NULL,
      input json,
      \`trigger\` json NOT NULL,
      subject json,
      runtime json,
      progress json,
      checkpoint json,
      result json,
      execution_metadata json,
      error json,
      created_at varchar(30) NOT NULL,
      started_at varchar(30),
      updated_at varchar(30) NOT NULL,
      completed_at varchar(30),
      actor_kind varchar(255) GENERATED ALWAYS AS
        (JSON_UNQUOTE(JSON_EXTRACT(\`trigger\`, '$.actor.kind'))) STORED,
      actor_id varchar(255) GENERATED ALWAYS AS
        (JSON_UNQUOTE(JSON_EXTRACT(\`trigger\`, '$.actor.id'))) STORED,
      PRIMARY KEY (task_id, run_id),
      INDEX \`ontahi_task_created_idx\` (created_at DESC),
      INDEX \`ontahi_task_actor_idx\` (actor_kind, actor_id, created_at DESC)
    ) ENGINE=InnoDB`,
  ];
};
