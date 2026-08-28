import { describe, expect, it } from 'vitest';

import { createEntityRef } from '../ref/index.js';

import {
  definePortableOperationConditionRegistry,
  evaluateModelExpression,
  evaluatePortableOperationCondition,
  modelExpression,
  resolveOperationConditionContracts,
} from './index.js';

const differentCourses = modelExpression.define(
  modelExpression.not(modelExpression.ref('previousCourse').is(modelExpression.ref('nextCourse'))),
);

describe('portable model conditions', () => {
  it('rejects malformed registry declarations', () => {
    expect(() =>
      definePortableOperationConditionRegistry({ version: 2, operations: {} } as never),
    ).toThrow('Unsupported portable Operation condition registry version 2.');
    expect(() =>
      definePortableOperationConditionRegistry({
        version: 1,
        operations: { '': { pre: [] } },
      }),
    ).toThrow('Portable Operation condition registry keys cannot be empty.');
    expect(() =>
      definePortableOperationConditionRegistry({
        version: 1,
        operations: {
          'Student.transfer': {
            pre: [{ name: '', expression: differentCourses }],
          },
        },
      }),
    ).toThrow('Portable Operation Student.transfer has an empty or duplicate precondition name.');
    expect(() =>
      definePortableOperationConditionRegistry({
        version: 1,
        operations: {
          'Student.transfer': {
            pre: [
              { name: 'ready', expression: differentCourses },
              { name: 'ready', expression: differentCourses },
            ],
          },
        },
      }),
    ).toThrow('Portable Operation Student.transfer has an empty or duplicate precondition name.');
  });

  it('normalizes one JSON-safe condition with dependencies and a conventional rejection', () => {
    const registry = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Student.transfer': {
          pre: [{ name: 'differentCourses', expression: differentCourses }],
        },
      },
    });

    expect(registry.operations['Student.transfer']).toEqual({
      pre: [
        {
          id: 'Student.transfer.pre.differentCourses',
          name: 'differentCourses',
          phase: 'pre',
          expression: differentCourses,
          dependencies: [
            { kind: 'input-ref', input: 'previousCourse' },
            { kind: 'input-ref', input: 'nextCourse' },
          ],
          rejection: {
            reason: 'operation_condition_rejected',
            message: 'Operation condition "differentCourses" was not satisfied.',
          },
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(registry))).toEqual(registry);
  });

  it('evaluates the same condition as satisfied, rejected, or unknown from portable input', () => {
    const condition = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Student.transfer': {
          pre: [{ name: 'differentCourses', expression: differentCourses }],
        },
      },
    }).operations['Student.transfer']!.pre[0]!;
    const algebra = createEntityRef('Course', { id: 'course-algebra' });
    const geometry = createEntityRef('Course', { id: 'course-geometry' });

    expect(
      evaluatePortableOperationCondition(condition, {
        previousCourse: { ref: algebra },
        nextCourse: geometry,
      }),
    ).toEqual({ status: 'satisfied' });
    expect(
      evaluatePortableOperationCondition(condition, {
        previousCourse: algebra,
        nextCourse: algebra,
      }),
    ).toEqual({ status: 'rejected', rejection: condition.rejection });
    expect(
      evaluatePortableOperationCondition(condition, {
        previousCourse: algebra,
      }),
    ).toEqual({
      status: 'unknown',
      missing: [{ kind: 'input-ref', input: 'nextCourse' }],
    });
  });

  it('rejects a portable condition whose expression does not produce a boolean', () => {
    const condition = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Course.inspect': {
          pre: [
            {
              name: 'invalidResult',
              expression: modelExpression.define(modelExpression.ref('course').expression),
            },
          ],
        },
      },
    }).operations['Course.inspect']!.pre[0]!;

    expect(() =>
      evaluatePortableOperationCondition(condition, {
        course: createEntityRef('Course', { id: 'course-algebra' }),
      }),
    ).toThrow(
      'Portable Operation condition Course.inspect.pre.invalidResult did not produce a boolean.',
    );
  });

  it('interprets the complete expression subset promoted from the experiment', () => {
    const availableSeats = modelExpression.define(
      modelExpression.subtract(
        modelExpression.field('capacity'),
        modelExpression.relation('students').count(),
      ),
    );
    const withinCapacity = modelExpression.define(
      modelExpression.lte(
        modelExpression.relation('students').count(),
        modelExpression.field('capacity'),
      ),
    );

    expect(
      evaluateModelExpression(availableSeats, {
        fields: { capacity: 3 },
        relationAggregates: { students: { count: 2 } },
      }),
    ).toEqual({ status: 'value', value: 1 });
    expect(
      evaluateModelExpression(withinCapacity, {
        fields: { capacity: 3 },
        relationAggregates: { students: { count: 4 } },
      }),
    ).toEqual({ status: 'value', value: false });
    expect(() =>
      evaluateModelExpression(availableSeats, {
        fields: { capacity: Number.POSITIVE_INFINITY },
        relationAggregates: { students: { count: 2 } },
      }),
    ).toThrow('Model expression field expected a finite number.');
    expect(() =>
      evaluateModelExpression(
        modelExpression.define(modelExpression.not(modelExpression.field('capacity'))),
        {
          fields: { capacity: 3 },
        },
      ),
    ).toThrow('Model expression field expected a boolean.');
    expect(() =>
      evaluateModelExpression(
        modelExpression.define({
          kind: 'ref-identity',
          operator: 'is',
          left: modelExpression.field('left'),
          right: modelExpression.field('right'),
        }),
        { fields: { left: 'course-a', right: 'course-b' } },
      ),
    ).toThrow('Model Ref identity comparison requires two portable Entity Refs.');
  });

  it('validates runtime condition authoring and resolves compiled-only callbacks', () => {
    expect(resolveOperationConditionContracts('Student.transfer', undefined)).toBeUndefined();
    expect(() =>
      resolveOperationConditionContracts('Student.transfer', { pre: [] } as never),
    ).toThrow(
      'Operation Student.transfer contracts.pre must be an object of named portable conditions.',
    );
    expect(() =>
      resolveOperationConditionContracts('Student.transfer', { pre: { invalid: false } } as never),
    ).toThrow('Operation Student.transfer precondition invalid is not portable.');
    expect(() =>
      resolveOperationConditionContracts('Student.transfer', {
        pre: { missing: () => true },
      }),
    ).toThrow('Operation Student.transfer precondition missing has no compiled Model Expression.');

    const registry = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Student.transfer': {
          pre: [{ name: 'differentCourses', expression: differentCourses }],
        },
      },
    });
    expect(
      resolveOperationConditionContracts(
        'Student.transfer',
        { pre: { differentCourses: () => true } },
        registry,
      ),
    ).toBe(registry.operations['Student.transfer']);
  });

  it('preserves explicit rejection metadata and rejects invalid builder arguments', () => {
    const rejection = { reason: 'same_course', message: 'Courses must differ.' };
    const explicit = modelExpression.condition(differentCourses, { rejection });

    expect(
      resolveOperationConditionContracts('Student.transfer', {
        pre: { differentCourses: explicit },
      }),
    ).toEqual({
      pre: [expect.objectContaining({ name: 'differentCourses', rejection })],
    });
    expect(() =>
      modelExpression.ref('previousCourse').is(modelExpression.field('capacity') as never),
    ).toThrow('is(...) requires a Ref built by modelExpression.ref().');
  });

  it('fails closed when generated conditions are stale relative to authoring', () => {
    const registry = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Student.transfer': {
          pre: [{ name: 'differentCourses', expression: differentCourses }],
        },
      },
    });

    expect(() =>
      resolveOperationConditionContracts('Student.transfer', undefined, registry),
    ).toThrow(
      'Operation Student.transfer has stale compiled preconditions: differentCourses. Run Ontahi codegen.',
    );
  });

  it('fails closed when the generated condition order is stale', () => {
    const registry = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Student.transfer': {
          pre: [
            { name: 'second', expression: differentCourses },
            { name: 'first', expression: differentCourses },
          ],
        },
      },
    });

    expect(() =>
      resolveOperationConditionContracts(
        'Student.transfer',
        { pre: { first: () => true, second: () => true } },
        registry,
      ),
    ).toThrow(
      'Operation Student.transfer has stale compiled precondition order. Run Ontahi codegen.',
    );
  });

  it('compares generated order only with callback-authored conditions', () => {
    const registry = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Student.transfer': {
          pre: [{ name: 'differentCourses', expression: differentCourses }],
        },
      },
    });
    const explicit = modelExpression.condition(differentCourses);

    expect(
      resolveOperationConditionContracts(
        'Student.transfer',
        {
          pre: {
            explicitlyAllowed: explicit,
            differentCourses: () => true,
          },
        },
        registry,
      ),
    ).toEqual({
      pre: [
        expect.objectContaining({ name: 'explicitlyAllowed', expression: differentCourses }),
        expect.objectContaining({ name: 'differentCourses', expression: differentCourses }),
      ],
    });
  });
});
