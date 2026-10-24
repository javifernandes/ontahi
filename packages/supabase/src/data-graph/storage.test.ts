import { entity, field, getEntityMapping } from '@ontahi/core/data-graph';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseDataGraphStorage } from './storage.js';

const createSupabaseClient = () => {
  const from = vi.fn((table: string) => {
    const query = {
      eq: () => query,
      ilike: () => query,
      in: () => query,
      is: () => query,
      or: () => query,
      order: () => query,
      select: () => query,
      range: async () => ({
        count: 1,
        data: [{ id: 'experiment-1', display_name: 'Pilot' }],
        error: null,
      }),
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

    const reflected = await storage.readEntityData({
      entityName: Experiment.name,
      filters: [],
      page: 1,
      pageSize: 25,
      search: '',
    });

    expect(supabase.from).toHaveBeenCalledWith('storage_experiments');
    expect(reflected.rows).toEqual([{ id: 'experiment-1', displayName: 'Pilot' }]);
  });

  it('fails clearly when used before the application binds its Entity registry', () => {
    const storage = createSupabaseDataGraphStorage({ client: createSupabaseClient().client });

    expect(() => storage.createRuntime()).toThrow(
      'Supabase storage has no entities. Bind it through ontahi({ storage, entities }).',
    );
  });
});
