import {
  createInMemoryDataGraphStorage,
  mutateEntity,
  query,
  toGraphCommandRequest,
  toGraphReadRequest,
} from '@ontahi/core/data-graph';
import type { ModelProvider } from '@ontahi/core/runtime/server';
import { describe, expect, it, vi } from 'vitest';

import { createClassroomApplication } from './application.js';
import { Course, School } from './classroom.js';
import { createClassroomModelRuntime } from './model-support.js';

describe('Classroom Model Support activation', () => {
  it('derives read and command dispatch from paired graph affordances', async () => {
    const application = createClassroomApplication({
      storage: createInMemoryDataGraphStorage({
        dataset: {
          School: [{ id: 'school-1', name: 'North School' }],
          Teacher: [{ id: 'teacher-1', name: 'Ada', school: 'school-1' }],
          Course: [
            {
              id: 'course-2',
              title: 'Geometry',
              school: 'school-1',
              teacher: 'teacher-1',
              capacity: 20,
            },
            {
              id: 'course-1',
              title: 'Algebra',
              school: 'school-1',
              teacher: 'teacher-1',
              capacity: 10,
            },
          ],
          Student: [],
          Enrollment: [],
        },
      }),
    });
    const proposals = [
      {
        status: 'resolved' as const,
        request: toGraphReadRequest(
          query(Course)
            .orderBy(course => course.title)
            .limit(20),
          'run',
        ),
      },
      {
        status: 'resolved' as const,
        request: toGraphReadRequest(query(Course), 'count'),
      },
      {
        status: 'resolved' as const,
        request: toGraphCommandRequest(
          mutateEntity(School).create({ id: 'school-2', name: 'South School' }),
        ),
      },
      {
        status: 'application' as const,
        application: {
          kind: 'graph-command-application' as const,
          request: {
            version: 3 as const,
            kind: 'graph-command' as const,
            command: {
              kind: 'entity-mutation-command' as const,
              action: 'update' as const,
              entityName: 'Course',
              target: {
                kind: 'selection' as const,
                entityName: 'Course',
                expression: {
                  kind: 'predicate' as const,
                  fieldName: 'school',
                  operator: 'eq' as const,
                  value: { kind: 'hole' as const, id: 'school' },
                },
              },
              values: { capacity: 30 },
            },
          },
        },
        bindings: { school: { kind: 'entity-match' as const, text: 'North School' } },
      },
    ];
    const generate = vi.fn<ModelProvider['generate']>(async ({ context }) => {
      const catalog = JSON.parse(context) as {
        reads: unknown[];
        commands: unknown[];
        context?: unknown;
      };
      expect(catalog.reads).toHaveLength(3);
      expect(catalog.commands).toHaveLength(3);
      expect(catalog.context).toBeUndefined();
      return proposals.shift();
    });
    const runtime = createClassroomModelRuntime({ application, provider: { generate } });
    const signal = new AbortController().signal;

    await expect(runtime.submit({ text: 'list courses' }, signal)).resolves.toMatchObject({
      status: 'executed',
      message: '2 course records.',
      response: {
        value: [
          { id: 'course-1', title: 'Algebra' },
          { id: 'course-2', title: 'Geometry' },
        ],
      },
    });
    await expect(runtime.submit({ text: 'count courses' }, signal)).resolves.toMatchObject({
      status: 'executed',
      message: '2 course records.',
      response: { value: 2 },
    });
    await expect(runtime.submit({ text: 'create South School' }, signal)).resolves.toMatchObject({
      status: 'executed',
      message: 'School created.',
    });
    expect(application.storage.dataset.School).toEqual([
      { id: 'school-1', name: 'North School' },
      { id: 'school-2', name: 'South School' },
    ]);
    await expect(
      runtime.submit({ text: 'set every course at North School capacity to 30' }, signal),
    ).resolves.toMatchObject({ status: 'executed', message: 'Course updated.' });
    expect(application.storage.dataset.Course?.map(course => course.capacity)).toEqual([30, 30]);
    expect(generate).toHaveBeenCalledTimes(4);
  });
});
