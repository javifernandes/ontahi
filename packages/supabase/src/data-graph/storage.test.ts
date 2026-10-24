import { createEntityRef, entity, field, getEntityMapping, query } from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseDataGraphStorage } from './storage.js';

const createSupabaseClient = (error: { message: string } | null = null) => {
  const from = vi.fn((table: string) => {
    const query = {
      eq: () => query,
      ilike: () => query,
      in: () => query,
      insert: () => query,
      is: () => query,
      or: () => query,
      order: () => query,
      select: () => query,
      limit: () => query,
      range: async () => ({
        count: 1,
        data: [{ id: 'experiment-1', display_name: 'Pilot' }],
        error,
      }),
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) =>
        Promise.resolve({
          count: 1,
          data: [{ id: 'experiment-1', display_name: 'Pilot' }],
          error,
        }).then(onfulfilled, onrejected),
    };
    return query;
  });
  return { client: { from }, from };
};

describe('Supabase Data Graph storage', () => {
  it('binds conventional mappings and reuses one host-owned client for reflected reads', async () => {
    const Experiment = entity('StorageExperiment', {
      id: field.id(),
      displayName: field.string(),
    });
    const supabase = createSupabaseClient();
    const storage = createSupabaseDataGraphStorage({ client: supabase.client });

    storage.bindEntities?.([Experiment]);

    expect(storage.kind).toBe('supabase');
    expect(storage.graphReadCapabilities).toEqual({ relationSelections: true });
    expect(getEntityMapping(Experiment)).toEqual({
      tableName: 'storage_experiments',
      columns: { id: 'id', displayName: 'display_name' },
    });
    expect(storage.createRuntime()).toHaveProperty('runEntityMutationCommand');

    await expect(
      Effect.runPromise(storage.createRuntime().run(query(Experiment), {})),
    ).resolves.toEqual([{ id: 'experiment-1', displayName: 'Pilot' }]);
    await expect(
      Effect.runPromise(
        storage.createRuntime().runCommand({
          kind: 'command',
          operation: 'insert',
          root: Experiment,
          selection: { kind: 'none' },
          payload: { id: 'experiment-1', displayName: 'Pilot' },
          returning: ['id'],
          cardinality: 'one',
        }),
      ),
    ).resolves.toEqual({ id: 'experiment-1', displayName: 'Pilot' });

    const reflected = await storage.readEntityData({
      entityName: Experiment.name,
      filters: [],
      page: 1,
      pageSize: 25,
      search: '',
    });

    expect(supabase.from).toHaveBeenCalledWith('storage_experiments');
    expect(reflected.rows).toEqual([{ id: 'experiment-1', displayName: 'Pilot' }]);

    await expect(
      storage.readRelatedEntityData?.({
        source: createEntityRef(Experiment, { id: 'experiment-1' }),
        relationName: 'missing',
        sourceEntityName: Experiment.name,
        targetEntityName: Experiment.name,
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toThrow('missing');
  });

  it('fails clearly when used before the application binds its Entity registry', () => {
    const storage = createSupabaseDataGraphStorage({ client: createSupabaseClient().client });

    expect(() => storage.createRuntime()).toThrow(
      'Supabase storage has no entities. Bind it through ontahi({ storage, entities }).',
    );
  });

  it('wraps provider failures in the default Error type', async () => {
    const Experiment = entity('FailingStorageExperiment', {
      id: field.id(),
    });
    const storage = createSupabaseDataGraphStorage({
      client: createSupabaseClient({ message: 'database unavailable' }).client,
    });
    storage.bindEntities?.([Experiment]);

    const failure = await Effect.runPromise(
      Effect.flip(storage.createRuntime().run(query(Experiment), {})),
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('cause', 'database unavailable');
  });
});
