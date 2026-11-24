import { describe, expect, it } from 'vitest';

import {
  createPostgresReplicatedCollectionSchemaSql,
  resolvePostgresReplicatedCollectionTableName,
} from './schema.js';

describe('PostgreSQL replicated collection schema', () => {
  it('creates an internal snapshot table with revision CAS state', () => {
    expect(createPostgresReplicatedCollectionSchemaSql()).toEqual([
      `CREATE TABLE IF NOT EXISTS "ontahi_replicated_collections" (
      collection_id text PRIMARY KEY,
      revision bigint NOT NULL,
      snapshot jsonb NOT NULL
    )`,
    ]);
  });

  it('accepts a custom table name and rejects unsafe identifiers', () => {
    expect(resolvePostgresReplicatedCollectionTableName({ snapshots: 'atlas_replicas' })).toBe(
      'atlas_replicas',
    );
    expect(() =>
      resolvePostgresReplicatedCollectionTableName({ snapshots: 'replicas; DROP TABLE plans' }),
    ).toThrow('Invalid PostgreSQL replicated collection table name');
  });
});
