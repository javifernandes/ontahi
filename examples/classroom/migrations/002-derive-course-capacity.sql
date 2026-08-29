BEGIN;

ALTER TABLE courses ADD COLUMN capacity integer;

UPDATE courses AS course
SET capacity = course.available_seats + (
  SELECT COUNT(*)::integer
  FROM students AS student
  WHERE student.current_course_id = course.id
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM courses AS course
    WHERE course.capacity < (
      SELECT COUNT(*)
      FROM students AS student
      WHERE student.current_course_id = course.id
    )
  ) THEN
    RAISE EXCEPTION 'Cannot derive Course capacity from inconsistent legacy state';
  END IF;
END;
$$;

ALTER TABLE courses ALTER COLUMN capacity SET NOT NULL;
ALTER TABLE courses ADD CONSTRAINT courses_capacity_non_negative CHECK (capacity >= 0);
ALTER TABLE courses DROP COLUMN available_seats;

COMMIT;
