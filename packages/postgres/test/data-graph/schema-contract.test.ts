import { field, mapEntity } from '@ontahi/core/data-graph';
import { entity } from '@ontahi/core/entity';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { inspectPostgresDataGraphSchema } from '../../src/data-graph/schema-contract.js';

describe('PostgreSQL data graph schema contract', () => {
  it('reports mapped tables and columns missing from the physical schema', async () => {
    const Todo = entity({
      name: 'Todo',
      fields: {
        id: field.id(),
        title: field.string(),
      },
    });
    const Project = entity({
      name: 'Project',
      fields: { id: field.id() },
    });
    mapEntity(Todo).toTable('todos', { id: 'id', title: 'title' });
    mapEntity(Project).toTable('projects', { id: 'id' });

    await expect(
      inspectPostgresDataGraphSchema({
        entities: [Todo, Project],
        pool: {
          query: async () => ({ rows: [{ table_name: 'todos', column_name: 'id' }] }),
        } as unknown as Pick<Pool, 'query'>,
      }),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          kind: 'column-not-found',
          column: 'title',
          entity: 'Todo',
          field: 'title',
          schema: 'public',
          table: 'todos',
        },
        {
          kind: 'table-not-found',
          entity: 'Project',
          schema: 'public',
          table: 'projects',
        },
      ],
    });
  });
});
