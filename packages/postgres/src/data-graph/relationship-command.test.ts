import {
  createEntityRef,
  entity,
  field,
  relationConstraint,
  relationship,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { executePostgresRelationshipCommand } from './command-runtime.js';

import {
  compilePostgresRelationshipCommand,
  createPostgresDataGraphRuntime,
  materializePostgresRelationshipDelta,
  postgresMapping,
} from './index.js';

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
        precondition_matched: true,
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
        precondition_matched: false,
      }),
    ).toEqual({ preconditionFailed: true });
  });

  it('returns not-applied instead of failing when a stale assignment opts into skip', async () => {
    const student = createEntityRef(Student, { id: 'student-1' });
    const command = relationship(Student, 'course', student).assign(
      createEntityRef(Course, { id: 'course-2' }),
      {
        ifCurrent: createEntityRef(Course, { id: 'course-1' }),
        onMismatch: 'skip',
      },
    );

    await expect(
      Effect.runPromise(
        executePostgresRelationshipCommand({
          command,
          mappings: [studentMapping, courseMapping],
          executeQuery: vi.fn().mockResolvedValue({
            rowCount: 1,
            rows: [
              {
                source_count: 1,
                target_count: 1,
                updated_count: 0,
                old_target: 'course-3',
                precondition_matched: false,
              },
            ],
          }),
        }),
      ),
    ).resolves.toMatchObject({
      status: 'not-applied',
      diagnostic: { reason: 'relationship_precondition_failed' },
    });
  });

  it('compiles inverse-declared participant constraints and materializes their rejection', () => {
    const GuardedCourse = entity('GuardedCourse', { id: field.id(), open: field.boolean() });
    const GuardedStudent = entity('GuardedStudent', {
      id: field.id(),
      active: field.boolean(),
      course: field.nullable(field.ref(GuardedCourse)),
    });
    GuardedCourse.hasMany('students', GuardedStudent, {
      constraints: [
        relationConstraint.source(GuardedCourse, course => course.open.eq(true), {
          code: 'course_closed',
          message: 'Course is closed.',
        }),
        relationConstraint.target(GuardedStudent, student => student.active.eq(true), {
          code: 'student_inactive',
          message: 'Student is inactive.',
          parameters: { requiredStatus: 'active' },
        }),
      ],
    });
    const guardedStudentMapping = postgresMapping({
      entity: GuardedStudent,
      table: 'guarded_students',
      columns: { id: 'id', active: 'is_active', course: 'course_id' },
    });
    const guardedCourseMapping = postgresMapping({
      entity: GuardedCourse,
      table: 'guarded_courses',
      columns: { id: 'id', open: 'is_open' },
    });
    const command = relationship(
      GuardedStudent,
      'course',
      createEntityRef(GuardedStudent, { id: 'student-1' }),
    ).assign(createEntityRef(GuardedCourse, { id: 'course-1' }));
    const compiled = compilePostgresRelationshipCommand(
      command,
      guardedStudentMapping,
      guardedCourseMapping,
    );

    expect(compiled.sql.text).toContain('constraint_rejection');
    expect(compiled.sql.text).toContain('FOR SHARE');
    expect(compiled.sql.values).toContain(true);
    expect(
      materializePostgresRelationshipDelta(command, compiled, {
        source_count: 1,
        target_count: 1,
        updated_count: 0,
        old_target: null,
        precondition_matched: true,
        constraint_rejection: {
          version: 1,
          code: 'student_inactive',
          message: 'Student is inactive.',
          parameters: { requiredStatus: 'active' },
        },
      }),
    ).toEqual({
      constraintRejected: {
        version: 1,
        code: 'student_inactive',
        message: 'Student is inactive.',
        parameters: { requiredStatus: 'active' },
      },
    });
  });

  it('compiles an inverse count constraint into endpoint serialization and prospective state', () => {
    const LimitedCourse = entity('LimitedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
    });
    const LimitedStudent = entity('LimitedStudent', {
      id: field.id(),
      course: field.nullable(field.ref(LimitedCourse)),
    });
    LimitedCourse.hasMany('students', LimitedStudent, {
      via: 'course',
      constraints: [
        relationConstraint.countAtMost('capacity', {
          code: 'course_full',
          message: 'Course has no available seats.',
        }),
      ],
    });
    const limitedCourseMapping = postgresMapping({
      entity: LimitedCourse,
      table: 'limited_courses',
      columns: { id: 'id', capacity: 'capacity' },
    });
    const limitedStudentMapping = postgresMapping({
      entity: LimitedStudent,
      table: 'limited_students',
      columns: { id: 'id', course: 'course_id' },
    });
    const command = relationship(
      LimitedCourse,
      'students',
      createEntityRef(LimitedCourse, { id: 'course-1' }),
    ).add(createEntityRef(LimitedStudent, { id: 'student-1' }));
    const compiled = compilePostgresRelationshipCommand(
      command,
      limitedStudentMapping,
      limitedCourseMapping,
    );

    expect(compiled.serializationLock).toEqual({
      text: 'SELECT 1 FROM "limited_courses" WHERE "id" = $1 FOR UPDATE',
      values: ['course-1'],
    });
    expect(compiled.sql.text).toContain('"capacity" AS "ontahi_relation_count_limit_0"');
    expect(compiled.sql.text).toContain(
      'SELECT COUNT(*)::int FROM "limited_students" AS relation_members WHERE relation_members."course_id" IS NOT DISTINCT FROM',
    );
    expect(compiled.sql.text).toContain('+ 1 <= "ontahi_relation_count_limit_0"');
    expect(compiled.sql.values).toContainEqual({
      version: 1,
      code: 'course_full',
      message: 'Course has no available seats.',
    });
    expect(() =>
      compilePostgresRelationshipCommand(command, limitedStudentMapping, {
        ...limitedCourseMapping,
        columns: { id: 'id' },
      } as never),
    ).toThrow('Relation count constraint Field LimitedCourse.capacity is not mapped');
  });

  it('automatically runs a serialized count constraint through one checked-out transaction', async () => {
    const LimitedCourse = entity('RuntimeLimitedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
    });
    const LimitedStudent = entity('RuntimeLimitedStudent', {
      id: field.id(),
      course: field.nullable(field.ref(LimitedCourse)),
    });
    LimitedCourse.hasMany('students', LimitedStudent, {
      via: 'course',
      constraints: [
        relationConstraint.countAtMost('capacity', {
          code: 'course_full',
          message: 'Course has no available seats.',
        }),
      ],
    });
    const mappings = [
      postgresMapping({
        entity: LimitedCourse,
        table: 'runtime_limited_courses',
        columns: { id: 'id', capacity: 'capacity' },
      }),
      postgresMapping({
        entity: LimitedStudent,
        table: 'runtime_limited_students',
        columns: { id: 'id', course: 'course_id' },
      }),
    ];
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        statements.push(text);
        if (text.startsWith('WITH source_rows')) {
          return {
            rows: [
              {
                source_count: 1,
                target_count: 1,
                updated_count: 1,
                old_target: null,
                precondition_matched: true,
                constraint_rejection: null,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [{ endpoint: 1 }], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(async () => {
        throw new Error('Serialized commands must use a checked-out client.');
      }),
      connect: vi.fn(async () => client),
    };
    const runtime = createPostgresDataGraphRuntime({ pool, mappings });

    const command = relationship(
      LimitedStudent,
      'course',
      createEntityRef(LimitedStudent, { id: 'student-1' }),
    ).assign(createEntityRef(LimitedCourse, { id: 'course-1' }));

    await expect(Effect.runPromise(runtime.runRelationshipCommand(command))).resolves.toMatchObject(
      { status: 'applied' },
    );
    expect(statements[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(statements[1]).toContain('FOR UPDATE');
    expect(statements[2]).toContain('WITH source_rows');
    expect(statements[3]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();

    const query = vi.fn();
    const queryOnlyRuntime = createPostgresDataGraphRuntime({ pool: { query }, mappings });
    await expect(
      Effect.runPromise(queryOnlyRuntime.runRelationshipCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'execution_failed',
        message: expect.stringContaining('requires an authority-serialized transaction'),
      },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed when a constrained inverse Relation has ambiguous target fields', () => {
    const AmbiguousCourse = entity('AmbiguousCourse', { id: field.id() });
    const AmbiguousStudent = entity('AmbiguousStudent', {
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
    const ambiguousStudentMapping = postgresMapping({
      entity: AmbiguousStudent,
      table: 'ambiguous_students',
      columns: {
        id: 'id',
        primaryCourse: 'primary_course_id',
        secondaryCourse: 'secondary_course_id',
      },
    });
    const ambiguousCourseMapping = postgresMapping({
      entity: AmbiguousCourse,
      table: 'ambiguous_courses',
      columns: { id: 'id' },
    });

    expect(() =>
      compilePostgresRelationshipCommand(
        relationship(
          AmbiguousStudent,
          'primaryCourse',
          createEntityRef(AmbiguousStudent, { id: 'student-1' }),
        ).assign(createEntityRef(AmbiguousCourse, { id: 'course-1' })),
        ambiguousStudentMapping,
        ambiguousCourseMapping,
      ),
    ).toThrow('cannot resolve constrained inverse Relation AmbiguousCourse.students');
  });

  it.each([
    {
      name: 'unmapped endpoint',
      mappings: [studentMapping],
      rows: [],
      reason: 'invalid_command',
    },
    {
      name: 'missing state result',
      mappings: [studentMapping, courseMapping],
      rows: [],
      reason: 'invalid_command',
    },
    {
      name: 'unresolved source Ref',
      mappings: [studentMapping, courseMapping],
      rows: [
        {
          source_count: 0,
          target_count: 1,
          updated_count: 0,
          old_target: null,
          precondition_matched: true,
        },
      ],
      reason: 'cardinality_mismatch',
    },
  ])('reports $name through a stable adapter reason', async ({ mappings, rows, reason }) => {
    const command = relationship(
      Student,
      'course',
      createEntityRef(Student, { id: 'student-1' }),
    ).assign(createEntityRef(Course, { id: 'course-1' }));
    const result = await Effect.runPromise(
      executePostgresRelationshipCommand({
        command,
        mappings,
        executeQuery: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
      }).pipe(Effect.either),
    );

    expect(result).toMatchObject({ _tag: 'Left', left: { reason } });
  });

  it('preserves query failures as execution failures', async () => {
    const command = relationship(
      Student,
      'course',
      createEntityRef(Student, { id: 'student-1' }),
    ).assign(createEntityRef(Course, { id: 'course-1' }));
    const result = await Effect.runPromise(
      executePostgresRelationshipCommand({
        command,
        mappings: [studentMapping, courseMapping],
        executeQuery: vi.fn().mockRejectedValue(new Error('connection lost')),
      }).pipe(Effect.either),
    );

    expect(result).toMatchObject({ _tag: 'Left', left: { reason: 'execution_failed' } });
  });
});
