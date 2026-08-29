import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  mutateEntity,
  parseGraphCommandRequest,
  relationship,
  resolveGraphCommandRequest,
  toGraphCommandRequest,
} from './index.js';

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
      onMismatch: 'skip',
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

  it('rejects an unknown conditional mismatch mode', () => {
    const graph = defineSchoolGraph();
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).assign(createEntityRef(graph.Course, { id: 'course-2' }), {
      ifCurrent: createEntityRef(graph.Course, { id: 'course-1' }),
    });

    expect(
      parseGraphCommandRequest({
        ...toGraphCommandRequest(command),
        command: {
          ...command,
          precondition: { ...command.precondition, onMismatch: 'ignore' },
        },
      }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_request' } },
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

describe('data graph Entity Mutation Command protocol', () => {
  const defineBookGraph = () =>
    entity('Book', {
      id: field.id(),
      title: field.nonEmptyString({ trim: true }),
      published: field.boolean(),
      label: field.derived(field.string(), () => ''),
    });

  it('round-trips create and exact-identity mutations and rebuilds normalized values', () => {
    const client = defineBookGraph();
    const server = defineBookGraph();
    const mutation = mutateEntity(client);
    const book = createEntityRef(client, { id: 'book-1' });
    const commands = [
      mutation.create({ id: 'book-1', title: '  Ontahi  ', published: false }),
      mutation.update(book, { title: '  Revised  ' }),
      mutation.delete(book),
    ];

    const resolved = commands.map(command => {
      const transported = JSON.parse(JSON.stringify(toGraphCommandRequest(command)));
      const parsed = parseGraphCommandRequest(transported);
      expect(parsed).toMatchObject({ success: true });
      if (!parsed.success) throw new Error(parsed.error.error.message);
      return resolveGraphCommandRequest(parsed.request, { entities: [server] });
    });

    expect(resolved).toEqual([
      {
        success: true,
        request: expect.any(Object),
        command: mutation.create({ id: 'book-1', title: 'Ontahi', published: false }),
      },
      {
        success: true,
        request: expect.any(Object),
        command: mutation.update(book, { title: 'Revised' }),
      },
      {
        success: true,
        request: expect.any(Object),
        command: mutation.delete(book),
      },
    ]);
  });

  it.each([
    {
      name: 'invalid locator value',
      command: {
        kind: 'entity-mutation-command',
        action: 'delete',
        entityName: 'Book',
        target: { kind: 'entity-ref', entityName: 'Book', locator: { id: 42 } },
      },
      code: 'invalid_reference',
    },
    {
      name: 'incomplete create payload',
      command: {
        kind: 'entity-mutation-command',
        action: 'create',
        entityName: 'Book',
        values: { id: 'book-1', published: false },
      },
      code: 'invalid_payload',
    },
    {
      name: 'derived Field payload',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Book',
        target: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
        values: { label: 'computed' },
      },
      code: 'invalid_payload',
    },
    {
      name: 'unknown Field payload',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Book',
        target: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
        values: { sql: 'drop table books' },
      },
      code: 'invalid_payload',
    },
    {
      name: 'empty update payload',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Book',
        target: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
        values: {},
      },
      code: 'invalid_payload',
    },
    {
      name: 'unknown Entity',
      command: {
        kind: 'entity-mutation-command',
        action: 'delete',
        entityName: 'Missing',
        target: { kind: 'entity-ref', entityName: 'Missing', locator: { id: 'book-1' } },
      },
      code: 'unknown_entity',
    },
  ])('rejects an $name while rebuilding the server Command', ({ command, code }) => {
    const Book = defineBookGraph();
    const parsed = parseGraphCommandRequest({ version: 1, kind: 'graph-command', command });
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphCommandRequest(parsed.request, { entities: [Book] })).toMatchObject({
      success: false,
      error: { error: { code } },
    });
  });

  it('rejects malformed Entity mutation intent at the protocol boundary', () => {
    expect(
      parseGraphCommandRequest({
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'archive',
          entityName: 'Book',
        },
      }),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_request' } },
    });
  });

  it('uses command-neutral diagnostics for invalid Entity mutation Refs', () => {
    const Book = defineBookGraph();
    const parsed = parseGraphCommandRequest({
      version: 1,
      kind: 'graph-command',
      command: {
        kind: 'entity-mutation-command',
        action: 'delete',
        entityName: 'Book',
        target: { kind: 'entity-ref', entityName: 'Author', locator: { id: 'author-1' } },
      },
    });
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(resolveGraphCommandRequest(parsed.request, { entities: [Book] })).toMatchObject({
      success: false,
      error: {
        error: {
          code: 'invalid_reference',
          message: 'Data graph Command target Ref must target Book.',
        },
      },
    });
  });
});
