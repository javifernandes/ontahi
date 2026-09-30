import type { EntityMutationCommandPolicy, GraphReadPolicy } from '@ontahi/core/data-graph';
import {
  createApplicationModelCommandRuntime,
  type GraphCommandableOntahiApplication,
  type GraphReadableOntahiApplication,
  type ModelProvider,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';

import { Course, School } from './classroom.js';

const courseReadPolicy = {
  entity: Course,
  modes: ['run', 'count'],
  cardinalities: ['many'],
  maxLimit: 20,
  fields: {
    id: { select: true },
    title: { select: true, filter: ['eq'], order: true },
    school: { select: true },
    teacher: { select: true },
    capacity: { select: true },
    occupiedSeats: { select: true },
    availableSeats: { select: true },
  },
  relations: { students: { fields: {} } },
  scope: 'all',
} as const satisfies GraphReadPolicy<typeof Course>;

const schoolMutationPolicy = {
  entity: School,
  scope: 'all',
  actions: {
    create: { fields: ['id', 'name'], result: ['id', 'name'] },
  },
} as const satisfies EntityMutationCommandPolicy<typeof School>;

type ModelApplication = OntahiApplication &
  Partial<GraphReadableOntahiApplication & GraphCommandableOntahiApplication>;

/** A second host proving that Model Support activation is application-shaped, not Todo-shaped. */
export const createClassroomModelRuntime = ({
  application,
  provider,
}: {
  application: ModelApplication;
  provider: ModelProvider;
}) =>
  createApplicationModelCommandRuntime({
    application,
    provider,
    authorize: () => undefined,
    graph: {
      authority: () => undefined,
      reads: [courseReadPolicy],
      commands: [schoolMutationPolicy],
    },
  });
