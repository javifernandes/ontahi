import { describe, expect, expectTypeOf, it } from 'vitest';

import type { GraphCommandSpec, GraphUpsertOptions } from '../command.js';
import { entity, field, type InferEntityRecord } from '../definitions.js';
import { toGraphJsonSchema, toGraphSchemaDescriptor } from '../schema-descriptor.js';
import { selection } from '../selection-value.js';
import { createUpsertCommandSpec } from '../selection.js';

import { modelExpression } from './builder.js';
import {
  definePortableDerivedFieldRegistry,
  materializeDerivedFieldDefinitions,
} from './derived-field.js';

describe('portable derived Fields', () => {
  it('keeps an explicit Model Expression as reflected read-only Field metadata', () => {
    const availableSeats = field.derived(
      field.nonNegativeInteger(),
      modelExpression.define(
        modelExpression.subtract(
          modelExpression.field('capacity'),
          modelExpression.relation('students').count(),
        ),
      ),
    );
    const Course = entity('Course', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats,
    });

    expectTypeOf<InferEntityRecord<typeof Course.fields>>().toEqualTypeOf<{
      id: string;
      capacity: number;
      availableSeats: number;
    }>();
    expect(availableSeats.derived).toEqual({
      expression: {
        version: 1,
        expression: {
          kind: 'arithmetic',
          operator: 'subtract',
          left: { kind: 'field', field: 'capacity' },
          right: { kind: 'relation-aggregate', relation: 'students', aggregate: 'count' },
        },
      },
      dependencies: [
        { kind: 'field', field: 'capacity' },
        { kind: 'relation-aggregate', relation: 'students', aggregate: 'count' },
      ],
    });
    expect(toGraphSchemaDescriptor(availableSeats)).toEqual({
      kind: 'scalar',
      type: 'number',
      numberConstraints: { integer: true, min: 0 },
      readOnly: true,
      derived: availableSeats.derived,
    });
    expect(toGraphJsonSchema(availableSeats)).toMatchObject({
      type: 'integer',
      readOnly: true,
      'x-ontahi-derived': availableSeats.derived,
    });

    const selected = selection(Course, course => course.id.eq('course-1'));
    selected.update({ capacity: 4 });
    selected.updateReturning({ capacity: 4 }, ['capacity']);
    selected.deleteReturning(['capacity']);
    createUpsertCommandSpec(
      Course,
      { id: 'course-1', capacity: 4 },
      {
        conflictOn: ['id'],
        strategy: 'merge',
      },
    );
    const commandSpec: GraphCommandSpec<typeof Course> = {
      kind: 'command',
      operation: 'delete',
      root: Course,
      selection: { kind: 'all' },
      returning: ['capacity'],
    };
    const upsertOptions: GraphUpsertOptions<typeof Course> = {
      conflictOn: ['id'],
      strategy: 'merge',
    };
    expect(commandSpec.returning).toEqual(['capacity']);
    expect(upsertOptions.conflictOn).toEqual(['id']);
    // @ts-expect-error virtual derived Fields are not mutation payload members
    selected.update({ availableSeats: 4 });
    // @ts-expect-error Commands cannot return virtual derived Fields
    selected.updateReturning({ capacity: 4 }, ['availableSeats']);
    // @ts-expect-error delete-returning cannot return virtual derived Fields
    selected.deleteReturning(['availableSeats']);
    createUpsertCommandSpec(
      Course,
      { id: 'course-1', capacity: 4 },
      {
        // @ts-expect-error virtual derived Fields cannot identify a storage conflict
        conflictOn: ['availableSeats'],
        strategy: 'merge',
      },
    );
    const invalidCommandSpec: GraphCommandSpec<typeof Course> = {
      kind: 'command',
      operation: 'delete',
      root: Course,
      selection: { kind: 'all' },
      // @ts-expect-error exported Command specs cannot return virtual derived Fields
      returning: ['availableSeats'],
    };
    const invalidUpsertOptions: GraphUpsertOptions<typeof Course> = {
      // @ts-expect-error exported upsert options require stored conflict Fields
      conflictOn: ['availableSeats'],
      strategy: 'merge',
    };
    expect(invalidCommandSpec.returning).toEqual(['availableSeats']);
    expect(invalidUpsertOptions.conflictOn).toEqual(['availableSeats']);
  });

  it('materializes generated expressions for natural callback authoring', () => {
    const Course = entity('GeneratedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        ({ capacity, students }) => capacity - students.count(),
      ),
    }).hasMany('students', entity('GeneratedStudent', { id: field.id() }));
    const registry = definePortableDerivedFieldRegistry({
      version: 1,
      entities: {
        GeneratedCourse: {
          fields: {
            availableSeats: modelExpression.define(
              modelExpression.subtract(
                modelExpression.field('capacity'),
                modelExpression.relation('students').count(),
              ),
            ),
          },
        },
      },
    });

    materializeDerivedFieldDefinitions([Course], registry);

    expect(Course.fields.availableSeats.derived).toEqual({
      expression: registry.entities.GeneratedCourse!.fields.availableSeats,
      dependencies: [
        { kind: 'field', field: 'capacity' },
        { kind: 'relation-aggregate', relation: 'students', aggregate: 'count' },
      ],
    });
  });

  it('rejects invalid registries and non-Entity dependencies before binding storage', () => {
    expect(() => definePortableDerivedFieldRegistry({ version: 2, entities: {} } as never)).toThrow(
      'Unsupported portable derived Field registry version 2.',
    );
    expect(() =>
      definePortableDerivedFieldRegistry({
        version: 1,
        entities: { '': { fields: {} } },
      }),
    ).toThrow('Portable derived Field Entity names cannot be empty.');
    expect(() =>
      definePortableDerivedFieldRegistry({
        version: 1,
        entities: {
          Course: { fields: { '': modelExpression.define(modelExpression.field('id')) } },
        },
      }),
    ).toThrow('Portable derived Field name cannot be empty on Course.');

    const storedDependency = (dependency: ReturnType<typeof modelExpression.define>) =>
      entity('InvalidDerivedCourse', {
        id: field.id(),
        value: field.nonNegativeInteger(),
        computed: field.derived(field.nonNegativeInteger(), dependency),
      });
    expect(() =>
      materializeDerivedFieldDefinitions([
        storedDependency(modelExpression.define(modelExpression.ref('course').expression)),
      ]),
    ).toThrow('cannot depend on Operation input course');
    expect(() =>
      materializeDerivedFieldDefinitions([
        storedDependency(modelExpression.define(modelExpression.field('missing'))),
      ]),
    ).toThrow('requires stored Field missing');
    expect(() =>
      materializeDerivedFieldDefinitions([
        storedDependency(modelExpression.define(modelExpression.relation('students').count())),
      ]),
    ).toThrow('requires to-many Relation students');

    const natural = entity('NaturalDerivedCourse', {
      id: field.id(),
      computed: field.derived(field.nonNegativeInteger(), ({ id }) => id.length),
    });
    expect(() => materializeDerivedFieldDefinitions([natural])).toThrow(
      'Derived Field NaturalDerivedCourse.computed has no compiled Model Expression.',
    );
    expect(() =>
      materializeDerivedFieldDefinitions(
        [natural],
        definePortableDerivedFieldRegistry({
          version: 1,
          entities: {
            MissingCourse: {
              fields: { computed: modelExpression.define(modelExpression.field('id')) },
            },
          },
        }),
      ),
    ).toThrow('Unknown derived Field Entity MissingCourse.');
    expect(() =>
      materializeDerivedFieldDefinitions(
        [natural],
        definePortableDerivedFieldRegistry({
          version: 1,
          entities: {
            NaturalDerivedCourse: {
              fields: { missing: modelExpression.define(modelExpression.field('id')) },
            },
          },
        }),
      ),
    ).toThrow('Unknown derived Field NaturalDerivedCourse.missing.');
  });
});
