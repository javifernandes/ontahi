import { describe, expect, it, vi } from 'vitest';

import { createPostgresDataGraphStorage } from '../data-graph/storage.js';

import { createPostgresReplicatedCollectionStorage } from './storage.js';

describe('PostgreSQL replicated collection storage', () => {
  it('loads snapshots and accepts a new collection atomically', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ revision: '7', snapshot: { frontier: 'f7', records: [] } }],
      })
      .mockResolvedValueOnce({
        rows: [{ revision: '1', snapshot: { frontier: 'f1', records: [] } }],
      });
    const storage = createPostgresReplicatedCollectionStorage({ pool: { query } as never });

    await expect(storage.load('plans')).resolves.toEqual({
      revision: '7',
      snapshot: { frontier: 'f7', records: [] },
    });
    await expect(
      storage.accept({
        collectionId: 'evidence',
        expectedRevision: null,
        snapshot: { frontier: 'f1', records: [] },
      }),
    ).resolves.toEqual({ revision: '1', snapshot: { frontier: 'f1', records: [] } });
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('ON CONFLICT (collection_id) DO NOTHING'),
      ['evidence', '{"frontier":"f1","records":[]}'],
    ]);
  });

  it('updates only the expected revision and returns the winner after conflict', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ revision: '9', snapshot: { frontier: 'winner', records: [] } }],
      });
    const storage = createPostgresReplicatedCollectionStorage({ pool: { query } as never });

    await expect(
      storage.accept({
        collectionId: 'plans',
        expectedRevision: '8',
        snapshot: { frontier: 'delayed', records: [] },
      }),
    ).resolves.toEqual({
      status: 'conflict',
      current: { revision: '9', snapshot: { frontier: 'winner', records: [] } },
    });
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('WHERE collection_id = $1 AND revision = $3::bigint'),
      ['plans', '{"frontier":"delayed","records":[]}', '8'],
    ]);
  });

  it('is supplied by the active Data Graph storage with the same pool', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const dataGraphStorage = createPostgresDataGraphStorage({
      pool: { query } as never,
      replicatedCollections: { tables: { snapshots: 'atlas_replicas' } },
    });

    await expect(dataGraphStorage.replicatedCollectionStorage.load('plans')).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM "atlas_replicas"'), ['plans']);
  });
});
