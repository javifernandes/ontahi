import type { AcceptedCollectionSnapshot, ReplicatedCollectionStorage } from '@ontahi/core';
import type { JsonValue } from '@ontahi/core/value/json';
import type { Pool } from 'pg';

import {
  resolvePostgresReplicatedCollectionTableName,
  type PostgresReplicatedCollectionTableNames,
} from './schema.js';

type ReplicatedCollectionRow = {
  revision: string;
  snapshot: unknown;
};

export type PostgresReplicatedCollectionStorageOptions = {
  readonly pool: Pick<Pool, 'query'>;
  readonly tables?: PostgresReplicatedCollectionTableNames;
};

export const createPostgresReplicatedCollectionStorage = <
  TRecord extends JsonValue = JsonValue,
  TFrontier extends JsonValue = JsonValue,
>({
  pool,
  tables,
}: PostgresReplicatedCollectionStorageOptions): ReplicatedCollectionStorage<TRecord, TFrontier> => {
  const table = `"${resolvePostgresReplicatedCollectionTableName(tables)}"`;
  const fromRow = (row: ReplicatedCollectionRow) => ({
    revision: String(row.revision),
    snapshot: row.snapshot as AcceptedCollectionSnapshot<TRecord, TFrontier>,
  });
  const load = async (collectionId: string) => {
    const result = await pool.query<ReplicatedCollectionRow>(
      `SELECT revision::text, snapshot FROM ${table} WHERE collection_id = $1`,
      [collectionId],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  };

  return {
    load,
    accept: async ({ collectionId, expectedRevision, snapshot }) => {
      const parameters = [collectionId, JSON.stringify(snapshot)];
      const result = expectedRevision
        ? await pool.query<ReplicatedCollectionRow>(
            `UPDATE ${table}
             SET revision = revision + 1, snapshot = $2::jsonb
             WHERE collection_id = $1 AND revision = $3::bigint
             RETURNING revision::text, snapshot`,
            [...parameters, expectedRevision],
          )
        : await pool.query<ReplicatedCollectionRow>(
            `INSERT INTO ${table} (collection_id, revision, snapshot)
             VALUES ($1, 1, $2::jsonb)
             ON CONFLICT (collection_id) DO NOTHING
             RETURNING revision::text, snapshot`,
            parameters,
          );
      const accepted = result.rows[0];
      if (accepted) return fromRow(accepted);
      return { status: 'conflict', current: await load(collectionId) };
    },
  };
};
