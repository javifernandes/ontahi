import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  createEntityRef,
  field,
  graphSchema,
  reaction,
  type InMemoryDataset,
} from '../../../data-graph/index.js';
import { entity, event, layer, ontahi, relation } from '../index.js';

import {
  createEventApplication,
  createInMemoryEventRuntime,
  isEventEmission,
  type EventDeliveryFor,
  type EventEmission,
  type EventOccurrenceFor,
} from './index.js';

const CourseFields = { id: field.id() };
const CourseRef = entity.ref('EventCourse', { fields: CourseFields });
const Student = entity({
  name: 'EventStudent',
  fields: { id: field.id(), course: field.nullable(field.ref(CourseRef)) },
});
const Course = entity({
  name: 'EventCourse',
  fields: CourseFields,
  relations: () => ({ students: relation.inverse(Student.fields.course) }),
});

const StudentCourseAssigned = event.define({
  id: 'StudentCourseAssigned',
  version: 1,
  description: 'A student was assigned to a course.',
  payload: graphSchema.object({
    student: graphSchema.ref(Student),
    course: graphSchema.ref(Course),
  }),
});
const studentRef = (id: string) => createEntityRef(Student, { id });
const courseRef = (id: string) => createEntityRef(Course, { id });

describe('first-class Events', () => {
  it('rejects invalid declarations and recognizes only canonical JSON-safe emissions', () => {
    const define = (overrides: Partial<Parameters<typeof event.define>[0]> = {}) =>
      event.define({
        id: 'ValidationEvent',
        version: 1,
        description: 'Validation fixture.',
        payload: graphSchema.object({ value: graphSchema.string() }),
        ...overrides,
      } as Parameters<typeof event.define>[0]);

    expect(() => define({ id: '' })).toThrow('non-empty id');
    expect(() => define({ version: 0 })).toThrow('positive integer');
    expect(() => define({ description: '' })).toThrow('non-empty description');
    expect(isEventEmission(StudentCourseAssigned.emit({
      student: studentRef('student-1'),
      course: courseRef('course-1'),
    }))).toBe(true);
    expect(isEventEmission(null)).toBe(false);
    expect(isEventEmission({ kind: 'event-emission', eventId: 'x', eventVersion: 1 })).toBe(false);
    expect(
      isEventEmission({
        kind: 'event-emission',
        eventId: 'x',
        eventVersion: 1,
        payload: Number.NaN,
      }),
    ).toBe(false);
  });

  it('validates runtime bounds and releases capacity after a subscriber timeout', async () => {
    expect(() => createInMemoryEventRuntime({ capacity: 0 })).toThrow('positive integer');
    expect(() => createInMemoryEventRuntime({ deliveryTimeoutMs: 0 })).toThrow('must be positive');

    vi.useFakeTimers();
    try {
      const subscriberFailure = vi.fn();
      const runtime = createInMemoryEventRuntime({
        capacity: 1,
        deliveryTimeoutMs: 10,
        createId: (() => {
          let sequence = 0;
          return () => `bounded-${++sequence}`;
        })(),
        onSubscriberError: cause => {
          subscriberFailure(cause);
          throw new Error('diagnostic reporter failed');
        },
      });
      const subscription = runtime.subscribe('StudentCourseAssigned', () => new Promise(() => {}));
      const emission = StudentCourseAssigned.emit({
        student: studentRef('student-1'),
        course: courseRef('course-1'),
      });
      const first = runtime.accept(emission);
      await Promise.resolve();
      await expect(runtime.accept(emission)).rejects.toThrow('capacity exceeded');
      await vi.advanceTimersByTimeAsync(10);
      await expect(first).resolves.toMatchObject({ eventId: 'StudentCourseAssigned' });
      expect(subscriberFailure).toHaveBeenCalledOnce();

      subscription.cancel();
      subscription.cancel();
      await expect(runtime.accept(emission)).resolves.toMatchObject({
        eventId: 'StudentCourseAssigned',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects duplicate, unknown, and foreign declarations while preserving explicit provenance', async () => {
    const runtime = createInMemoryEventRuntime();
    expect(() =>
      createEventApplication({
        declarations: [StudentCourseAssigned, StudentCourseAssigned],
        runtime,
      }),
    ).toThrow('declared more than once');

    const events = createEventApplication({ declarations: [StudentCourseAssigned], runtime });
    const emission = StudentCourseAssigned.emit({
      student: studentRef('student-1'),
      course: courseRef('course-1'),
    });
    await expect(events.publish({ ...emission, eventId: 'Unknown' })).rejects.toThrow(
      'Unknown Event',
    );
    expect(() =>
      events.api.subscribe({ ...StudentCourseAssigned } as typeof StudentCourseAssigned, () => {}),
    ).toThrow('not registered');

    const explicit = { kind: 'operation' as const, scope: 'explicit' };
    const occurrence = await events.publish({
      ...emission,
      causation: explicit,
      correlation: { trace: 'trace-1' },
    }, { kind: 'operation', scope: 'fallback' });
    expect(occurrence).toMatchObject({
      causation: explicit,
      correlation: { trace: 'trace-1' },
    });
  });

  it('infers typed JSON-safe emissions and validates forged payloads and versions', async () => {
    const emission = StudentCourseAssigned.emit({
      student: studentRef('student-1'),
      course: courseRef('course-1'),
    });

    expectTypeOf(emission).toMatchTypeOf<
      EventEmission<'StudentCourseAssigned', 1>
    >();
    expect(emission).toEqual({
      kind: 'event-emission',
      eventId: 'StudentCourseAssigned',
      eventVersion: 1,
      payload: {
        student: studentRef('student-1'),
        course: courseRef('course-1'),
      },
    });

    if (false) {
      // @ts-expect-error Event payloads retain their declaration's inferred Ref types.
      StudentCourseAssigned.emit({ student: courseRef('course-1'), course: courseRef('c') });
    }

    const events = createEventApplication({
      declarations: [StudentCourseAssigned],
      runtime: createInMemoryEventRuntime(),
    });
    await expect(
      events.publish({ ...emission, eventVersion: 2 } as EventEmission),
    ).rejects.toThrow('requires version 1');
    await expect(
      events.publish({
        ...emission,
        payload: { student: studentRef('student-1'), course: { invalid: true } },
      } as EventEmission),
    ).rejects.toThrow('Invalid payload');
    expect(() =>
      StudentCourseAssigned.emit({
        student: studentRef('student-1'),
        course: { ...courseRef('course-1'), locator: { id: Number.NaN } },
      } as never),
    ).toThrow('JSON-safe');
  });

  it('materializes one occurrence after commit, fans out with delivery identities, and cancels', async () => {
    const order: string[] = [];
    const dataset: InMemoryDataset = {
      EventCourse: [{ id: 'course-1' }],
      EventStudent: [
        { id: 'student-1', course: null },
        { id: 'student-2', course: null },
      ],
    };
    const baseStorage = createInMemoryDataGraphStorage({ dataset });
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
            order.push('begin');
            return work(baseStorage.createRuntime()).pipe(
              Effect.tap(() => Effect.sync(() => order.push('commit'))),
            );
          },
        });
      },
    };
    const subscriberFailure = vi.fn();
    const application = ontahi({
      storage,
      entities: [Course, Student],
      events: [StudentCourseAssigned],
      eventRuntime: createInMemoryEventRuntime({
        createId: (() => {
          let sequence = 0;
          return () => `event-id-${++sequence}`;
        })(),
        now: () => new Date('2026-10-12T00:00:00.000Z'),
        onSubscriberError: subscriberFailure,
      }),
      reactions: [
        reaction
          .relationship(Course, 'students')
          .added({ id: 'student-course-assigned', delivery: 'inline' })
          .emit(StudentCourseAssigned, outcome => ({
            student: outcome.command.source,
            course: outcome.command.target!,
          })),
      ],
    });
    expect(application.events.capabilities).toEqual({
      liveSubscription: true,
      retention: false,
      replay: false,
      durableAcceptance: false,
      durableDelivery: false,
      acknowledgement: false,
      ordering: 'acceptance',
      deduplication: false,
      atomicPublication: false,
      overflowBehavior: 'reject',
    });
    expect(application.events.declarations()).toEqual([
      expect.objectContaining({
        id: 'StudentCourseAssigned',
        version: 1,
        description: 'A student was assigned to a course.',
      }),
    ]);

    const failedDeliveries: EventDeliveryFor<typeof StudentCourseAssigned>[] = [];
    const successfulDeliveries: EventDeliveryFor<typeof StudentCourseAssigned>[] = [];
    application.events.subscribe(StudentCourseAssigned, delivery => {
      failedDeliveries.push(delivery);
      throw new Error('subscriber unavailable');
    });
    const cancellable = application.events.subscribe(StudentCourseAssigned, delivery => {
      order.push('delivered');
      successfulDeliveries.push(delivery);
    });
    const assign = (studentId: string) =>
      layer(`tests.events.assign.${studentId}`, {
        concerns: [application.app.graph.withRuntime()],
      }).effect('assign', () =>
        application.app.graph.transaction(
          application.graph.entities.EventCourse.refById('course-1')
            .students.add(application.graph.entities.EventStudent.refById(studentId))
            .run(),
        ),
      )();

    const result = await assign('student-1');

    expect(order).toEqual(['begin', 'commit', 'delivered']);
    expect(subscriberFailure).toHaveBeenCalledOnce();
    expect(successfulDeliveries).toHaveLength(1);
    expect(failedDeliveries).toHaveLength(1);
    expect(successfulDeliveries[0]?.occurrence.occurrenceId).toBe(
      failedDeliveries[0]?.occurrence.occurrenceId,
    );
    expect(successfulDeliveries[0]?.deliveryId).not.toBe(failedDeliveries[0]?.deliveryId);
    expect(result).toMatchObject({
      status: 'applied',
      reactions: [
        {
          status: 'emitted',
          occurrence: {
            eventId: 'StudentCourseAssigned',
            eventVersion: 1,
            causation: { kind: 'mutation-outcome' },
          },
        },
      ],
    });
    expectTypeOf(successfulDeliveries[0]!.occurrence).toEqualTypeOf<
      EventOccurrenceFor<typeof StudentCourseAssigned>
    >();

    cancellable.cancel();
    await assign('student-2');
    expect(successfulDeliveries).toHaveLength(1);
    expect(failedDeliveries).toHaveLength(2);
  });

  it('interprets canonical Operation Effect Intents without an application effector', async () => {
    const application = ontahi({
      storage: createInMemoryDataGraphStorage(),
      entities: [Course, Student],
      events: [StudentCourseAssigned],
    });
    const deliveries: EventDeliveryFor<typeof StudentCourseAssigned>[] = [];
    application.events.subscribe(StudentCourseAssigned, delivery => {
      deliveries.push(delivery);
    });

    await application.app.effects.execute([
      event(StudentCourseAssigned, {
        student: studentRef('student-1'),
        course: courseRef('course-1'),
      }),
    ]);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.occurrence).toMatchObject({
      eventId: 'StudentCourseAssigned',
      causation: { kind: 'operation', scope: 'runtime.intent' },
    });
  });

  it('does not emit for rejected or rolled-back mutations', async () => {
    const dataset: InMemoryDataset = {
      EventCourse: [{ id: 'course-1' }],
      EventStudent: [{ id: 'student-1', course: null }],
    };
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset }),
      entities: [Course, Student],
      events: [StudentCourseAssigned],
      reactions: [
        reaction
          .relationship(Course, 'students')
          .added({ id: 'student-course-assigned', delivery: 'inline' })
          .emit(StudentCourseAssigned, outcome => ({
            student: outcome.command.source,
            course: outcome.command.target!,
          })),
      ],
    });
    const deliveries: EventDeliveryFor<typeof StudentCourseAssigned>[] = [];
    application.events.subscribe(StudentCourseAssigned, delivery => {
      deliveries.push(delivery);
    });
    const run = <TValue, TError>(effect: Effect.Effect<TValue, TError>) =>
      layer('tests.events.transaction', {
        concerns: [application.app.graph.withRuntime()],
      }).effect('run', () => effect)();

    await expect(
      run(
        application.app.graph.transaction(
          Effect.gen(function* () {
            yield* application.graph.entities.EventCourse.refById('course-1')
              .students.add(application.graph.entities.EventStudent.refById('student-1'))
              .run();
            return yield* Effect.fail(new Error('rollback'));
          }),
        ),
      ),
    ).rejects.toThrow('rollback');
    expect(deliveries).toEqual([]);

    await expect(
      run(
        application.app.graph.transaction(
          application.graph.entities.EventCourse.refById('course-1')
            .students.add(application.graph.entities.EventStudent.refById('missing'))
            .run(),
        ),
      ),
    ).rejects.toMatchObject({ reason: 'cardinality_mismatch' });
    expect(deliveries).toEqual([]);
  });
});
