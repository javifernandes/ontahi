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
        request: toGraphCommandRequest(
          mutateEntity(School).create({ id: 'school-2', name: 'South School' }),
        ),
      },
    ];
    const generate = vi.fn<ModelProvider['generate']>(async ({ context }) => {
      const catalog = JSON.parse(context) as {
        reads: unknown[];
        commands: unknown[];
        context?: unknown;
      };
      expect(catalog.reads).toHaveLength(1);
      expect(catalog.commands).toHaveLength(1);
      expect(catalog.context).toBeUndefined();
      return proposals.shift();
    });
    const runtime = createClassroomModelRuntime({ application, provider: { generate } });
    const signal = new AbortController().signal;

    await expect(runtime.submit({ text: 'list courses' }, signal)).resolves.toMatchObject({
      status: 'executed',
      message: '2 courses.',
      response: {
        value: [
          { id: 'course-1', title: 'Algebra' },
          { id: 'course-2', title: 'Geometry' },
        ],
      },
    });
    await expect(runtime.submit({ text: 'create South School' }, signal)).resolves.toMatchObject({
      status: 'executed',
      message: 'School created.',
    });
    expect(application.storage.dataset.School).toEqual([
      { id: 'school-1', name: 'North School' },
      { id: 'school-2', name: 'South School' },
    ]);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
