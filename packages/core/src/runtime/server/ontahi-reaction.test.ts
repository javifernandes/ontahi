import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  field,
  graphSchema,
  reaction,
  type AppliedRelationshipMutationResult,
  type InMemoryDataGraphError,
  type InMemoryDataset,
} from '../../data-graph/index.js';

import { entity, layer, ontahi, relation } from './index.js';

const defineClassroom = () => {
  const CourseFields = {
    id: field.id(),
    availableSeats: field.integer(),
  };
  const CourseRef = entity.ref('ReactionClassroomCourse', { fields: CourseFields });
  const Student = entity({
    name: 'ReactionClassroomStudent',
    fields: {
      id: field.id(),
      course: field.nullable(field.ref(CourseRef)),
    },
  });
  const Course = entity({
    name: 'ReactionClassroomCourse',
    fields: CourseFields,
    relations: () => ({
      students: relation.inverse(Student.fields.course),
    }),
    operations: ({ operation }) => ({
      recordRemoval: operation({
        input: graphSchema.object({
          studentId: field.string(),
          courseId: field.string(),
        }),
        run: ({ studentId, courseId }) => Effect.succeed({ studentId, courseId, recorded: true }),
      }),
    }),
  });
  return { Course, Student };
};

describe('Ontahi Reaction registration', () => {
  it('runs a registered Classroom unlink Reaction after one applied Relationship Command', async () => {
    const { Course, Student } = defineClassroom();
    const dataset: InMemoryDataset = {
      ReactionClassroomCourse: [{ id: 'course-1', availableSeats: 0 }],
      ReactionClassroomStudent: [{ id: 'student-1', course: 'course-1' }],
    };
    const events: unknown[] = [];
    const baseStorage = createInMemoryDataGraphStorage({ dataset });
    const runRelationshipCommand = vi.fn();
    const storage = {
      ...baseStorage,
      createRuntime: () => {
        const runtime = baseStorage.createRuntime();
        const run = runtime.runRelationshipCommand.bind(runtime);
        runtime.runRelationshipCommand = (command, options) => {
          runRelationshipCommand(command, options);
          return run(command, options);
        };
        return runtime;
      },
    };
    const application = ontahi({
      storage,
      capabilities: {
        effectors: {
          'emit-event': (intent: { event: unknown }) =>
            Effect.sync(() => {
              events.push(intent.event);
            }),
        },
      },
      entities: [Course, Student],
      reactions: () => [
        reaction
          .relationship(Course, 'students')
          .removed({ id: 'course.students.removed', delivery: 'inline' })
          .then(outcome => [
            reaction.intent.invoke('ReactionClassroomCourse.recordRemoval', {
              studentId: outcome.command.source.locator.id,
              courseId: outcome.command.target?.locator.id,
            }),
            reaction.intent.emit({
              type: 'StudentRemovedFromCourse',
              student: outcome.command.source,
              course: outcome.command.target,
            }),
          ]),
      ],
    });
    const command = application.graph.entities.ReactionClassroomCourse.refById(
      'course-1',
    ).students.remove(application.graph.entities.ReactionClassroomStudent.refById('student-1'));
    expectTypeOf(command.run()).toEqualTypeOf<
      Effect.Effect<AppliedRelationshipMutationResult, InMemoryDataGraphError>
    >();
    const removeStudent = layer('tests.classroom.reactions', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('removeStudent', () => command.run());

    const result = await removeStudent();

    expectTypeOf(result.status).toEqualTypeOf<'applied'>();
    expect(runRelationshipCommand).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'applied',
      outcome: {
        mutationKind: 'relationship-command',
        command: {
          action: 'unlink',
          relation: {
            sourceEntityName: 'ReactionClassroomStudent',
            fieldName: 'course',
            targetEntityName: 'ReactionClassroomCourse',
          },
        },
        delta: {
          added: [],
          removed: [
            {
              source: { entityName: 'ReactionClassroomStudent', locator: { id: 'student-1' } },
              target: { entityName: 'ReactionClassroomCourse', locator: { id: 'course-1' } },
            },
          ],
        },
        causality: { depth: 0 },
      },
      reactions: [
        {
          reactionId: 'course.students.removed',
          intentIndex: 0,
          status: 'completed',
          result: {
            ok: true,
            value: { studentId: 'student-1', courseId: 'course-1', recorded: true },
          },
        },
        {
          reactionId: 'course.students.removed',
          intentIndex: 1,
          status: 'emitted',
        },
      ],
    });
    expect(events).toEqual([
      {
        type: 'StudentRemovedFromCourse',
        student: {
          kind: 'entity-ref',
          entityName: 'ReactionClassroomStudent',
          locator: { id: 'student-1' },
        },
        course: {
          kind: 'entity-ref',
          entityName: 'ReactionClassroomCourse',
          locator: { id: 'course-1' },
        },
      },
    ]);
    expect(dataset.ReactionClassroomStudent).toEqual([{ id: 'student-1', course: null }]);

    const removeMissingStudent = layer('tests.classroom.failed-root', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('removeMissingStudent', () =>
      application.graph.entities.ReactionClassroomCourse.refById('course-1')
        .students.remove(
          application.graph.entities.ReactionClassroomStudent.refById('missing-student'),
        )
        .run(),
    );
    await expect(removeMissingStudent()).rejects.toMatchObject({
      _tag: 'InMemoryDataGraphError',
      reason: 'cardinality_mismatch',
    });
    expect(events).toHaveLength(1);
  });

  it('keeps the parent applied when an application Event effector fails', async () => {
    const { Course, Student } = defineClassroom();
    const dataset: InMemoryDataset = {
      ReactionClassroomCourse: [{ id: 'course-1', availableSeats: 0 }],
      ReactionClassroomStudent: [{ id: 'student-1', course: 'course-1' }],
    };
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset }),
      capabilities: {
        effectors: {
          'emit-event': () => Effect.fail(new Error('event transport unavailable')),
        },
      },
      entities: [Course, Student],
      reactions: () => [
        reaction
          .relationship(Course, 'students')
          .removed({ id: 'failed-removal-event', delivery: 'best-effort' })
          .emit({ type: 'StudentRemovedFromCourse' }),
      ],
    });
    const removeStudent = layer('tests.classroom.reaction-failure', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('removeStudent', () =>
      application.graph.entities.ReactionClassroomCourse.refById('course-1')
        .students.remove(application.graph.entities.ReactionClassroomStudent.refById('student-1'))
        .run(),
    );

    const result = await removeStudent();

    expect(result).toMatchObject({
      status: 'applied',
      reactions: [
        {
          reactionId: 'failed-removal-event',
          status: 'failed',
          failure: {
            code: 'follow_up_failed',
            message: 'Post-commit follow-up intent failed.',
          },
        },
      ],
    });
    expect(dataset.ReactionClassroomStudent).toEqual([{ id: 'student-1', course: null }]);
  });

  it('waits for the outer transaction commit before interpreting a Reaction', async () => {
    const { Course, Student } = defineClassroom();
    const order: string[] = [];
    const baseStorage = createInMemoryDataGraphStorage({
      dataset: {
        ReactionClassroomCourse: [{ id: 'course-1', availableSeats: 0 }],
        ReactionClassroomStudent: [{ id: 'student-1', course: 'course-1' }],
      },
    });
    const storage = {
      ...baseStorage,
      createRuntime: () => {
        const parent = baseStorage.createRuntime();
        return Object.assign(parent, {
          transaction: <TResult, TError, TRequirements>(
            work: (
              runtime: ReturnType<typeof baseStorage.createRuntime>,
            ) => Effect.Effect<TResult, TError, TRequirements>,
          ) => {
            const transactionRuntime = baseStorage.createRuntime();
            const run = transactionRuntime.runRelationshipCommand.bind(transactionRuntime);
            transactionRuntime.runRelationshipCommand = (command, options) => {
              order.push('apply');
              return run(command, options);
            };
            order.push('begin');
            return work(transactionRuntime).pipe(
              Effect.tap(() => Effect.sync(() => order.push('commit'))),
            );
          },
        });
      },
    };
    const application = ontahi({
      storage,
      capabilities: {
        effectors: {
          'emit-event': () => Effect.sync(() => order.push('reaction')),
        },
      },
      entities: [Course, Student],
      reactions: () => [
        reaction
          .relationship(Course, 'students')
          .removed({ id: 'after-commit', delivery: 'inline' })
          .emit({ type: 'StudentRemovedFromCourse' }),
      ],
    });
    const transition = layer('tests.classroom.reaction-transaction', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('transition', () =>
      application.app.graph.transaction(
        Effect.gen(function* () {
          const result = yield* application.graph.entities.ReactionClassroomCourse.refById(
            'course-1',
          )
            .students.remove(
              application.graph.entities.ReactionClassroomStudent.refById('student-1'),
            )
            .run();
          expect(order).toEqual(['begin', 'apply']);
          expect(result.reactions).toEqual([]);
          return result;
        }),
      ),
    );

    const result = await transition();

    expect(order).toEqual(['begin', 'apply', 'commit', 'reaction']);
    expect(result.reactions).toMatchObject([{ reactionId: 'after-commit', status: 'emitted' }]);

    order.length = 0;
    const rolledBackTransition = layer('tests.classroom.reaction-rollback', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('transition', () =>
      application.app.graph.transaction(
        Effect.gen(function* () {
          yield* application.graph.entities.ReactionClassroomCourse.refById('course-1')
            .students.remove(
              application.graph.entities.ReactionClassroomStudent.refById('student-1'),
            )
            .run();
          return yield* Effect.fail('rollback');
        }),
      ),
    );

    await expect(rolledBackTransition()).rejects.toThrow('rollback');
    expect(order).toEqual(['begin', 'apply']);
  });

  it('registers a Reaction thunk once and rejects duplicate ids at composition time', async () => {
    const { Course, Student } = defineClassroom();
    const storage = createInMemoryDataGraphStorage({
      dataset: {
        ReactionClassroomCourse: [{ id: 'course-1', availableSeats: 0 }],
        ReactionClassroomStudent: [
          { id: 'student-1', course: 'course-1' },
          { id: 'student-2', course: 'course-1' },
        ],
      },
    });
    let registrations = 0;
    const declaration = reaction
      .relationship(Course, 'students')
      .removed({ id: 'registered-once', delivery: 'inline' })
      .then(() => []);
    const application = ontahi({
      storage,
      entities: [Course, Student],
      reactions: () => {
        registrations += 1;
        return [declaration];
      },
    });
    const removeStudents = layer('tests.classroom.reaction-registration', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('removeStudents', () =>
      Effect.all([
        application.graph.entities.ReactionClassroomCourse.refById('course-1')
          .students.remove(application.graph.entities.ReactionClassroomStudent.refById('student-1'))
          .run(),
        application.graph.entities.ReactionClassroomCourse.refById('course-1')
          .students.remove(application.graph.entities.ReactionClassroomStudent.refById('student-2'))
          .run(),
      ]),
    );

    await removeStudents();

    expect(registrations).toBe(1);
    expect(() =>
      ontahi({
        storage: createInMemoryDataGraphStorage(),
        entities: [Course, Student],
        reactions: [declaration, declaration],
      }),
    ).toThrow('Mutation Reaction ids must be unique.');
  });

  it('observes one bound many-to-many command without reapplying its delta', async () => {
    const Course = entity({
      name: 'ReactionManyCourse',
      fields: { id: field.id() },
    });
    const Club = entity({
      name: 'ReactionClub',
      fields: { id: field.id() },
      relations: { courses: relation.manyToMany(Course) },
    });
    const relationships: NonNullable<
      Parameters<typeof createInMemoryDataGraphStorage>[0]
    >['relationships'] = [];
    const baseStorage = createInMemoryDataGraphStorage({
      dataset: {
        ReactionManyCourse: [{ id: 'course-1' }],
        ReactionClub: [{ id: 'club-1' }],
      },
      relationships,
    });
    const runManyToManyRelationshipCommand = vi.fn();
    const storage = {
      ...baseStorage,
      createRuntime: () => {
        const runtime = baseStorage.createRuntime();
        const run = runtime.runManyToManyRelationshipCommand.bind(runtime);
        runtime.runManyToManyRelationshipCommand = (command, options) => {
          runManyToManyRelationshipCommand(command, options);
          return run(command, options);
        };
        return runtime;
      },
    };
    const application = ontahi({
      storage,
      entities: [Club, Course],
      reactions: [
        reaction
          .relationship(Club, 'courses')
          .added({ id: 'club-course-added', delivery: 'inline' })
          .then(() => []),
      ],
    });
    const addCourse = layer('tests.classroom.reaction-many-to-many', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('addCourse', () =>
      application.graph.entities.ReactionClub.refById('club-1')
        .courses.add(application.graph.entities.ReactionManyCourse.refById('course-1'))
        .run(),
    );

    const result = await addCourse();

    expect(runManyToManyRelationshipCommand).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'applied',
      outcome: {
        command: { kind: 'many-to-many-relationship-command', action: 'link' },
        delta: {
          added: [
            {
              source: { entityName: 'ReactionClub', locator: { id: 'club-1' } },
              target: { entityName: 'ReactionManyCourse', locator: { id: 'course-1' } },
            },
          ],
          removed: [],
        },
      },
    });
    expect(relationships).toHaveLength(1);
  });

  it('interprets direct and many-to-many follow-up Command intents through the active runtime', async () => {
    const Course = entity({
      name: 'ReactionFollowUpCourse',
      fields: { id: field.id() },
    });
    const Student = entity({
      name: 'ReactionFollowUpStudent',
      fields: {
        id: field.id(),
        course: field.nullable(field.ref(Course)),
      },
    });
    const Club = entity({
      name: 'ReactionFollowUpClub',
      fields: { id: field.id() },
      relations: { courses: relation.manyToMany(Course) },
    });
    const relationships: NonNullable<
      Parameters<typeof createInMemoryDataGraphStorage>[0]
    >['relationships'] = [];
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: {
          ReactionFollowUpCourse: [{ id: 'course-1' }, { id: 'course-2' }],
          ReactionFollowUpStudent: [{ id: 'student-1', course: 'course-1' }],
          ReactionFollowUpClub: [{ id: 'club-1' }],
        },
        relationships,
      }),
      entities: [Course, Student, Club],
      reactions: [
        reaction
          .relationship(Student, 'course')
          .removed({ id: 'move-and-record', delivery: 'inline' })
          .then(outcome => [
            reaction.intent.execute(
              Student.refById(outcome.command.source.locator.id as string).course.assign(
                Course.refById('course-2'),
              ),
            ),
            reaction.intent.execute(Club.refById('club-1').courses.add(Course.refById('course-1'))),
          ]),
      ],
    });
    const removeCourse = layer('tests.classroom.reaction-follow-up-command', {
      concerns: [application.app.graph.withRuntime()],
    }).effect('removeCourse', () =>
      application.graph.entities.ReactionFollowUpStudent.refById('student-1').course.clear().run(),
    );

    const result = await removeCourse();

    expect(result.reactions).toMatchObject([
      {
        reactionId: 'move-and-record',
        status: 'applied',
        outcome: { command: { kind: 'relationship-command', action: 'link' } },
      },
      {
        reactionId: 'move-and-record',
        status: 'applied',
        outcome: { command: { kind: 'many-to-many-relationship-command', action: 'link' } },
      },
    ]);
    expect(application.storage.dataset.ReactionFollowUpStudent).toEqual([
      { id: 'student-1', course: 'course-2' },
    ]);
    expect(relationships).toHaveLength(1);
  });
});
