import { readFile } from 'node:fs/promises';

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
    const migration = await readFile(
      new URL('../migrations/001-create-classroom.sql', import.meta.url),
      'utf8',
    );
    await pool.query(migration);
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE enrollments, students, courses, teachers, schools RESTART IDENTITY CASCADE;
       INSERT INTO schools (id, name) VALUES ('school-1', 'North School');
       INSERT INTO teachers (id, name, school_id) VALUES ('teacher-1', 'Ada', 'school-1');
       INSERT INTO courses (id, title, school_id, teacher_id, available_seats)
       VALUES
         ('course-1', 'Algebra', 'school-1', 'teacher-1', 0),
         ('course-2', 'Geometry', 'school-1', 'teacher-1', 2);
       INSERT INTO students (id, name, school_id, current_course_id)
       VALUES ('student-1', 'Grace', 'school-1', 'course-1');`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('commits the conditional Relation transition and both capacity updates', async () => {
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
        previousCourse: { id: 'course-1', availableSeats: 1 },
        nextCourse: { id: 'course-2', availableSeats: 1 },
      },
    });

    await expect(
      pool.query(
        `SELECT id, current_course_id FROM students WHERE id = 'student-1';
         SELECT id, available_seats FROM courses ORDER BY id;`,
      ),
    ).resolves.toMatchObject([
      { rows: [{ id: 'student-1', current_course_id: 'course-2' }] },
      {
        rows: [
          { id: 'course-1', available_seats: 1 },
          { id: 'course-2', available_seats: 1 },
        ],
      },
    ]);
  });

  it('rejects a full destination before attempting the Relation transition', async () => {
    await pool.query(`UPDATE courses SET available_seats = 0 WHERE id = 'course-2'`);
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
           SELECT id, available_seats FROM courses ORDER BY id;`,
        ),
      ).resolves.toMatchObject([
        { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
        {
          rows: [
            { id: 'course-1', available_seats: 0 },
            { id: 'course-2', available_seats: 0 },
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

  it('reports a stale current Course as a domain failure without changing state', async () => {
    await expect(
      classroom.Student.transfer({
        student: Student.refById('student-1'),
        previousCourse: Course.refById('course-2'),
        nextCourse: Course.refById('course-2'),
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
         SELECT id, available_seats FROM courses ORDER BY id;`,
      ),
    ).resolves.toMatchObject([
      { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
      {
        rows: [
          { id: 'course-1', available_seats: 0 },
          { id: 'course-2', available_seats: 2 },
        ],
      },
    ]);
  });

  it('rolls the complete transfer back when capacity changes after it was read', async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION classroom_test_change_capacity() RETURNS trigger AS $$
      BEGIN
        UPDATE courses
        SET available_seats = available_seats - 1
        WHERE id = NEW.current_course_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER classroom_test_change_capacity
      AFTER UPDATE OF current_course_id ON students
      FOR EACH ROW EXECUTE FUNCTION classroom_test_change_capacity();
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
        failure: {
          reason: 'course_capacity_changed',
          course: Course.refById('course-2'),
        },
      });

      await expect(
        pool.query(
          `SELECT id, current_course_id FROM students WHERE id = 'student-1';
           SELECT id, available_seats FROM courses ORDER BY id;`,
        ),
      ).resolves.toMatchObject([
        { rows: [{ id: 'student-1', current_course_id: 'course-1' }] },
        {
          rows: [
            { id: 'course-1', available_seats: 0 },
            { id: 'course-2', available_seats: 2 },
          ],
        },
      ]);
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS classroom_test_change_capacity ON students;
        DROP FUNCTION IF EXISTS classroom_test_change_capacity();
      `);
    }
  });
});
