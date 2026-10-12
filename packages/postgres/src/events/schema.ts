export type PostgresEventTableNames = {
  readonly occurrences?: string;
  readonly subscriptions?: string;
  readonly deliveries?: string;
};

export type ResolvedPostgresEventTableNames = {
  readonly occurrences: string;
  readonly subscriptions: string;
  readonly deliveries: string;
};

const identifier = (value: string) => {
  if (value.trim().length === 0)
    throw new TypeError('PostgreSQL Event table names must be non-empty.');
  return `"${value.replaceAll('"', '""')}"`;
};

export const resolvePostgresEventTableNames = (
  tables: PostgresEventTableNames = {},
): ResolvedPostgresEventTableNames => ({
  occurrences: tables.occurrences ?? 'ontahi_event_occurrences',
  subscriptions: tables.subscriptions ?? 'ontahi_event_subscriptions',
  deliveries: tables.deliveries ?? 'ontahi_event_deliveries',
});

export const quotePostgresEventTableNames = (tables: ResolvedPostgresEventTableNames) => ({
  occurrences: identifier(tables.occurrences),
  subscriptions: identifier(tables.subscriptions),
  deliveries: identifier(tables.deliveries),
});

export const createPostgresEventSchemaSql = (
  tables?: PostgresEventTableNames,
): readonly string[] => {
  const names = quotePostgresEventTableNames(resolvePostgresEventTableNames(tables));
  return [
    `CREATE TABLE ${names.occurrences} (
      occurrence_id text PRIMARY KEY,
      acceptance_order bigserial NOT NULL UNIQUE,
      event_id text NOT NULL,
      event_version integer NOT NULL CHECK (event_version > 0),
      occurred_at timestamptz NOT NULL,
      payload jsonb NOT NULL,
      causation jsonb,
      correlation jsonb
    )`,
    `CREATE INDEX ${identifier(`${resolvePostgresEventTableNames(tables).occurrences}_event_idx`)}
      ON ${names.occurrences} (event_id, event_version, acceptance_order)`,
    `CREATE TABLE ${names.subscriptions} (
      subscription_id text PRIMARY KEY,
      event_id text NOT NULL,
      event_version integer NOT NULL CHECK (event_version > 0),
      correlation jsonb NOT NULL DEFAULT '{}'::jsonb,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE ${names.deliveries} (
      delivery_id text PRIMARY KEY,
      subscription_id text NOT NULL REFERENCES ${names.subscriptions} (subscription_id),
      occurrence_id text NOT NULL REFERENCES ${names.occurrences} (occurrence_id),
      attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
      state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'acknowledged')),
      claim_id text,
      claimed_by text,
      lease_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_at timestamptz,
      UNIQUE (subscription_id, occurrence_id)
    )`,
    `CREATE INDEX ${identifier(`${resolvePostgresEventTableNames(tables).deliveries}_claim_idx`)}
      ON ${names.deliveries} (subscription_id, state, created_at, delivery_id)`,
  ];
};
