import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  executeInMemoryRelationshipCommandEffect,
  entity,
  field,
  query,
  relationConstraint,
  relationship,
  type InMemoryDataset,
} from './index.js';

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

  it('reassigns a to-one Relation only when its current target matches', async () => {
    const previous = createEntityRef(Course, { id: 'course-1' });
    const next = createEntityRef(Course, { id: 'course-2' });
    const student = createEntityRef(Student, { id: 'student-1' });
    const dataset = {
      Course: [{ id: 'course-1' }, { id: 'course-2' }, { id: 'course-3' }],
      Student: [{ id: 'student-1', course: 'course-1' }],
    };
    const command = relationship(Student, 'course', student).assign(next, {
      ifCurrent: previous,
    });

    expect(command).toMatchObject({ precondition: { currentTarget: previous } });
    await expect(
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(dataset, [Course, Student], command),
      ),
    ).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [{ relation: command.relation, source: student, target: next }],
        removed: [{ relation: command.relation, source: student, target: previous }],
      },
    });
    expect(dataset.Student).toEqual([{ id: 'student-1', course: 'course-2' }]);
  });

  it('rejects a stale conditional reassignment without changing data', async () => {
    const student = createEntityRef(Student, { id: 'student-1' });
    const dataset = {
      Course: [{ id: 'course-1' }, { id: 'course-2' }, { id: 'course-3' }],
      Student: [{ id: 'student-1', course: 'course-3' }],
    };
    const command = relationship(Student, 'course', student).assign(
      createEntityRef(Course, { id: 'course-2' }),
      { ifCurrent: createEntityRef(Course, { id: 'course-1' }) },
    );

    const result = await Effect.runPromise(
      executeInMemoryRelationshipCommandEffect(dataset, [Course, Student], command).pipe(
        Effect.either,
      ),
    );
    expect(result).toMatchObject({
      _tag: 'Left',
      left: { reason: 'relationship_precondition_failed' },
    });
    expect(dataset.Student).toEqual([{ id: 'student-1', course: 'course-3' }]);
  });

  it('returns an observable not-applied result when a stale assignment opts into skip', async () => {
    const current = createEntityRef(Course, { id: 'course-3' });
    const expected = createEntityRef(Course, { id: 'course-1' });
    const next = createEntityRef(Course, { id: 'course-2' });
    const dataset = {
      Course: [{ id: 'course-1' }, { id: 'course-2' }, { id: 'course-3' }],
      Student: [{ id: 'student-1', course: 'course-3' }],
    };
    const command = relationship(Student, 'course', student).assign(next, {
      ifCurrent: expected,
      onMismatch: 'skip',
    });

    await expect(
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(dataset, [Course, Student], command),
      ),
    ).resolves.toEqual({
      status: 'not-applied',
      diagnostic: {
        reason: 'relationship_precondition_failed',
        rejection: {
          version: 1,
          code: 'relationship_precondition_failed',
          message: 'Current Relation target did not match the command precondition.',
          parameters: {
            sourceEntityName: 'Student',
            fieldName: 'course',
            targetEntityName: 'Course',
          },
        },
      },
    });
    expect(command.precondition).toEqual({ currentTarget: expected, onMismatch: 'skip' });
    expect(dataset.Student).toEqual([{ id: 'student-1', course: current.locator.id }]);
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
        status: 'applied',
        delta: {
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
      },
    );
    await expect(execute(relationship(Course, 'students', course).add(student))).resolves.toEqual({
      status: 'applied',
      delta: { added: [], removed: [] },
    });
    await expect(
      execute(relationship(Student, 'course', student).assign(otherCourse)),
    ).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [expect.objectContaining({ target: otherCourse })],
        removed: [expect.objectContaining({ target: course })],
      },
    });
    await expect(
      execute(relationship(Course, 'students', course).remove(student)),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [] } });
    await expect(execute(relationship(Student, 'course', student).clear())).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [],
        removed: [expect.objectContaining({ target: otherCourse })],
      },
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
          participant: 'source',
          selection: {
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'name',
            value: 'Semantics',
          },
          rejection: {
            version: 1,
            code: 'course_closed',
            message: 'This course is closed.',
          },
        },
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

  it('enforces constraints from an inferred inverse Relation without explicit via', async () => {
    const GuardedCourse = entity('InferredGuardedCourse', { id: field.id() });
    const GuardedStudent = entity('InferredGuardedStudent', {
      id: field.id(),
      active: field.boolean(),
      course: field.nullable(field.ref(GuardedCourse)),
    });
    GuardedCourse.hasMany('students', GuardedStudent, {
      constraints: [
        {
          kind: 'participant-selection',
          participant: 'target',
          selection: {
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'active',
            value: true,
          },
          rejection: {
            version: 1,
            code: 'inactive_student',
            message: 'Inactive students cannot join.',
          },
        },
      ],
    });
    const guardedStudent = createEntityRef(GuardedStudent, { id: 'student-1' });
    const guardedCourse = createEntityRef(GuardedCourse, { id: 'course-1' });
    const dataset = {
      InferredGuardedCourse: [{ id: 'course-1' }],
      InferredGuardedStudent: [{ id: 'student-1', active: false, course: null }],
    };

    expect(relationship(GuardedCourse, 'students', guardedCourse).add(guardedStudent)).toEqual(
      relationship(GuardedStudent, 'course', guardedStudent).assign(guardedCourse),
    );

    const result = await Effect.runPromise(
      executeInMemoryRelationshipCommandEffect(
        dataset,
        [GuardedCourse, GuardedStudent],
        relationship(GuardedStudent, 'course', guardedStudent).assign(guardedCourse),
      ).pipe(Effect.either),
    );
    expect(result).toMatchObject({
      _tag: 'Left',
      left: { reason: 'relation_constraint_rejected' },
    });
    expect(dataset.InferredGuardedStudent).toEqual([
      { id: 'student-1', active: false, course: null },
    ]);
  });

  it('enforces prospective inverse Relation counts through both authoring directions', async () => {
    const CapacityCourse = entity('CapacityCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
    });
    const CapacityStudent = entity('CapacityStudent', {
      id: field.id(),
      course: field.nullable(field.ref(CapacityCourse)),
    });
    CapacityCourse.hasMany('students', CapacityStudent, {
      via: 'course',
      constraints: [
        relationConstraint.countAtMost('capacity', {
          code: 'course_full',
          message: 'Course has no available seats.',
        }),
      ],
    });
    const course = createEntityRef(CapacityCourse, { id: 'course-1' });
    const enrolled = createEntityRef(CapacityStudent, { id: 'student-1' });
    const candidate = createEntityRef(CapacityStudent, { id: 'student-2' });
    const createDataset = (): InMemoryDataset => ({
      CapacityCourse: [{ id: 'course-1', capacity: 1 }],
      CapacityStudent: [
        { id: 'student-1', course: 'course-1' },
        { id: 'student-2', course: null },
      ],
    });
    const executeRejected = async (
      dataset: InMemoryDataset,
      command: ReturnType<ReturnType<typeof relationship>['assign']>,
    ) =>
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(
          dataset,
          [CapacityCourse, CapacityStudent],
          command,
        ).pipe(Effect.either),
      );

    const forwardDataset = createDataset();
    await expect(
      executeRejected(
        forwardDataset,
        relationship(CapacityStudent, 'course', candidate).assign(course),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'course_full' },
      },
    });
    expect(forwardDataset.CapacityStudent?.[1]?.course).toBeNull();

    const inverseDataset = createDataset();
    await expect(
      executeRejected(
        inverseDataset,
        relationship(CapacityCourse, 'students', course).add(candidate),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'course_full' },
      },
    });
    expect(inverseDataset.CapacityStudent?.[1]?.course).toBeNull();

    await expect(
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(
          inverseDataset,
          [CapacityCourse, CapacityStudent],
          relationship(CapacityCourse, 'students', course).add(enrolled),
        ),
      ),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [] } });
  });

  it('allows Relation removals that repair an already-invalid aggregate', async () => {
    const CapacityCourse = entity('RepairCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
    });
    const CapacityStudent = entity('RepairStudent', {
      id: field.id(),
      course: field.nullable(field.ref(CapacityCourse)),
    });
    CapacityCourse.hasMany('students', CapacityStudent, {
      via: 'course',
      constraints: [
        relationConstraint.countAtMost('capacity', {
          code: 'course_full',
          message: 'Course has no available seats.',
        }),
      ],
    });
    const course = createEntityRef(CapacityCourse, { id: 'course-1' });
    const student = createEntityRef(CapacityStudent, { id: 'student-1' });
    const dataset: InMemoryDataset = {
      RepairCourse: [{ id: 'course-1', capacity: 0 }],
      RepairStudent: [{ id: 'student-1', course: 'course-1' }],
    };

    await expect(
      Effect.runPromise(
        executeInMemoryRelationshipCommandEffect(
          dataset,
          [CapacityCourse, CapacityStudent],
          relationship(CapacityCourse, 'students', course).remove(student),
        ),
      ),
    ).resolves.toMatchObject({
      status: 'applied',
      delta: { added: [], removed: [{ target: course }] },
    });
    expect(dataset.RepairStudent).toEqual([{ id: 'student-1', course: null }]);
  });

  it('fails closed when a constrained inverse Relation has no unique target field', async () => {
    const AmbiguousCourse = entity('AmbiguousGuardedCourse', { id: field.id() });
    const AmbiguousStudent = entity('AmbiguousGuardedStudent', {
      id: field.id(),
      primaryCourse: field.nullable(field.ref(AmbiguousCourse)),
      secondaryCourse: field.nullable(field.ref(AmbiguousCourse)),
    });
    AmbiguousCourse.hasMany('students', AmbiguousStudent, {
      constraints: [
        {
          kind: 'participant-selection',
          participant: 'target',
          selection: { kind: 'all' },
          rejection: { version: 1, code: 'guarded', message: 'Guarded.' },
        },
      ],
    });
    const student = createEntityRef(AmbiguousStudent, { id: 'student-1' });
    const course = createEntityRef(AmbiguousCourse, { id: 'course-1' });
    const dataset = {
      AmbiguousGuardedCourse: [{ id: 'course-1' }],
      AmbiguousGuardedStudent: [{ id: 'student-1', primaryCourse: null, secondaryCourse: null }],
    };

    expect(() => relationship(AmbiguousCourse, 'students', course)).toThrow(
      'needs Reference Field evidence',
    );
    const result = await Effect.runPromise(
      executeInMemoryRelationshipCommandEffect(
        dataset,
        [AmbiguousCourse, AmbiguousStudent],
        relationship(AmbiguousStudent, 'primaryCourse', student).assign(course),
      ).pipe(Effect.either),
    );
    expect(result).toMatchObject({
      _tag: 'Left',
      left: { reason: 'invalid_command' },
    });
    expect(dataset.AmbiguousGuardedStudent).toEqual([
      { id: 'student-1', primaryCourse: null, secondaryCourse: null },
    ]);
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
