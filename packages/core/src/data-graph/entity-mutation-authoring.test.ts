import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEntityRef,
  defineClientDomainOperation,
  defineClientEntity,
  entity,
  field,
  type EntityMutationCommand,
} from './index.js';

const Student = entity('Student', { id: field.id(), name: field.string() });
const Course = entity('Course', { id: field.id(), title: field.string() });
const EnrollmentSchema = entity('Enrollment', {
  id: field.id(),
  student: field.ref(Student),
  course: field.ref(Course),
  status: field.enum(['active', 'ended'] as const),
  note: field.optional(field.string()),
  displayLabel: field.derived(field.string(), () => ''),
});

describe('client Entity mutation authoring', () => {
  it('authors create on the Entity and exact update/delete on canonical Refs', () => {
    const Enrollment = defineClientEntity(EnrollmentSchema);
    const student = createEntityRef(Student, { id: 'student-1' });
    const course = createEntityRef(Course, { id: 'course-1' });
    const enrollment = Enrollment.refById('enrollment-1');

    const create = Enrollment.create({
      id: 'enrollment-1',
      student,
      course,
      status: 'active',
    });
    const update = enrollment.update({ status: 'ended', note: 'Transferred' });
    const remove = enrollment.delete();

    expect(create).toEqual({
      kind: 'entity-mutation-command',
      action: 'create',
      entityName: 'Enrollment',
      values: {
        id: 'enrollment-1',
        student,
        course,
        status: 'active',
      },
    });
    expect(update).toEqual({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Enrollment',
      target: createEntityRef(EnrollmentSchema, { id: 'enrollment-1' }),
      values: { status: 'ended', note: 'Transferred' },
    });
    expect(remove).toEqual({
      kind: 'entity-mutation-command',
      action: 'delete',
      entityName: 'Enrollment',
      target: createEntityRef(EnrollmentSchema, { id: 'enrollment-1' }),
    });
    expectTypeOf(create).toMatchTypeOf<EntityMutationCommand>();
    expectTypeOf(update).toMatchTypeOf<EntityMutationCommand>();
    expectTypeOf(remove).toMatchTypeOf<EntityMutationCommand>();
  });

  it('keeps Ref methods and Commands out of portable JSON', () => {
    const Enrollment = defineClientEntity(EnrollmentSchema);
    const enrollment = Enrollment.refById('enrollment-1');
    const command = enrollment.update({ status: 'ended' });

    expect(Object.keys(enrollment)).toEqual(['kind', 'entityName', 'locator']);
    expect(Object.keys(command)).toEqual(['kind', 'action', 'entityName', 'target', 'values']);
    expect(JSON.parse(JSON.stringify(enrollment))).toEqual({
      kind: 'entity-ref',
      entityName: 'Enrollment',
      locator: { id: 'enrollment-1' },
    });
    expect(JSON.parse(JSON.stringify(command))).toEqual({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Enrollment',
      target: {
        kind: 'entity-ref',
        entityName: 'Enrollment',
        locator: { id: 'enrollment-1' },
      },
      values: { status: 'ended' },
    });
  });

  it('reserves structural lifecycle methods ahead of same-named Ref operation shortcuts', () => {
    const Enrollment = defineClientEntity(EnrollmentSchema, {
      domainOperations: {
        delete: defineClientDomainOperation({
          authority: 'server',
          exposure: 'bridge',
          bridge: {},
        }),
      },
    });
    const enrollment = Enrollment.refById('enrollment-1');

    expect(enrollment.delete()).toEqual({
      kind: 'entity-mutation-command',
      action: 'delete',
      entityName: 'Enrollment',
      target: createEntityRef(EnrollmentSchema, { id: 'enrollment-1' }),
    });
    expect(Enrollment.domain.delete({ enrollment })).toMatchObject({
      kind: 'domain-operation-invocation',
      operationId: 'Enrollment.delete',
    });
  });

  it('requires stored fields and canonical participant Refs at compile time', () => {
    const Enrollment = defineClientEntity(EnrollmentSchema);
    const student = createEntityRef(Student, { id: 'student-1' });
    const course = createEntityRef(Course, { id: 'course-1' });

    Enrollment.create({ id: 'enrollment-1', student, course, status: 'active' });
    Enrollment.create({ id: 'enrollment-1', student, course, status: 'active', note: 'Optional' });

    if (false) {
      // @ts-expect-error Required participant Ref is missing.
      Enrollment.create({ id: 'enrollment-1', course, status: 'active' });
      Enrollment.create({
        id: 'enrollment-1',
        // @ts-expect-error A loaded-looking record is not a canonical Ref.
        student: { id: 'student-1' },
        course,
        status: 'active',
      });
      Enrollment.create({
        id: 'enrollment-1',
        student,
        course,
        status: 'active',
        // @ts-expect-error Derived Fields are not mutation inputs.
        displayLabel: 'No',
      });
      // @ts-expect-error A Ref can only update its own Entity shape.
      Enrollment.refById('enrollment-1').update({ title: 'Not an Enrollment Field' });
    }

    expect(true).toBe(true);
  });
});
