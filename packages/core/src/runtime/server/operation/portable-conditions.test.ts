import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphStorage,
  definePortableOperationConditionRegistry,
  field,
  graphSchema,
  modelExpression,
} from '../../../data-graph/index.js';
import { entity, ontahi } from '../index.js';

describe('portable Domain Operation conditions', () => {
  it('uses generated IR authoritatively without executing the authoring callback', async () => {
    const authoringCallback = vi.fn(() => true);
    const body = vi.fn(() => Effect.void);
    const Course = entity({
      name: 'PortableCourse',
      fields: { id: field.id() },
    });
    const Student = entity({
      name: 'PortableStudent',
      fields: { id: field.id() },
      uses: { entities: { Course } },
      operations: ({ operation }) => ({
        transfer: operation({
          input: graphSchema.object({
            previousCourse: field.ref(Course),
            nextCourse: field.ref(Course),
          }),
          contracts: {
            pre: { differentCourses: authoringCallback },
          },
          run: body,
        }),
      }),
    });
    const operationConditions = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'PortableStudent.transfer': {
          pre: [
            {
              name: 'differentCourses',
              expression: modelExpression.define(
                modelExpression.not(
                  modelExpression.ref('previousCourse').is(modelExpression.ref('nextCourse')),
                ),
              ),
            },
          ],
        },
      },
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: { PortableCourse: [], PortableStudent: [] },
      }),
      entities: [Course, Student],
      operationConditions,
    });
    const algebra = createEntityRef(Course, { id: 'algebra' });
    const geometry = createEntityRef(Course, { id: 'geometry' });

    expect(application.graph.entities.PortableStudent.domain.transfer.conditions).toBe(
      operationConditions.operations['PortableStudent.transfer'],
    );

    await expect(
      application.graph.entities.PortableStudent.transfer({
        previousCourse: algebra,
        nextCourse: algebra,
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        reason: 'operation_condition_rejected',
        conditionId: 'PortableStudent.transfer.pre.differentCourses',
      },
    });
    expect(authoringCallback).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();

    await expect(
      application.graph.entities.PortableStudent.transfer({
        previousCourse: algebra,
        nextCourse: geometry,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(authoringCallback).not.toHaveBeenCalled();
    expect(body).toHaveBeenCalledOnce();
  });

  it('supports the explicit Model Expression builder when no codegen registry exists', async () => {
    const Course = entity({
      name: 'RuntimeOnlyCourse',
      fields: { id: field.id() },
    });
    const Student = entity({
      name: 'RuntimeOnlyStudent',
      fields: { id: field.id() },
      operations: ({ operation }) => ({
        transfer: operation({
          input: graphSchema.object({
            previousCourse: field.ref(Course),
            nextCourse: field.ref(Course),
          }),
          contracts: {
            pre: {
              differentCourses: modelExpression.condition(
                modelExpression.define(
                  modelExpression.not(
                    modelExpression.ref('previousCourse').is(modelExpression.ref('nextCourse')),
                  ),
                ),
              ),
            },
          },
          run: () => Effect.void,
        }),
      }),
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: { RuntimeOnlyCourse: [], RuntimeOnlyStudent: [] },
      }),
      entities: [Course, Student],
    });
    const algebra = createEntityRef(Course, { id: 'algebra' });

    await expect(
      application.graph.entities.RuntimeOnlyStudent.transfer({
        previousCourse: algebra,
        nextCourse: algebra,
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: {
        reason: 'operation_condition_rejected',
        conditionId: 'RuntimeOnlyStudent.transfer.pre.differentCourses',
      },
    });
  });
});
