CREATE TABLE ontahi_task_runs (
  task_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  run_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  status varchar(32) NOT NULL,
  input json,
  `trigger` json NOT NULL,
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
  actor_kind varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin GENERATED ALWAYS AS
    (JSON_UNQUOTE(JSON_EXTRACT(`trigger`, '$.actor.kind'))) STORED,
  actor_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin GENERATED ALWAYS AS
    (JSON_UNQUOTE(JSON_EXTRACT(`trigger`, '$.actor.id'))) STORED,
  PRIMARY KEY (task_id, run_id),
  INDEX ontahi_task_created_idx (created_at DESC),
  INDEX ontahi_task_actor_idx (actor_kind, actor_id, created_at DESC)
) ENGINE=InnoDB;
