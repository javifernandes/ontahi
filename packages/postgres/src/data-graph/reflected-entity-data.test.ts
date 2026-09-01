import { entity, field, mapEntity } from '@ontahi/core/data-graph';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { DerivedCourseMapping } from './fixtures.test-support.js';
import { postgresMapping } from './mapping.js';
import { listPostgresReflectedEntityData } from './reflected-entity-data.js';

describe('PostgreSQL reflected Entity data', () => {
  it('projects, filters, and orders virtual derived Fields without expecting physical columns', async () => {
    const query = vi.fn(async (text: string, _values?: unknown[]) => {
      if (text.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'id' }, { column_name: 'capacity' }] };
      }
      if (text.startsWith('SELECT COUNT(*)')) return { rows: [{ count: 1 }] };
      return { rows: [{ id: 'course-1', capacity: 3, availableSeats: 2 }] };
    });

    await expect(
      listPostgresReflectedEntityData(
        { pool: { query } as unknown as Pool, mappings: [DerivedCourseMapping] },
        {
          entityName: 'DerivedCourse',
          filters: [{ field: 'availableSeats', operator: 'equals', value: '2' }],
          pageSize: 25,
          sort: { field: 'availableSeats', direction: 'desc' },
        },
      ),
    ).resolves.toMatchObject({
      columns: [{ field: 'id' }, { field: 'capacity' }, { field: 'availableSeats' }],
      omittedColumns: [],
      rows: [{ id: 'course-1', capacity: 3, availableSeats: 2 }],
    });

    const sql = query.mock.calls.map(([text]) => text).join('\n');
    expect(sql).toContain(
      '("derived_courses"."capacity" - (SELECT COUNT(*)::int FROM "derived_students"',
    );
    expect(sql).toContain(') = $1');
    expect(sql).toContain(' DESC NULLS LAST');
    expect(query.mock.calls[1]?.[1]).toEqual([2]);
    expect(query.mock.calls[2]?.[1]).toEqual([2, 25, 0]);
  });

  it('searches named string Fields through their primitive type', async () => {
    const Article = entity('Article', {
      id: field.id(),
      title: field.named('Title', field.string()),
    }).display({ primary: 'title', search: ['title'] });
    mapEntity(Article).toTable('articles');
    const mapping = postgresMapping({
      entity: Article,
      table: 'articles',
      columns: { id: 'id', title: 'title' },
    });
    const query = vi.fn(async (text: string, _values?: unknown[]) => {
      if (text.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'id' }, { column_name: 'title' }] };
      }
      if (text.startsWith('SELECT COUNT(*)')) return { rows: [{ count: 1 }] };
      return { rows: [{ id: 'article-1', title: 'Intro' }] };
    });

    const result = await listPostgresReflectedEntityData(
      { pool: { query } as unknown as Pool, mappings: [mapping] },
      { entityName: 'Article', search: 'intro' },
    );

    expect(query.mock.calls.map(([text]) => text).join('\n')).toContain(
      `"title" ILIKE '%' || $1 || '%'`,
    );
    expect(result.columns).toContainEqual({
      field: 'title',
      type: 'string',
      valueType: 'Title',
      nullable: false,
    });
  });
});
