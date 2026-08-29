import { evaluatePortableOperationCondition } from '@ontahi/core/data-graph';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClassroomApplication, classroomEvents } from './application.js';
import { Course, Enrollment, Student } from './classroom.js';
import { operationConditions } from './generated/operation-conditions.js';
import { addStudentToCourse, reassignStudent, removeStudentFromCourse } from './scenarios.js';

const seedClassroom = () => {
  const dataset = ClassroomApplication.storage.dataset;
  dataset.School = [{ id: 'school-1', name: 'North School' }];
  dataset.Teacher = [{ id: 'teacher-1', name: 'Ada', school: 'school-1' }];
  dataset.Course = [
    {
      id: 'course-1',
      title: 'Algebra',
      school: 'school-1',
      teacher: 'teacher-1',
      capacity: 1,
    },
    {
      id: 'course-2',
      title: 'Geometry',
      school: 'school-1',
      teacher: 'teacher-1',
      capacity: 2,
    },
    {
      id: 'course-3',
      title: 'History',
      school: 'school-1',
      teacher: 'teacher-1',
      capacity: 4,
    },
  ];
  dataset.Student = [
    { id: 'student-1', name: 'Grace', school: 'school-1', currentCourse: 'course-1' },
  ];
  dataset.Enrollment = [];
  classroomEvents.length = 0;
};

describe('Classroom Relations lifecycle', () => {
  beforeEach(seedClassroom);

  it('declares Student transfer as an atomic Operation contract', () => {
    expect(ClassroomApplication.graph.entities.Student.domain.transfer.execution).toEqual({
      atomicity: 'required',
    });
    expect(
      (
        ClassroomApplication.graph.entities.Student.domain.transfer.input as unknown as {
          fields: { student: unknown };
        }
      ).fields.student,
    ).toMatchObject({ referenceRequirement: 'existing' });
    expect(ClassroomApplication.graph.entities.Student.domain.transfer.conditions).toEqual(
      operationConditions.operations['Student.transfer'],
    );
  });

  it('declares Course capacity as reflected structural Relation metadata', () => {
    expect(Course.relations.students.constraints).toEqual([
      {
        kind: 'relation-count-at-most-field',
        fieldName: 'capacity',
        enforcement: 'authority-serialized',
        rejection: {
          version: 1,
          code: 'course_full',
          message: 'Course has no available seats.',
        },
      },
    ]);
  });

  it('rejects capacity through the Relation boundary without an Operation preflight', async () => {
    ClassroomApplication.storage.dataset.Student = [
      ...(ClassroomApplication.storage.dataset.Student ?? []),
      {
        id: 'student-2',
        name: 'Katherine',
        school: 'school-1',
        currentCourse: null,
      },
    ];

    await expect(
      addStudentToCourse({ courseId: 'course-1', studentId: 'student-2' }),
    ).rejects.toMatchObject({
      reason: 'relation_constraint_rejected',
      rejection: { code: 'course_full' },
    });
    expect(ClassroomApplication.storage.dataset.Student?.[1]?.currentCourse).toBeNull();
  });

  it('evaluates the portable same-Course condition without resolving either Ref', () => {
    const condition = operationConditions.operations['Student.transfer'].pre[0];

    expect(
      evaluatePortableOperationCondition(condition, {
        previousCourse: Course.refById('course-1'),
        nextCourse: Course.refById('course-1'),
      }),
    ).toEqual({
      status: 'rejected',
      rejection: {
        reason: 'operation_condition_rejected',
        message: 'Operation condition "differentCourses" was not satisfied.',
      },
    });
    expect(
      evaluatePortableOperationCondition(condition, {
        previousCourse: Course.refById('course-1'),
        nextCourse: Course.refById('course-2'),
      }),
    ).toEqual({ status: 'satisfied' });
  });

  it('reassigns a Student conditionally and distinguishes conflict from explicit skip', async () => {
    const applied = await reassignStudent({
      studentId: 'student-1',
      previousCourseId: 'course-1',
      nextCourseId: 'course-2',
    });

    expect(applied).toMatchObject({
      status: 'applied',
      outcome: {
        delta: {
          removed: [
            {
              source: { entityName: 'Student', locator: { id: 'student-1' } },
              target: { entityName: 'Course', locator: { id: 'course-1' } },
            },
          ],
          added: [
            {
              source: { entityName: 'Student', locator: { id: 'student-1' } },
              target: { entityName: 'Course', locator: { id: 'course-2' } },
            },
          ],
        },
      },
    });
    expect(ClassroomApplication.storage.dataset.Student).toEqual([
      { id: 'student-1', name: 'Grace', school: 'school-1', currentCourse: 'course-2' },
    ]);
    await expect(
      ClassroomApplication.storage.readEntityData({ entityName: 'Course' }),
    ).resolves.toMatchObject({
      rows: [
        { id: 'course-1', capacity: 1, occupiedSeats: 0, availableSeats: 1 },
        { id: 'course-2', capacity: 2, occupiedSeats: 1, availableSeats: 1 },
        { id: 'course-3', capacity: 4, occupiedSeats: 0, availableSeats: 4 },
      ],
    });
    expect(ClassroomApplication.storage.dataset.Course).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ availableSeats: expect.anything() })]),
    );

    await expect(
      reassignStudent({
        studentId: 'student-1',
        previousCourseId: 'course-1',
        nextCourseId: 'course-3',
      }),
    ).rejects.toMatchObject({
      _tag: 'InMemoryDataGraphError',
      reason: 'relationship_precondition_failed',
    });

    await expect(
      reassignStudent({
        studentId: 'student-1',
        previousCourseId: 'course-1',
        nextCourseId: 'course-3',
        onMismatch: 'skip',
      }),
    ).resolves.toMatchObject({
      status: 'not-applied',
      diagnostic: { reason: 'relationship_precondition_failed' },
    });
    expect(ClassroomApplication.storage.dataset.Student).toEqual([
      { id: 'student-1', name: 'Grace', school: 'school-1', currentCourse: 'course-2' },
    ]);
  });

  it('observes inverse unlink as an application Reaction after the mutation is applied', async () => {
    const result = await removeStudentFromCourse({
      courseId: 'course-1',
      studentId: 'student-1',
    });

    expect(result).toMatchObject({
      status: 'applied',
      outcome: {
        delta: {
          removed: [
            {
              source: { entityName: 'Student', locator: { id: 'student-1' } },
              target: { entityName: 'Course', locator: { id: 'course-1' } },
            },
          ],
        },
      },
      reactions: [{ reactionId: 'course.students.removed', status: 'emitted' }],
    });
    expect(ClassroomApplication.storage.dataset.Student).toEqual([
      { id: 'student-1', name: 'Grace', school: 'school-1', currentCourse: null },
    ]);
    expect(classroomEvents).toEqual([
      {
        type: 'StudentRemovedFromCourse',
        student: Student.refById('student-1'),
        course: Course.refById('course-1'),
      },
    ]);

    await expect(
      removeStudentFromCourse({ courseId: 'course-1', studentId: 'missing-student' }),
    ).rejects.toMatchObject({
      _tag: 'InMemoryDataGraphError',
      reason: 'cardinality_mismatch',
    });
    expect(classroomEvents).toHaveLength(1);
  });

  it('keeps Enrollment participants and attributes through its ordinary Entity lifecycle', async () => {
    await expect(
      Enrollment.enroll({
        id: 'enrollment-1',
        student: Student.refById('student-1'),
        course: Course.refById('course-1'),
        startedAt: '2026-08-25T09:00:00.000Z',
        credits: 3,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        id: 'enrollment-1',
        status: 'pending',
        credits: 3,
      },
    });

    const activation = await Enrollment.activate({
      enrollment: Enrollment.refById('enrollment-1'),
    });
    expect(activation).toMatchObject({
      ok: true,
      value: { id: 'enrollment-1', status: 'active' },
    });
    await expect(
      Enrollment.cancel({
        enrollment: Enrollment.refById('enrollment-1'),
        endedAt: '2026-08-25T10:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { id: 'enrollment-1', status: 'cancelled' },
    });

    expect(ClassroomApplication.storage.dataset.Enrollment).toEqual([
      {
        id: 'enrollment-1',
        student: 'student-1',
        course: 'course-1',
        status: 'cancelled',
        startedAt: '2026-08-25T09:00:00.000Z',
        endedAt: '2026-08-25T10:00:00.000Z',
        credits: 3,
      },
    ]);

    await expect(
      Enrollment.activate({ enrollment: Enrollment.refById('enrollment-1') }),
    ).resolves.toMatchObject({
      ok: false,
      failure: { reason: 'enrollment_not_pending', status: 'cancelled' },
    });
    expect(ClassroomApplication.storage.dataset.Enrollment?.[0]).toMatchObject({
      status: 'cancelled',
      endedAt: '2026-08-25T10:00:00.000Z',
    });
  });
});
