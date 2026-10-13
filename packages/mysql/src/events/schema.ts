export type MysqlEventTableNames = {
  readonly occurrences?: string;
  readonly subscriptions?: string;
  readonly deliveries?: string;
};

export type ResolvedMysqlEventTableNames = {
  readonly occurrences: string;
  readonly subscriptions: string;
  readonly deliveries: string;
};

const identifier = (value: string) => {
  if (value.trim().length === 0) throw new TypeError('MySQL Event table names must be non-empty.');
  if ([...value].length > 64) {
    throw new RangeError('MySQL Event identifiers must be 64 characters or fewer.');
  }
  return `\`${value.replaceAll('`', '``')}\``;
};

const exactText = (length: number) =>
  `varchar(${length}) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin`;

export const resolveMysqlEventTableNames = (
  tables: MysqlEventTableNames = {},
): ResolvedMysqlEventTableNames => ({
  occurrences: tables.occurrences ?? 'ontahi_event_occurrences',
  subscriptions: tables.subscriptions ?? 'ontahi_event_subscriptions',
  deliveries: tables.deliveries ?? 'ontahi_event_deliveries',
});

export const quoteMysqlEventTableNames = (tables: ResolvedMysqlEventTableNames) => ({
  occurrences: identifier(tables.occurrences),
  subscriptions: identifier(tables.subscriptions),
  deliveries: identifier(tables.deliveries),
});

export const createMysqlEventSchemaSql = (tables?: MysqlEventTableNames): readonly string[] => {
  const resolved = resolveMysqlEventTableNames(tables);
  const names = quoteMysqlEventTableNames(resolved);
  return [
    `CREATE TABLE ${names.occurrences} (
      occurrence_id ${exactText(255)} PRIMARY KEY,
      acceptance_order bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE,
      event_id ${exactText(255)} NOT NULL,
      event_version integer NOT NULL,
      occurred_at varchar(30) NOT NULL,
      payload json NOT NULL,
      causation json,
      correlation json,
      CONSTRAINT ${identifier(`${resolved.occurrences}_event_version_chk`)}
        CHECK (event_version > 0),
      INDEX ${identifier(`${resolved.occurrences}_event_idx`)}
        (event_id, event_version, acceptance_order)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ${names.subscriptions} (
      subscription_id ${exactText(255)} PRIMARY KEY,
      event_id ${exactText(255)} NOT NULL,
      event_version integer NOT NULL,
      correlation json NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT ${identifier(`${resolved.subscriptions}_event_version_chk`)}
        CHECK (event_version > 0)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ${names.deliveries} (
      delivery_id ${exactText(96)} PRIMARY KEY,
      subscription_id ${exactText(255)} NOT NULL,
      occurrence_id ${exactText(255)} NOT NULL,
      attempt integer NOT NULL DEFAULT 0,
      state enum('pending', 'claimed', 'acknowledged') NOT NULL DEFAULT 'pending',
      claim_id ${exactText(255)},
      claimed_by ${exactText(255)},
      lease_expires_at datetime(3),
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      acknowledged_at datetime(3),
      CONSTRAINT ${identifier(`${resolved.deliveries}_attempt_chk`)} CHECK (attempt >= 0),
      UNIQUE KEY ${identifier(`${resolved.deliveries}_subscription_occurrence_key`)}
        (subscription_id, occurrence_id),
      INDEX ${identifier(`${resolved.deliveries}_claim_idx`)}
        (subscription_id, state, created_at, delivery_id),
      CONSTRAINT ${identifier(`${resolved.deliveries}_subscription_fk`)}
        FOREIGN KEY (subscription_id) REFERENCES ${names.subscriptions} (subscription_id),
      CONSTRAINT ${identifier(`${resolved.deliveries}_occurrence_fk`)}
        FOREIGN KEY (occurrence_id) REFERENCES ${names.occurrences} (occurrence_id)
    ) ENGINE=InnoDB`,
  ];
};
