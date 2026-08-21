import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  executeInMemoryRelationshipCommandEffect,
  entity,
  field,
  query,
  relationship,
  type InMemoryDataset,
} from '../../src/data-graph/index.js';

describe('relationship commands', () => {
  const Course = entity('Course', { id: field.id(), name: field.string() });
  const Student = entity('Student', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  Course.hasMany('students', Student, { via: 'course' });

  const student = createEntityRef(Student, { id: 'student-1' });
  const course = createEntityRef(Course, { id: 'course-1' });

  it('normalizes forward assign and inverse add to the same canonical command', () => {
    expect(relationship(Student, 'course', student).assign(course)).toEqual(
      relationship(Course, 'students', course).add(student),
    );
  });

  it('preserves the inverse target precondition when normalizing unlink authoring', () => {
    expect(relationship(Student, 'course', student).clear()).toEqual({
      kind: 'relationship-command',
      action: 'unlink',
      relation: {
        sourceEntityName: 'Student',
        fieldName: 'course',
        targetEntityName: 'Course',
      },
      source: student,
    });
    expect(relationship(Course, 'students', course).remove(student)).toEqual({
      kind: 'relationship-command',
      action: 'unlink',
      relation: {
        sourceEntityName: 'Student',
        fieldName: 'course',
        targetEntityName: 'Course',
      },
      source: student,
      target: course,
    });
  });

  it('rejects endpoint refs that do not belong to the Relation', () => {
    expect(() => relationship(Student, 'course', course)).toThrow(
      'Expected relationship subject Ref for Student, got Course.',
    );
    expect(() => relationship(Student, 'course', student).assign(student)).toThrow(
      'Expected target Ref for Course, got Student.',
    );
  });

  it('applies exact deltas for assign, no-op, reassignment, clear, and guarded remove', async () => {
    const otherCourse = createEntityRef(Course, { id: 'course-2' });
    const dataset: InMemoryDataset = {
      Course: [
        { id: 'course-1', name: 'Semantics' },
        { id: 'course-2', name: 'Systems' },
      ],
      Student: [{ id: 'student-1', course: null }],
    };
    const execute = (command: ReturnType<ReturnType<typeof relationship>['assign']>) =>
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(dataset, [Course, Student], command),
      );

    await expect(execute(relationship(Student, 'course', student).assign(course))).resolves.toEqual(
      {
        added: [
          {
            relation: {
              sourceEntityName: 'Student',
              fieldName: 'course',
              targetEntityName: 'Course',
            },
            source: student,
            target: course,
          },
        ],
        removed: [],
      },
    );
    await expect(execute(relationship(Course, 'students', course).add(student))).resolves.toEqual({
      added: [],
      removed: [],
    });
    await expect(
      execute(relationship(Student, 'course', student).assign(otherCourse)),
    ).resolves.toEqual({
      added: [expect.objectContaining({ target: otherCourse })],
      removed: [expect.objectContaining({ target: course })],
    });
    await expect(
      execute(relationship(Course, 'students', course).remove(student)),
    ).resolves.toEqual({ added: [], removed: [] });
    await expect(execute(relationship(Student, 'course', student).clear())).resolves.toEqual({
      added: [],
      removed: [expect.objectContaining({ target: otherCourse })],
    });
    expect(dataset.Student).toEqual([{ id: 'student-1', course: null }]);
  });

  it('rejects a link to a missing target before mutation', async () => {
    const dataset: InMemoryDataset = {
      Course: [],
      Student: [{ id: 'student-1', course: null }],
    };

    await expect(
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(
          dataset,
          [Course, Student],
          relationship(Student, 'course', student).assign(course),
        ).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
    expect(dataset.Student).toEqual([{ id: 'student-1', course: null }]);
  });

  it('enforces portable target-participant constraints for forward and inverse authoring', async () => {
    const ConstrainedCourse = entity('ConstrainedCourse', {
      id: field.id(),
      name: field.string(),
    });
    const ConstrainedStudent = entity('ConstrainedStudent', {
      id: field.id(),
      status: field.string(),
      course: field.nullable(field.ref(ConstrainedCourse)),
    });
    ConstrainedCourse.hasMany('students', ConstrainedStudent, {
      via: 'course',
      constraints: [
        {
          kind: 'participant-selection',
          participant: 'target',
          selection: {
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'status',
            value: 'active',
          },
          rejection: {
            version: 1,
            code: 'student_inactive',
            message: 'Only active students may join a course.',
          },
        },
      ],
    });
    const active = createEntityRef(ConstrainedStudent, { id: 'active' });
    const inactive = createEntityRef(ConstrainedStudent, { id: 'inactive' });
    const constrainedCourse = createEntityRef(ConstrainedCourse, { id: 'course-1' });
    const dataset: InMemoryDataset = {
      ConstrainedCourse: [{ id: 'course-1', name: 'Semantics' }],
      ConstrainedStudent: [
        { id: 'active', status: 'active', course: null },
        { id: 'inactive', status: 'inactive', course: null },
      ],
    };
    const execute = (command: ReturnType<ReturnType<typeof relationship>['assign']>) =>
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(
          dataset,
          [ConstrainedCourse, ConstrainedStudent],
          command,
        ).pipe(Effect.either),
      );

    await expect(
      execute(relationship(ConstrainedStudent, 'course', inactive).assign(constrainedCourse)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: {
          version: 1,
          code: 'student_inactive',
          message: 'Only active students may join a course.',
        },
      },
    });
    expect(dataset.ConstrainedStudent?.[1]?.course).toBeNull();

    await expect(
      execute(relationship(ConstrainedCourse, 'students', constrainedCourse).add(active)),
    ).resolves.toMatchObject({ _tag: 'Right' });
    expect(dataset.ConstrainedStudent?.[0]?.course).toBe('course-1');
  });

  it('rejects clearing a required Relation before mutation', async () => {
    const RequiredStudent = entity('RequiredStudent', {
      id: field.id(),
      course: field.ref(Course),
    });
    const requiredStudent = createEntityRef(RequiredStudent, { id: 'student-1' });
    const dataset: InMemoryDataset = {
      Course: [{ id: 'course-1', name: 'Semantics' }],
      RequiredStudent: [{ id: 'student-1', course: 'course-1' }],
    };

    await expect(
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(
          dataset,
          [Course, RequiredStudent],
          relationship(RequiredStudent, 'course', requiredStudent).clear(),
        ).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'invalid_command', message: expect.stringContaining('cannot be cleared') },
    });
    expect(dataset.RequiredStudent).toEqual([{ id: 'student-1', course: 'course-1' }]);
  });

  it('provides required construction and deletion for an Association Entity', async () => {
    const Enrollment = entity('Enrollment', {
      student: field.ref(Student),
      course: field.ref(Course),
      startedAt: field.date(),
      status: field.string(),
    }).locators({ refByStudentAndCourse: ['student', 'course'] });
    const dataset: InMemoryDataset = { Enrollment: [] };
    const runtime = createInMemoryDataGraphRuntime({ dataset });

    await expect(
      Effect.runPromise(
        runtime
          .runCommand({
            kind: 'command',
            operation: 'insert',
            root: Enrollment,
            selection: { kind: 'none' },
            payload: { student, startedAt: new Date('2026-08-19'), status: 'active' },
          })
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'invalid_command', message: expect.stringContaining('course') },
    });

    await Effect.runPromise(
      runtime.runCommand({
        kind: 'command',
        operation: 'insert',
        root: Enrollment,
        selection: { kind: 'none' },
        payload: { student, course, startedAt: new Date('2026-08-19'), status: 'active' },
      }),
    );
    expect(dataset.Enrollment).toHaveLength(1);

    await Effect.runPromise(
      runtime.runCommand({
        kind: 'command',
        operation: 'delete',
        root: Enrollment,
        selection: query(Enrollment)
          .where(enrollment => enrollment.student.eq(student))
          .where(enrollment => enrollment.course.eq(course))
          .build().selection,
      }),
    );
    expect(dataset.Enrollment).toEqual([]);
  });
});
