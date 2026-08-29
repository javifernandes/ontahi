import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  definePortableDerivedFieldRegistry,
  field,
  modelExpression,
} from '../../data-graph/index.js';

import { entity, ontahi } from './index.js';

describe('portable derived Fields at application binding', () => {
  it('binds generated Model Expressions without executing the authoring callback', () => {
    const authoring = vi.fn(({ capacity }: Record<string, any>) => capacity as number);
    const Course = entity({
      name: 'PortableDerivedCourse',
      fields: {
        id: field.id(),
        capacity: field.nonNegativeInteger(),
        availableSeats: field.derived(field.nonNegativeInteger(), authoring),
      },
    });
    const derivedFields = definePortableDerivedFieldRegistry({
      version: 1,
      entities: {
        PortableDerivedCourse: {
          fields: {
            availableSeats: modelExpression.define(modelExpression.field('capacity')),
          },
        },
      },
    });
    const storage = createInMemoryDataGraphStorage({
      dataset: { PortableDerivedCourse: [{ id: 'course-1', capacity: 3 }] },
    });

    ontahi({ storage, entities: [Course], derivedFields });

    expect(authoring).not.toHaveBeenCalled();
    expect(Course.fields.availableSeats.derived).toEqual({
      expression: derivedFields.entities.PortableDerivedCourse!.fields.availableSeats,
      dependencies: [{ kind: 'field', field: 'capacity' }],
    });
  });
});
