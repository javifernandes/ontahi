import { describe, expect, it, vi } from 'vitest';

import {
  createGraphCommandDispatcher,
  entity,
  field,
  isGraphCommandCapabilities,
  type GraphCommandCapabilitiesResult,
} from './index.js';

describe('Relationship Command affordance discovery', () => {
  it('reflects direct, many-to-many, and ordered policies with exact endpoint locators', async () => {
    const Course = entity('AffordanceCourse', { id: field.id() });
    const Student = entity('AffordanceStudent', {
      id: field.id(),
      course: field.nullable(field.ref(Course)),
    }).manyToMany('courses', Course);
    const ListBase = entity('AffordanceList', { id: field.id() });
    const Item = entity('AffordanceItem', {
      id: field.id(),
      list: field.ref(ListBase),
    });
    const List = ListBase.hasMany('items', Item, { via: 'list', ordered: true });
    const dispatch = createGraphCommandDispatcher({
      policies: [
        { entity: Student, fieldName: 'course', actions: ['link', 'unlink'] },
        { entity: Student, relationName: 'courses', actions: ['link', 'unlink'] },
        { entity: List, relationName: 'items', actions: ['move'] },
      ],
      execute: vi.fn(),
      executeManyToMany: vi.fn(),
      executeOrdered: vi.fn(),
    });
    const discover = async (entityName: string) =>
      (await dispatch(
        { version: 1, kind: 'graph-command-capabilities', entityName },
        { authority: undefined },
      )) as GraphCommandCapabilitiesResult;

    expect(
      (await discover('AffordanceStudent')).capabilities.relationshipCommandAffordances,
    ).toEqual([
      expect.objectContaining({
        relationKind: 'direct',
        relation: expect.objectContaining({ fieldName: 'course' }),
        actions: ['link', 'unlink'],
        source: expect.objectContaining({
          entityName: 'AffordanceStudent',
          locator: expect.objectContaining({ fields: { id: expect.any(Object) } }),
        }),
        target: expect.objectContaining({ entityName: 'AffordanceCourse' }),
        precondition: true,
      }),
      expect.objectContaining({
        relationKind: 'many-to-many',
        relation: expect.objectContaining({ relationName: 'courses' }),
        actions: ['link', 'unlink'],
      }),
    ]);
    expect((await discover('AffordanceList')).capabilities.relationshipCommandAffordances).toEqual([
      expect.objectContaining({
        relationKind: 'ordered',
        relation: expect.objectContaining({ relationName: 'items' }),
        actions: ['move'],
        member: expect.objectContaining({ entityName: 'AffordanceItem' }),
        placements: ['before', 'after', 'start', 'end'],
        precondition: true,
      }),
    ]);
  });

  it('rejects malformed relationship affordances in capability responses', () => {
    expect(
      isGraphCommandCapabilities({
        entityMutations: [],
        relationshipCommandAffordances: [
          {
            kind: 'relationship-command-affordance',
            relationKind: 'ordered',
            relation: { cardinality: 'ordered-many' },
            actions: ['move'],
            source: { entityName: 'List', locator: {} },
            member: { entityName: 'Item', locator: {} },
            placements: ['sideways'],
            precondition: true,
          },
        ],
      }),
    ).toBe(false);
  });
});
