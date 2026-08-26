import { field, graphSchema } from '@ontahi/core/data-graph';
import { entity, relation } from '@ontahi/core/entity';
import { failOperation } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';

const entityDefaults = {
  authority: 'server',
  exposure: 'server-only',
  layer: 'classroom',
} as const;

const enrollmentFields = [
  'id',
  'student',
  'course',
  'status',
  'startedAt',
  'endedAt',
  'credits',
] as const;

export const School = entity({
  name: 'School',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
  },
});

export const Teacher = entity({
  name: 'Teacher',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
    school: field.ref(School),
  },
});

const CourseFields = {
  id: field.id(),
  title: field.nonEmptyString({ trim: true }),
  school: field.ref(School),
  teacher: field.ref(Teacher),
  availableSeats: field.nonNegativeInteger(),
};
const CourseRef = entity.ref('Course', { fields: CourseFields });

const StudentFields = {
  id: field.id(),
  name: field.nonEmptyString({ trim: true }),
  school: field.ref(School),
  currentCourse: field.nullable(field.ref(CourseRef)),
};
const StudentRef = entity.ref('Student', { fields: StudentFields });

const EnrollmentFields = {
  id: field.id(),
  student: field.ref(StudentRef),
  course: field.ref(CourseRef),
  status: field.enum(['pending', 'active', 'cancelled'] as const),
  startedAt: field.datetime(),
  endedAt: field.nullable(field.datetime()),
  credits: field.positiveInteger(),
};
const EnrollmentRef = entity.ref('Enrollment', { fields: EnrollmentFields });

export const Course = entity({
  name: 'Course',
  fields: CourseFields,
  relations: {
    students: relation.hasMany(StudentRef, { via: 'currentCourse' }),
    enrollments: relation.hasMany(EnrollmentRef, { via: 'course' }),
  },
});

export const Student = entity({
  name: 'Student',
  fields: StudentFields,
  domainOperationDefaults: entityDefaults,
  uses: {
    entities: { Course },
  },
  operations: ({ self, operation, app, entities }) => {
    const students = app.graph.defineEntity(self);

    return {
      transfer: operation({
        input: graphSchema.object({
          student: field.ref(self),
          previousCourse: field.ref(Course),
          nextCourse: field.ref(Course),
        }),
        run: ({ student, previousCourse, nextCourse }) =>
          app.graph
            .transaction(
              Effect.gen(function* () {
                const currentStudent = yield* student.resolve();
                const currentPreviousCourse = yield* previousCourse.resolve();
                const currentNextCourse = yield* nextCourse.resolve();

                if (!currentStudent) {
                  return yield* failOperation('student_not_found', 'Student does not exist.', {
                    student,
                  });
                }
                if (!currentPreviousCourse) {
                  return yield* failOperation(
                    'course_not_found',
                    'Previous Course does not exist.',
                    { course: previousCourse },
                  );
                }
                if (!currentNextCourse) {
                  return yield* failOperation('course_not_found', 'Next Course does not exist.', {
                    course: nextCourse,
                  });
                }
                if (currentNextCourse.availableSeats === 0) {
                  return yield* failOperation(
                    'course_full',
                    'Next Course has no available seats.',
                    { course: nextCourse },
                  );
                }

                const relationship = yield* students
                  .refById(currentStudent.id)
                  .currentCourse.assign(Course.refById(currentNextCourse.id), {
                    ifCurrent: Course.refById(currentPreviousCourse.id),
                    onMismatch: 'skip',
                  })
                  .run()
                  .pipe(Effect.orDie);

                if (relationship.status === 'not-applied') {
                  return yield* failOperation(
                    'student_course_changed',
                    'Student is no longer assigned to the expected Course.',
                    { student, expectedCourse: previousCourse },
                  );
                }

                const [releasedPreviousCourse] = yield* entities.Course.selection(course =>
                  course.id.eq(currentPreviousCourse.id),
                )
                  .and(course => course.availableSeats.eq(currentPreviousCourse.availableSeats))
                  .updateReturning({ availableSeats: currentPreviousCourse.availableSeats + 1 }, [
                    'id',
                    'availableSeats',
                  ])
                  .run()
                  .pipe(Effect.orDie);
                if (!releasedPreviousCourse) {
                  return yield* failOperation(
                    'course_capacity_changed',
                    'Previous Course capacity changed during transfer.',
                    { course: previousCourse },
                  );
                }

                const [reservedNextCourse] = yield* entities.Course.selection(course =>
                  course.id.eq(currentNextCourse.id),
                )
                  .and(course => course.availableSeats.eq(currentNextCourse.availableSeats))
                  .updateReturning({ availableSeats: currentNextCourse.availableSeats - 1 }, [
                    'id',
                    'availableSeats',
                  ])
                  .run()
                  .pipe(Effect.orDie);
                if (!reservedNextCourse) {
                  return yield* failOperation(
                    'course_capacity_changed',
                    'Next Course capacity changed during transfer.',
                    { course: nextCourse },
                  );
                }

                return {
                  relationship,
                  previousCourse: releasedPreviousCourse,
                  nextCourse: reservedNextCourse,
                };
              }),
            )
            .pipe(
              Effect.catchTag('DataGraphTransactionUnavailableError', () =>
                failOperation(
                  'transaction_unavailable',
                  'Student transfer requires transactional Data Graph storage.',
                ),
              ),
            ),
      }),
    };
  },
});

export const Enrollment = entity({
  name: 'Enrollment',
  fields: EnrollmentFields,
  domainOperationDefaults: entityDefaults,
  operations: ({ self, commands, operation }) => ({
    enroll: operation({
      input: graphSchema
        .pick(self, ['id', 'student', 'course', 'startedAt', 'credits'])
        .named('EnrollStudentInput'),
      output: self,
      run: input =>
        commands.insertReturning(
          {
            ...input,
            status: 'pending',
            endedAt: null,
          },
          enrollmentFields,
        ),
    }),
    activate: operation({
      input: graphSchema.object({ enrollment: field.ref(self) }),
      output: self,
      run: ({ enrollment }) =>
        Effect.gen(function* () {
          const current = yield* enrollment.resolve();

          if (!current) {
            return yield* failOperation('enrollment_not_found', 'Enrollment does not exist.', {
              enrollment,
            });
          }
          if (current.status !== 'pending') {
            return yield* failOperation(
              'enrollment_not_pending',
              'Only a pending Enrollment can be activated.',
              { enrollment, status: current.status },
            );
          }

          const [activated] = yield* commands
            .where(candidate => candidate.id.eq(current.id))
            .updateReturning({ status: 'active' }, enrollmentFields)
            .run();

          if (!activated) {
            return yield* failOperation('enrollment_not_found', 'Enrollment does not exist.', {
              enrollment,
            });
          }
          return activated;
        }),
    }),
    cancel: operation({
      input: graphSchema.object({
        enrollment: field.ref(self),
        endedAt: self.fields.endedAt,
      }),
      output: self,
      run: ({ enrollment, endedAt }) =>
        Effect.gen(function* () {
          const current = yield* enrollment.resolve();

          if (!current) {
            return yield* failOperation('enrollment_not_found', 'Enrollment does not exist.', {
              enrollment,
            });
          }
          if (current.status === 'cancelled') {
            return yield* failOperation(
              'enrollment_already_cancelled',
              'Enrollment is already cancelled.',
              { enrollment },
            );
          }

          const [cancelled] = yield* commands
            .where(candidate => candidate.id.eq(current.id))
            .updateReturning({ status: 'cancelled', endedAt }, enrollmentFields)
            .run();

          if (!cancelled) {
            return yield* failOperation('enrollment_not_found', 'Enrollment does not exist.', {
              enrollment,
            });
          }
          return cancelled;
        }),
    }),
  }),
});

export type StudentRemovedFromCourse = {
  type: 'StudentRemovedFromCourse';
  student: ReturnType<typeof Student.refById>;
  course: ReturnType<typeof Course.refById>;
};

export const classroomEntities = [School, Teacher, Course, Student, Enrollment] as const;
