import { createEntityRef, entity, field, relationship } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  compilePostgresRelationshipCommand,
  materializePostgresRelationshipDelta,
  postgresMapping,
} from '../../src/data-graph/index.js';

const Course = entity('Course', { id: field.id(), name: field.string() });
const Student = entity('Student', {
  id: field.id(),
  course: field.nullable(field.ref(Course)),
});
Course.hasMany('students', Student, { via: 'course' });
const courseMapping = postgresMapping({
  entity: Course,
  table: 'courses',
  columns: { id: 'course_id', name: 'name' },
});
const studentMapping = postgresMapping({
  entity: Student,
  table: 'students',
  columns: { id: 'student_id', course: 'course_id' },
});

describe('PostgreSQL direct Relationship Commands', () => {
  it('compiles conditional assignment as one guarded statement', () => {
    const student = createEntityRef(Student, { id: 'student-1' });
    const previous = createEntityRef(Course, { id: 'course-1' });
    const next = createEntityRef(Course, { id: 'course-2' });
    const compiled = compilePostgresRelationshipCommand(
      relationship(Student, 'course', student).assign(next, { ifCurrent: previous }),
      studentMapping,
      courseMapping,
    );

    expect(compiled.sql.values).toEqual(['student-1', 'course-2', 'course-1', 'course-2']);
    expect(compiled.sql.text).toContain('FOR UPDATE');
    expect(compiled.sql.text).toContain('UPDATE "students"');
    expect(compiled.sql.text).toContain('"course_id" = $4');
    expect(compiled.sql.text).toContain('old_target IS NOT DISTINCT FROM $3');
  });

  it('materializes exact replacement and stale-precondition outcomes', () => {
    const student = createEntityRef(Student, { id: 'student-1' });
    const previous = createEntityRef(Course, { id: 'course-1' });
    const next = createEntityRef(Course, { id: 'course-2' });
    const command = relationship(Student, 'course', student).assign(next, {
      ifCurrent: previous,
    });
    const compiled = compilePostgresRelationshipCommand(command, studentMapping, courseMapping);

    expect(
      materializePostgresRelationshipDelta(command, compiled, {
        source_count: 1,
        target_count: 1,
        updated_count: 1,
        old_target: 'course-1',
      }),
    ).toEqual({
      delta: {
        added: [{ relation: command.relation, source: student, target: next }],
        removed: [{ relation: command.relation, source: student, target: previous }],
      },
    });
    expect(
      materializePostgresRelationshipDelta(command, compiled, {
        source_count: 1,
        target_count: 1,
        updated_count: 0,
        old_target: 'course-3',
      }),
    ).toEqual({ preconditionFailed: true });
  });

  it('fails closed instead of bypassing inverse-declared Relation constraints', () => {
    const GuardedCourse = entity('GuardedCourse', { id: field.id() });
    const GuardedStudent = entity('GuardedStudent', {
      id: field.id(),
      course: field.nullable(field.ref(GuardedCourse)),
    });
    GuardedCourse.hasMany('students', GuardedStudent, {
      via: 'course',
      constraints: [
        {
          kind: 'participant-selection',
          participant: 'target',
          selection: { kind: 'all' },
          rejection: { version: 1, code: 'guarded', message: 'Guarded.' },
        },
      ],
    });
    const guardedStudentMapping = postgresMapping({
      entity: GuardedStudent,
      table: 'guarded_students',
      columns: { id: 'id', course: 'course_id' },
    });
    const guardedCourseMapping = postgresMapping({
      entity: GuardedCourse,
      table: 'guarded_courses',
      columns: { id: 'id' },
    });

    expect(() =>
      compilePostgresRelationshipCommand(
        relationship(
          GuardedStudent,
          'course',
          createEntityRef(GuardedStudent, { id: 'student-1' }),
        ).assign(createEntityRef(GuardedCourse, { id: 'course-1' })),
        guardedStudentMapping,
        guardedCourseMapping,
      ),
    ).toThrow('do not yet compile Relation constraints');
  });
});
