import { readFile } from 'node:fs/promises';

import { query, toGraphReadRequest, type GraphReadPolicy } from '@ontahi/core/data-graph';
import { createPostgresDataGraphStorage } from '@ontahi/postgres/data-graph';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createClassroomApplication } from './application.js';
import { Course, Student } from './classroom.js';

const connectionString =
  process.env.CLASSROOM_POSTGRES_TEST_URL ?? process.env.ONTAHI_POSTGRES_TEST_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('Classroom PostgreSQL-backed transfer', () => {
  const pool = new Pool({ connectionString });
  const application = createClassroomApplication({
    storage: createPostgresDataGraphStorage({ pool }),
  });
  const classroom = application.graph.entities;

  beforeAll(async () => {
    await pool.query(
      'DROP TABLE IF EXISTS enrollments, students, courses, teachers, schools CASCADE',
    );
    const initialMigration = await readFile(
      new URL('../migrations/001-create-classroom.sql', import.meta.url),
      'utf8',
    );
    const capacityMigration = await readFile(
      new URL('../migrations/002-derive-course-capacity.sql', import.meta.url),
      'utf8',
    );
    await pool.query(initialMigration);
    await pool.query(`
      INSERT INTO schools (id, name) VALUES ('migration-school', 'Migration School');
      INSERT INTO teachers (id, name, school_id)
      VALUES ('migration-teacher', 'Ada', 'migration-school');
      INSERT INTO courses (id, title, school_id, teacher_id, available_seats)
      VALUES ('migration-course', 'Legacy Course', 'migration-school', 'migration-teacher', 2);
      INSERT INTO students (id, name, school_id, current_course_id)
      VALUES ('migration-student', 'Grace', 'migration-school', 'migration-course');
    `);
    await pool.query(capacityMigration);
    await expect(
      pool.query(`SELECT capacity FROM courses WHERE id = 'migration-course'`),
    ).resolves.toMatchObject({ rows: [{ capacity: 3 }] });
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE enrollments, students, courses, teachers, schools RESTART IDENTITY CASCADE;
       INSERT INTO schools (id, name) VALUES ('school-1', 'North School');
       INSERT INTO teachers (id, name, school_id) VALUES ('teacher-1', 'Ada', 'school-1');
       INSERT INTO courses (id, title, school_id, teacher_id, capacity)
       VALUES
         ('course-1', 'Algebra', 'school-1', 'teacher-1', 1),
         ('course-2', 'Geometry', 'school-1', 'teacher-1', 2);
       INSERT INTO students (id, name, school_id, current_course_id)
       VALUES ('student-1', 'Grace', 'school-1', 'course-1');`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('commits the conditional Relation transition and recomputes virtual capacity Fields', async () => {
    await expect(
      classroom.Student.transfer({
        student: Student.refById('student-1'),
        previousCourse: Course.refById('course-1'),
        nextCourse: Course.refById('course-2'),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        relationship: { status: 'applied' },
      },
    });

    await expect(
      pool.query(
        `SELECT id, current_course_id FROM students WHERE id = 'student-1';
         SELECT id, capacity FROM courses ORDER BY id;`,
      ),
    ).resolves.toMatchObject([
      { rows: [{ id: 'student-1', current_course_id: 'course-2' }] },
      {
        rows: [
          { id: 'course-1', capacity: 1 },
          { id: 'course-2', capacity: 2 },
        ],
      },
    ]);
    await expect(
      application.storage.readEntityData({ entityName: 'Course' }),
    ).resolves.toMatchObject({
      rows: [
        { id: 'course-1', capacity: 1, occupiedSeats: 0, availableSeats: 1 },
        { id: 'course-2', capacity: 2, occupiedSeats: 1, availableSeats: 1 },
      ],
    });
    const CapacityView = classroom.Course.view('ClassroomCourseCapacity', {
      id: true,
      occupiedSeats: true,
      availableSeats: true,
    });
    const courseEntity = CapacityView.entity;
    const capacityPolicy = {
      entity: courseEntity,
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 10,
      scope: 'all',
      fields: {
        id: { select: true, order: true },
        capacity: { select: true },
        occupiedSeats: { select: true },
        availableSeats: { select: true },
      },
      relations: { students: { fields: {} } },
    } satisfies GraphReadPolicy<typeof courseEntity, undefined>;
    const dispatcher = application.createGraphReadDispatcher([capacityPolicy]);
    await expect(
      dispatcher(
        toGraphReadRequest(
          query(courseEntity)
            .as(CapacityView)
            .orderBy(course => course.id),
          'run',
        ),
        { authority: undefined },
      ),
    ).resolves.toEqual({
      kind: 'graph-read-result',
      value: [
        { id: 'course-1', occupiedSeats: 0, availableSeats: 1 },
        { id: 'course-2', occupiedSeats: 1, availableSeats: 1 },
      ],
    });
  });

  it('rejects a full destination before attempting the Relation transition', async () => {
    await pool.query(`UPDATE courses SET capacity = 0 WHERE id = 'course-2'`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION classroom_test_reject_student_update() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Student Relation transition should not be attempted';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER classroom_test_reject_student_update
      BEFORE UPDATE OF current_course_id ON students
      FOR EACH ROW EXECUTE FUNCTION classroom_test_reject_student_update();
    `);

    try {
      await expect(
        classroom.Student.transfer({
          student: Student.refById('student-1'),
          previousCourse: Course.refById('course-1'),
          nextCourse: Course.refById('course-2'),
        }),
      ).resolves.toMatchObject({
        ok: false,
        failure: { reason: 'course_full', course: Course.refById('course-2') },
      });

      await expect(
        pool.query(
          `SELECT id, current_course_id FROM students WHERE id = 'student-1';
           SELECT id, capacity FROM courses ORDER BY id;`,
        ),
      ).resolves.toMatchObject([
        { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
        {
          rows: [
            { id: 'course-1', capacity: 1 },
            { id: 'course-2', capacity: 0 },
          ],
        },
      ]);
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS classroom_test_reject_student_update ON students;
        DROP FUNCTION IF EXISTS classroom_test_reject_student_update();
      `);
    }
  });

  it('rejects a transfer whose previous and next Course are the same', async () => {
    await expect(
      classroom.Student.transfer({
        student: Student.refById('student-1'),
        previousCourse: Course.refById('course-1'),
        nextCourse: Course.refById('course-1'),
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        reason: 'operation_condition_rejected',
        conditionId: 'Student.transfer.pre.differentCourses',
      },
    });

    await expect(
      pool.query(
        `SELECT id, current_course_id FROM students WHERE id = 'student-1';
         SELECT id, capacity FROM courses ORDER BY id;`,
      ),
    ).resolves.toMatchObject([
      { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
      {
        rows: [
          { id: 'course-1', capacity: 1 },
          { id: 'course-2', capacity: 2 },
        ],
      },
    ]);
  });

  it('reports a stale current Course as a domain failure without changing state', async () => {
    await pool.query(`UPDATE courses SET capacity = 2 WHERE id = 'course-1'`);

    await expect(
      classroom.Student.transfer({
        student: Student.refById('student-1'),
        previousCourse: Course.refById('course-2'),
        nextCourse: Course.refById('course-1'),
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        reason: 'student_course_changed',
        student: Student.refById('student-1'),
        expectedCourse: Course.refById('course-2'),
      },
    });

    await expect(
      pool.query(
        `SELECT id, current_course_id FROM students WHERE id = 'student-1';
         SELECT id, capacity FROM courses ORDER BY id;`,
      ),
    ).resolves.toMatchObject([
      { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
      {
        rows: [
          { id: 'course-1', capacity: 2 },
          { id: 'course-2', capacity: 2 },
        ],
      },
    ]);
  });

  it('rolls the transfer back when the relationship mutation fails', async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION classroom_test_reject_transfer() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'rejected transfer';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER classroom_test_reject_transfer
      BEFORE UPDATE OF current_course_id ON students
      FOR EACH ROW EXECUTE FUNCTION classroom_test_reject_transfer();
    `);

    try {
      await expect(
        classroom.Student.transfer({
          student: Student.refById('student-1'),
          previousCourse: Course.refById('course-1'),
          nextCourse: Course.refById('course-2'),
        }),
      ).resolves.toMatchObject({
        ok: false,
        failure: { reason: 'internal_error' },
      });

      await expect(
        pool.query(
          `SELECT id, current_course_id FROM students WHERE id = 'student-1';
           SELECT id, capacity FROM courses ORDER BY id;`,
        ),
      ).resolves.toMatchObject([
        { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
        {
          rows: [
            { id: 'course-1', capacity: 1 },
            { id: 'course-2', capacity: 2 },
          ],
        },
      ]);
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS classroom_test_reject_transfer ON students;
        DROP FUNCTION IF EXISTS classroom_test_reject_transfer();
      `);
    }
  });
});
