CREATE TABLE schools (
  id text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE teachers (
  id text PRIMARY KEY,
  name text NOT NULL,
  school_id text NOT NULL REFERENCES schools(id)
);

CREATE TABLE courses (
  id text PRIMARY KEY,
  title text NOT NULL,
  school_id text NOT NULL REFERENCES schools(id),
  teacher_id text NOT NULL REFERENCES teachers(id),
  available_seats integer NOT NULL CHECK (available_seats >= 0)
);

CREATE TABLE students (
  id text PRIMARY KEY,
  name text NOT NULL,
  school_id text NOT NULL REFERENCES schools(id),
  current_course_id text REFERENCES courses(id)
);

CREATE TABLE enrollments (
  id text PRIMARY KEY,
  student_id text NOT NULL REFERENCES students(id),
  course_id text NOT NULL REFERENCES courses(id),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'cancelled')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  credits integer NOT NULL CHECK (credits > 0)
);
