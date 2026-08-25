import {
  createInMemoryDataGraphStorage,
  field,
  graphSchema,
  reaction,
} from '@ontahi/core/data-graph';
import { entity, relation } from '@ontahi/core/entity';
import { failOperation, ontahi } from '@ontahi/core/runtime/server';
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
};
const CourseRef = entity.ref('Course', { fields: CourseFields });

export const Student = entity({
  name: 'Student',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
    school: field.ref(School),
    currentCourse: field.nullable(field.ref(CourseRef)),
  },
});

export const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    id: field.id(),
    student: field.ref(Student),
    course: field.ref(CourseRef),
    status: field.enum(['pending', 'active', 'cancelled'] as const),
    startedAt: field.datetime(),
    endedAt: field.nullable(field.datetime()),
    credits: field.positiveInteger(),
  },
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

export const Course = entity({
  name: 'Course',
  fields: CourseFields,
  relations: () => ({
    students: relation.inverse(Student.fields.currentCourse),
    enrollments: relation.inverse(Enrollment.fields.course),
  }),
});

export type StudentRemovedFromCourse = {
  type: 'StudentRemovedFromCourse';
  student: ReturnType<typeof Student.refById>;
  course: ReturnType<typeof Course.refById>;
};

export const classroomEvents: unknown[] = [];

export const ClassroomApplication = ontahi({
  storage: createInMemoryDataGraphStorage({
    dataset: {
      School: [],
      Teacher: [],
      Course: [],
      Student: [],
      Enrollment: [],
    },
  }),
  capabilities: {
    effectors: {
      'emit-event': (intent: { event: unknown }) =>
        Effect.sync(() => {
          classroomEvents.push(intent.event);
        }),
    },
  },
  entities: [School, Teacher, Course, Student, Enrollment],
  reactions: () => [
    reaction
      .relationship(Course, 'students')
      .removed({ id: 'course.students.removed', delivery: 'inline' })
      .emit(outcome => ({
        type: 'StudentRemovedFromCourse',
        student: outcome.command.source,
        course: outcome.command.target,
      })),
  ],
});
