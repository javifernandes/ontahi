import { entity, field, modelExpression, query } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { selectColumnsForQuery } from './materialization.js';

describe('Supabase graph materialization', () => {
  it('fails explicitly when a read requests an unsupported derived Field', () => {
    const Course = entity('SupabaseCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(modelExpression.field('capacity')),
      ),
    });

    expect(() => selectColumnsForQuery({ entityDefinition: Course })).toThrow(
      'Supabase graph reads do not support derived Field SupabaseCourse.availableSeats.',
    );
    expect(
      selectColumnsForQuery({
        entityDefinition: Course,
        selectShape: query(Course)
          .select(course => ({ id: course.id }))
          .build().select,
      }),
    ).toEqual(['id']);
  });
});
