import {
  createInMemoryDataGraphStorage,
  reaction,
  type DataGraphDefaultStorage,
  type DataGraphExecutionRuntime,
} from '@ontahi/core/data-graph';
import { ontahi } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';

import { classroomEntities, Course } from './classroom.js';

type AnyDataGraphStorage = DataGraphDefaultStorage<DataGraphExecutionRuntime<any, any, any, any>>;

export type CreateClassroomApplicationOptions<TStorage extends AnyDataGraphStorage> = {
  storage: TStorage;
  events?: unknown[];
};

export const createClassroomApplication = <TStorage extends AnyDataGraphStorage>({
  storage,
  events = [],
}: CreateClassroomApplicationOptions<TStorage>) =>
  ontahi({
    storage,
    capabilities: {
      effectors: {
        'emit-event': (intent: { event: unknown }) =>
          Effect.sync(() => {
            events.push(intent.event);
          }),
      },
    },
    entities: classroomEntities,
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

export const classroomEvents: unknown[] = [];

export const ClassroomApplication = createClassroomApplication({
  storage: createInMemoryDataGraphStorage({
    dataset: {
      School: [],
      Teacher: [],
      Course: [],
      Student: [],
      Enrollment: [],
    },
  }),
  events: classroomEvents,
});
