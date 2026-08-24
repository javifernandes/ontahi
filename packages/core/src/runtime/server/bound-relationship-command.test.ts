import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  defineClientEntity,
  defineClientDomainOperation,
  field,
  type EntityRef,
  type RelationshipCommand,
} from '../../data-graph/index.js';

import { createArchitectureAppFacade, entity, ontahi, relation } from './index.js';

describe('bound relationship commands', () => {
  it('authors typed canonical commands directly from entity refs', () => {
    const Course = entity({
      name: 'Course',
      fields: { id: field.id(), name: field.string() },
    });
    const Student = entity({
      name: 'Student',
      fields: {
        id: field.id(),
        course: field.nullable(field.ref(Course)),
      },
    });
    const Member = entity({
      name: 'Member',
      fields: { id: field.id(), teamId: field.id() },
    });
    const Team = entity({
      name: 'Team',
      fields: { id: field.id() },
      relations: { members: relation.hasMany(Member, { via: 'teamId' }) },
    });
    const Tag = entity({
      name: 'Tag',
      fields: { id: field.id() },
    });
    const Todo = entity({
      name: 'Todo',
      fields: { id: field.id() },
      relations: { tags: relation.manyToMany(Tag) },
    });

    const application = ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: { Course: [], Student: [], Member: [], Team: [], Tag: [], Todo: [] },
      }),
      entities: [Course, Student, Member, Team, Tag, Todo],
    });

    const student = Student.refById('student-1');
    const course = Course.refById('course-1');
    const team = Team.refById('team-1');
    const member = Member.refById('member-1');
    const todo = Todo.refById('todo-1');
    const tag = Tag.refById('tag-1');
    const boundStudent = application.graph.entities.Student.refById('student-1');
    const boundCourse = application.graph.entities.Course.refById('course-1');
    const boundAssign = boundStudent.course.assign(boundCourse);

    expect(typeof application.app.graph.transaction).toBe('function');
    expect(application.app.runtime.unitOfWork.current()).toBeUndefined();

    expect(student.course.assign(course)).toEqual({
      kind: 'relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Student',
        fieldName: 'course',
        targetEntityName: 'Course',
      },
      source: student,
      target: course,
    });
    expect(team.members.add(member)).toEqual({
      kind: 'relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Member',
        fieldName: 'teamId',
        targetEntityName: 'Team',
      },
      source: member,
      target: team,
    });
    expect(todo.tags.add(tag)).toMatchObject({
      kind: 'many-to-many-relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Todo',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
    });
    expect(todo.tags.remove(tag)).toMatchObject({
      kind: 'many-to-many-relationship-command',
      action: 'unlink',
      relation: {
        sourceEntityName: 'Todo',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
    });
    expectTypeOf(boundAssign.run).toBeFunction();
    expect(typeof boundAssign.run).toBe('function');
    expect(Object.keys(boundAssign)).toEqual(['kind', 'action', 'relation', 'source', 'target']);
    expect(JSON.parse(JSON.stringify(boundAssign))).toEqual(student.course.assign(course));

    expectTypeOf(student.course.assign).parameter(0).toEqualTypeOf<EntityRef<'Course'>>();
    expect(student.course.assign(Course.refById('course-2'), { ifCurrent: course })).toMatchObject({
      precondition: { currentTarget: course },
    });
    expectTypeOf(student.course.assign(course)).toEqualTypeOf<RelationshipCommand>();
    expectTypeOf(student.course).not.toHaveProperty('add');
    expectTypeOf(team.members.add).parameter(0).toEqualTypeOf<EntityRef<'Member'>>();
    expectTypeOf(team.members.add(member)).toEqualTypeOf<RelationshipCommand>();
    expectTypeOf(team.members).not.toHaveProperty('assign');
    expect(Object.keys(student)).toEqual(['kind', 'entityName', 'locator']);
    expect(JSON.parse(JSON.stringify(student))).toEqual({
      kind: 'entity-ref',
      entityName: 'Student',
      locator: { id: 'student-1' },
    });
    const directStudent = Student.ref({ id: 'student-direct' });
    expect(directStudent.course.clear()).toMatchObject({
      kind: 'relationship-command',
      action: 'unlink',
      relation: { sourceEntityName: 'Student', fieldName: 'course' },
      source: { entityName: 'Student', locator: { id: 'student-direct' } },
    });

    const ClientCourseRelation = defineClientEntity('ClientCourseRelation', {
      domainOperations: {
        inspect: defineClientDomainOperation({
          authority: 'server',
          exposure: 'bridge',
          bridge: {},
        }),
      },
    });
    const ClientStudent = defineClientEntity(Student, {
      relations: {
        course: {
          sourceName: 'Student',
          domain: ClientCourseRelation.domain,
        },
      },
    });
    const clientStudent = ClientStudent.refById('student-2');
    expect(clientStudent.course.assign(course)).toMatchObject({
      kind: 'relationship-command',
      relation: { sourceEntityName: 'Student', fieldName: 'course' },
      source: { entityName: 'Student', locator: { id: 'student-2' } },
      target: course,
    });
    expect(clientStudent.course.inspect()).toMatchObject({
      kind: 'domain-operation-invocation',
      input: { student: clientStudent },
    });
    expect(ClientStudent.ref({ id: 'student-client-direct' }).course.clear()).toMatchObject({
      kind: 'relationship-command',
      action: 'unlink',
      source: { entityName: 'Student', locator: { id: 'student-client-direct' } },
    });

    const app = createArchitectureAppFacade({});
    const provideStudentRef = app.graph.refProvider(Student, {}, (id: string) => ({ id }));
    const providedStudent = provideStudentRef('student-3');
    expectTypeOf(providedStudent.course.assign).parameter(0).toEqualTypeOf<EntityRef<'Course'>>();
    expect(providedStudent.course.assign(course)).toMatchObject({
      kind: 'relationship-command',
      action: 'link',
      relation: { sourceEntityName: 'Student', fieldName: 'course' },
      source: { entityName: 'Student', locator: { id: 'student-3' } },
      target: course,
    });
    const provideLegacyRef = app.graph.refProvider('LegacyStudent', {}, (id: string) => ({ id }));
    expect(provideLegacyRef('legacy-1')).toEqual({
      kind: 'entity-ref',
      entityName: 'LegacyStudent',
      locator: { id: 'legacy-1' },
    });
  });
});
