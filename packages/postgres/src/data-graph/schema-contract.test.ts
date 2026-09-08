import { field, mapEntity, mapRelation, modelExpression } from '@ontahi/core/data-graph';
import { entity } from '@ontahi/core/entity';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { inspectPostgresDataGraphSchema } from './schema-contract.js';

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

  it('requires stored dependencies but never expects physical columns for derived Fields', async () => {
    const Course = entity({
      name: 'Course',
      fields: {
        id: field.id(),
        capacity: field.nonNegativeInteger(),
        availableSeats: field.derived(
          field.nonNegativeInteger(),
          modelExpression.define(modelExpression.field('capacity')),
        ),
      },
    });
    mapEntity(Course).toTable('courses', { id: 'id', capacity: 'capacity' });

    await expect(
      inspectPostgresDataGraphSchema({
        entities: [Course],
        pool: {
          query: async () => ({
            rows: [
              { table_name: 'courses', column_name: 'id' },
              { table_name: 'courses', column_name: 'available_seats' },
            ],
          }),
        } as unknown as Pick<Pool, 'query'>,
      }),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          kind: 'column-not-found',
          column: 'capacity',
          entity: 'Course',
          field: 'capacity',
          schema: 'public',
          table: 'courses',
        },
      ],
    });
  });

  it('requires the private order column on the ordered Relation target table', async () => {
    const ListBase = entity({ name: 'List', fields: { id: field.id() } });
    const Item = entity({
      name: 'Item',
      fields: { id: field.id(), list: field.ref(ListBase) },
    });
    const List = ListBase.hasMany('items', Item, { via: 'list', ordered: true });
    mapEntity(List).toTable('lists', { id: 'id' });
    mapEntity(Item).toTable('items', { id: 'id', list: 'list_id' });
    mapRelation(List, 'items', {
      type: 'one-to-many',
      from: 'lists.id',
      to: 'items.list_id',
      orderBy: 'items.list_position',
    });

    await expect(
      inspectPostgresDataGraphSchema({
        entities: [List, Item],
        pool: {
          query: async () => ({
            rows: [
              { table_name: 'lists', column_name: 'id' },
              { table_name: 'items', column_name: 'id' },
              { table_name: 'items', column_name: 'list_id' },
            ],
          }),
        } as unknown as Pick<Pool, 'query'>,
      }),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          kind: 'column-not-found',
          column: 'list_position',
          entity: 'Item',
          field: 'List.items.__order',
          schema: 'public',
          table: 'items',
        },
      ],
    });
  });
});
