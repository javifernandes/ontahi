import { describe, expect, it } from 'vitest';

import {
  createPostgresReplicatedCollectionSchemaSql,
  resolvePostgresReplicatedCollectionTableName,
} from './schema.js';

describe('PostgreSQL replicated collection schema', () => {
  it('rejects identifiers that would collide after truncation', () => {
    const prefix = 'r'.repeat(63);
    expect(resolvePostgresReplicatedCollectionTableName({ snapshots: prefix })).toBe(prefix);
    for (const suffix of ['_a', '_b']) {
      expect(() =>
        createPostgresReplicatedCollectionSchemaSql({ snapshots: prefix + suffix }),
      ).toThrow('Invalid PostgreSQL replicated collection table name');
    }
  });
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
