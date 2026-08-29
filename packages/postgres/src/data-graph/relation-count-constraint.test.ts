import {
  createEntityRef,
  entity,
  field,
  relationConstraint,
  relationship,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { postgresMapping } from './mapping.js';
import { compilePostgresRelationCountConstraints } from './relation-count-constraint.js';

describe('PostgreSQL Relation count constraint compiler', () => {
  it('projects the limit, guards prospective count, and requests an endpoint lock', () => {
    const Course = entity('CountSqlCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
    });
    const Student = entity('CountSqlStudent', {
      id: field.id(),
      course: field.nullable(field.ref(Course)),
    });
    Course.hasMany('students', Student, {
      via: 'course',
      constraints: [
        relationConstraint.countAtMost('capacity', {
          code: 'course_full',
          message: 'Course has no available seats.',
        }),
      ],
    });
    const courseMapping = postgresMapping({
      entity: Course,
      table: 'courses',
      columns: { id: 'id', capacity: 'capacity' },
    });
    const studentMapping = postgresMapping({
      entity: Student,
      table: 'students',
      columns: { id: 'id', course: 'course_id' },
    });
    const course = createEntityRef(Course, { id: 'course-1' });
    const values: unknown[] = ['course-1'];
    const compiled = compilePostgresRelationCountConstraints({
      command: relationship(
        Student,
        'course',
        createEntityRef(Student, { id: 'student-1' }),
      ).assign(course),
      sourceMapping: studentMapping,
      targetMapping: courseMapping,
      relationColumn: '"course_id"',
      nextPlaceholder: '$1',
      values,
    });

    expect(compiled.targetProjection).toEqual(['"capacity" AS "ontahi_relation_count_limit_0"']);
    expect(compiled.stateProjection).toHaveLength(1);
    expect(compiled.rejectionExpression).toContain(
      'SELECT COUNT(*)::int FROM "students" AS relation_members',
    );
    expect(compiled.rejectionExpression).toContain('+ 1 <= "ontahi_relation_count_limit_0"');
    expect(compiled.serializationLock).toEqual({
      text: 'SELECT 1 FROM "courses" WHERE "id" = $1 FOR UPDATE',
      values: ['course-1'],
    });
    expect(values).toEqual([
      'course-1',
      {
        version: 1,
        code: 'course_full',
        message: 'Course has no available seats.',
      },
    ]);
  });
});
