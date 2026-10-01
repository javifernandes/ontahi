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

    const studentCapabilities = (await discover('AffordanceStudent')).capabilities;
    expect(isGraphCommandCapabilities(studentCapabilities)).toBe(true);
    expect(studentCapabilities.relationshipCommandAffordances).toEqual([
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
    const listCapabilities = (await discover('AffordanceList')).capabilities;
    expect(isGraphCommandCapabilities(listCapabilities)).toBe(true);
    expect(listCapabilities.relationshipCommandAffordances).toEqual([
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
    expect(
      isGraphCommandCapabilities({
        entityMutations: [],
        relationshipCommandAffordances: [
          {
            kind: 'relationship-command-affordance',
            relationKind: 'many-to-many',
            relation: {
              sourceEntityName: 'Source',
              relationName: 'targets',
              targetEntityName: 'Target',
              cardinality: 'many-to-many',
            },
            actions: ['link'],
            source: {
              entityName: 'Source',
              locator: {
                kind: 'object',
                unknownKeys: 'strict',
                fields: { id: { kind: 'scalar', type: 'id' } },
              },
            },
            target: { entityName: 'Target', locator: {} },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isGraphCommandCapabilities({
        entityMutations: [],
        relationshipCommandAffordances: [
          {
            kind: 'relationship-command-affordance',
            relationKind: 'ordered',
            relation: {
              sourceEntityName: 'List',
              relationName: 'items',
              targetEntityName: 'Item',
              cardinality: 'ordered-many',
            },
            actions: ['move'],
            source: {
              entityName: 'List',
              locator: {
                kind: 'object',
                unknownKeys: 'strict',
                fields: { id: { kind: 'scalar', type: 'id' } },
              },
            },
            member: { entityName: 'Item', locator: {} },
            placements: ['before', 'after', 'start', 'end'],
            precondition: true,
          },
        ],
      }),
    ).toBe(false);
  });

  it('keeps unsupported identity reflection advisory', async () => {
    const Unidentified = entity('UnidentifiedTarget', { code: field.string() });
    const Source = entity('IdentifiedSource', {
      id: field.id(),
      target: field.nullable(field.ref(Unidentified)),
    });

    const dispatch = createGraphCommandDispatcher({
      policies: [{ entity: Source, fieldName: 'target', actions: ['link', 'unlink'] }],
      execute: vi.fn(),
      executeManyToMany: vi.fn(),
    });

    await expect(
      dispatch(
        { version: 1, kind: 'graph-command-capabilities', entityName: Source.name },
        { authority: undefined },
      ),
    ).resolves.toMatchObject({
      kind: 'graph-command-capabilities-result',
      capabilities: { entityMutations: [] },
    });
  });

  it('publishes and accepts reference-valued identity locators', async () => {
    const Student = entity('LocatorStudent', { id: field.id() });
    const Course = entity('LocatorCourse', { id: field.id() });
    const Enrollment = entity('LocatorEnrollment', {
      student: field.ref(Student),
      course: field.ref(Course),
      advisor: field.nullable(field.ref(Student)),
    })
      .locators({ byStudentAndCourse: ['student', 'course'] })
      .identity('byStudentAndCourse');
    const dispatch = createGraphCommandDispatcher({
      policies: [{ entity: Enrollment, fieldName: 'advisor', actions: ['link'] }],
      execute: vi.fn(),
      executeManyToMany: vi.fn(),
    });

    const response = (await dispatch(
      { version: 1, kind: 'graph-command-capabilities', entityName: Enrollment.name },
      { authority: undefined },
    )) as GraphCommandCapabilitiesResult;
    expect(isGraphCommandCapabilities(response.capabilities)).toBe(true);
    expect(response.capabilities.relationshipCommandAffordances?.[0]?.source.locator).toMatchObject(
      {
        fields: {
          student: { kind: 'entity-ref', entityName: Student.name },
          course: { kind: 'entity-ref', entityName: Course.name },
        },
      },
    );
  });
});
