export type PostgresReplicatedCollectionTableNames = { readonly snapshots?: string };

const DEFAULT_REPLICATED_COLLECTIONS_TABLE = 'ontahi_replicated_collections';

const requireIdentifier = (value: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`Invalid PostgreSQL replicated collection table name: ${value}.`);
  }
  return value;
};

export const resolvePostgresReplicatedCollectionTableName = (
  tables?: PostgresReplicatedCollectionTableNames,
) => requireIdentifier(tables?.snapshots ?? DEFAULT_REPLICATED_COLLECTIONS_TABLE);

export const createPostgresReplicatedCollectionSchemaSql = (
  tables?: PostgresReplicatedCollectionTableNames,
): readonly string[] => {
  const snapshots = `"${resolvePostgresReplicatedCollectionTableName(tables)}"`;
  return [
    `CREATE TABLE IF NOT EXISTS ${snapshots} (
      collection_id text PRIMARY KEY,
      revision bigint NOT NULL,
      snapshot jsonb NOT NULL
    )`,
  ];
};
