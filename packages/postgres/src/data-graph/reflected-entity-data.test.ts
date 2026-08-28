import { entity, field, mapEntity, mapRelation, modelExpression } from '@ontahi/core/data-graph';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { postgresMapping } from './mapping.js';
import { listPostgresReflectedEntityData } from './reflected-entity-data.js';

describe('PostgreSQL reflected Entity data', () => {
  it('projects, filters, and orders virtual derived Fields without expecting physical columns', async () => {
    const Course = entity('ReflectedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(
          modelExpression.subtract(
            modelExpression.field('capacity'),
            modelExpression.relation('students').count(),
          ),
        ),
      ),
    });
    const Student = entity('ReflectedStudent', {
      id: field.id(),
      course: field.ref(Course),
    });
    const CourseWithStudents = Course.hasMany('students', Student, { via: 'course' });
    mapEntity(CourseWithStudents).toTable('reflected_courses');
    mapEntity(Student).toTable('reflected_students', { course: 'course_id' });
    mapRelation(CourseWithStudents, 'students', {
      type: 'one-to-many',
      from: 'reflected_courses.id',
      to: 'reflected_students.course_id',
    });
    const mapping = postgresMapping({
      entity: CourseWithStudents,
      table: 'reflected_courses',
      columns: { id: 'id', capacity: 'capacity' },
    });
    const query = vi.fn(async (text: string, _values?: unknown[]) => {
      if (text.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'id' }, { column_name: 'capacity' }] };
      }
      if (text.startsWith('SELECT COUNT(*)')) return { rows: [{ count: 1 }] };
      return { rows: [{ id: 'course-1', capacity: 3, availableSeats: 2 }] };
    });

    await expect(
      listPostgresReflectedEntityData(
        { pool: { query } as unknown as Pool, mappings: [mapping] },
        {
          entityName: 'ReflectedCourse',
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
      '("reflected_courses"."capacity" - (SELECT COUNT(*)::int FROM "reflected_students"',
    );
    expect(sql).toContain(') = $1');
    expect(sql).toContain(' DESC NULLS LAST');
    expect(query.mock.calls[1]?.[1]).toEqual([2]);
    expect(query.mock.calls[2]?.[1]).toEqual([2, 25, 0]);
  });
});
