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
        previousCourse: algebra,
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
});
