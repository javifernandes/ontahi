import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  parseGraphCommandRequest,
  relationship,
  resolveGraphCommandRequest,
  toGraphCommandRequest,
} from '../../src/data-graph/index.js';

const defineSchoolGraph = () => {
  const Course = entity('Course', { id: field.id(), name: field.string() });
  const Student = entity('Student', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  Course.hasMany('students', Student, { via: 'course' });
  return { Course, Student };
};

describe('data graph Relationship Command protocol', () => {
  type MutableRequest = {
    command: {
      relation: { sourceEntityName: string; fieldName: string };
      source: { entityName: string; locator: Record<string, unknown> };
    };
  };

  it('round-trips a canonical command and resolves it against server-owned Entities', () => {
    const client = defineSchoolGraph();
    const server = defineSchoolGraph();
    const student = createEntityRef(client.Student, { id: 'student-1' });
    const course = createEntityRef(client.Course, { id: 'course-1' });
    const forward = relationship(client.Student, 'course', student).assign(course);
    const inverse = relationship(client.Course, 'students', course).add(student);

    expect(forward).toEqual(inverse);
    const transported = JSON.parse(JSON.stringify(toGraphCommandRequest(forward)));
    expect(transported).toEqual({ version: 1, kind: 'graph-command', command: forward });

    const parsed = parseGraphCommandRequest(transported);
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);
    const resolved = resolveGraphCommandRequest(parsed.request, {
      entities: [server.Student, server.Course],
    });
    expect(resolved).toEqual({ success: true, request: parsed.request, command: forward });
  });

  it('round-trips and validates a conditional to-one transition', () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const previous = createEntityRef(graph.Course, { id: 'course-1' });
    const next = createEntityRef(graph.Course, { id: 'course-2' });
    const command = relationship(graph.Student, 'course', student).assign(next, {
      ifCurrent: previous,
    });
    const parsed = parseGraphCommandRequest(
      JSON.parse(JSON.stringify(toGraphCommandRequest(command))),
    );
    expect(parsed).toEqual({
      success: true,
      request: { version: 1, kind: 'graph-command', command },
    });
    if (!parsed.success) throw new Error(parsed.error.error.message);
    expect(
      resolveGraphCommandRequest(parsed.request, { entities: [graph.Student, graph.Course] }),
    ).toMatchObject({ success: true, command });
  });

  it('drops unknown envelope and command keys', () => {
    const graph = defineSchoolGraph();
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).clear();

    expect(
      parseGraphCommandRequest({
        ...toGraphCommandRequest(command),
        authority: 'attacker',
        command: { ...command, sql: 'delete from students' },
      }),
    ).toEqual({
      success: true,
      request: { version: 1, kind: 'graph-command', command },
    });
  });

  it.each([
    { name: 'non-object request', request: null, code: 'invalid_request' },
    {
      name: 'unsupported version',
      request: { version: 2, kind: 'graph-command', command: {} },
      code: 'unsupported_version',
    },
    {
      name: 'malformed command',
      request: { version: 1, kind: 'graph-command', command: { kind: 'entity-patch' } },
      code: 'invalid_request',
    },
  ])('rejects a $name', ({ request, code }) => {
    expect(parseGraphCommandRequest(request)).toMatchObject({
      success: false,
      error: { error: { code } },
    });
  });

  it.each([
    {
      name: 'unknown Entity',
      mutate: (request: MutableRequest) => {
        request.command.relation.sourceEntityName = 'Missing';
      },
      code: 'unknown_entity',
    },
    {
      name: 'invalid Relation field',
      mutate: (request: MutableRequest) => {
        request.command.relation.fieldName = 'missing';
      },
      code: 'invalid_relation',
    },
    {
      name: 'wrong endpoint Ref',
      mutate: (request: MutableRequest) => {
        request.command.source.entityName = 'Course';
      },
      code: 'invalid_reference',
    },
    {
      name: 'undeclared locator',
      mutate: (request: MutableRequest) => {
        request.command.source.locator = { slug: 'student-1' };
      },
      code: 'invalid_reference',
    },
  ])('rejects an $name during server resolution', ({ mutate, code }) => {
    const graph = defineSchoolGraph();
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).assign(createEntityRef(graph.Course, { id: 'course-1' }));
    const request = JSON.parse(JSON.stringify(toGraphCommandRequest(command)));
    mutate(request as MutableRequest);
    const parsed = parseGraphCommandRequest(request);
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(
      resolveGraphCommandRequest(parsed.request, { entities: [graph.Student, graph.Course] }),
    ).toMatchObject({ success: false, error: { error: { code } } });
  });

  it('rejects clearing a required Relation during server resolution', () => {
    const Course = entity('Course', { id: field.id() });
    const Student = entity('Student', { id: field.id(), course: field.ref(Course) });
    const command = relationship(
      Student,
      'course',
      createEntityRef(Student, { id: 'student-1' }),
    ).clear();

    expect(
      resolveGraphCommandRequest(toGraphCommandRequest(command), { entities: [Student, Course] }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_relation' } } });
  });
});
