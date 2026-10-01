import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  isGraphCommandCapabilities,
  mutateEntity,
  parseGraphCommandFamilyRequest,
  parseGraphCommandRequest,
  relationship,
  resolveGraphCommandRequest,
  toGraphCommandRequest,
  type GraphCommandRequestV1,
  type OrderedRelationshipCommand,
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

  it('parses Entity mutation capability discovery without a Command payload', () => {
    expect(
      parseGraphCommandFamilyRequest({
        version: 1,
        kind: 'graph-command-capabilities',
        entityName: 'Student',
        authority: 'ignored',
      }),
    ).toEqual({
      success: true,
      request: { version: 1, kind: 'graph-command-capabilities', entityName: 'Student' },
    });
    expect(
      parseGraphCommandFamilyRequest({
        version: 1,
        kind: 'graph-command-capabilities',
        entityName: '',
      }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });
  });

  it('accepts action-only capability responses and rejects malformed affordances', () => {
    expect(isGraphCommandCapabilities({ entityMutations: ['create'] })).toBe(true);
    expect(
      isGraphCommandCapabilities({
        entityMutations: ['create'],
        entityMutationAffordances: [
          {
            kind: 'entity-mutation-affordance',
            entityName: 'Student',
            action: 'create',
            values: {
              kind: 'object',
              role: 'object',
              unknownKeys: 'strict',
              fields: { name: { kind: 'scalar', type: 'string' } },
            },
          },
        ],
      }),
    ).toBe(true);
    expect(
      isGraphCommandCapabilities({
        entityMutations: ['create'],
        entityMutationAffordances: [{ action: 'create', values: { fields: [] } }],
      }),
    ).toBe(false);
  });

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

  it('round-trips a version 3 Entity Selection mutation', () => {
    const graph = defineSchoolGraph();
    const target = {
      kind: 'selection' as const,
      entityName: 'Course' as const,
      expression: {
        kind: 'predicate' as const,
        fieldName: 'name',
        operator: 'eq' as const,
        value: 'Important',
      },
    };
    const command = mutateEntity(graph.Course).deleteSelection(target);
    const request = toGraphCommandRequest(command);

    expect(request).toEqual({ version: 3, kind: 'graph-command', command });
    expect(parseGraphCommandRequest(JSON.parse(JSON.stringify(request)))).toEqual({
      success: true,
      request,
    });
    expect(
      resolveGraphCommandRequest(request, { entities: [graph.Course, graph.Student] }),
    ).toEqual({ success: true, request, command });
  });

  it('rejects Selection mutation targets outside version 3 and invalid Selection Fields', () => {
    const graph = defineSchoolGraph();
    const command = mutateEntity(graph.Course).deleteSelection({
      kind: 'selection',
      entityName: 'Course',
      expression: {
        kind: 'predicate',
        fieldName: 'missing',
        operator: 'eq',
        value: 'Important',
      },
    });
    const request = toGraphCommandRequest(command);

    expect(parseGraphCommandRequest({ ...request, version: 2 })).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_request' } },
    });
    expect(resolveGraphCommandRequest(request, { entities: [graph.Course] })).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_selection' } },
    });
    expect(
      resolveGraphCommandRequest(
        {
          ...request,
          command: {
            ...command,
            target: { ...command.target, entityName: 'Student' },
          },
        } as never,
        { entities: [graph.Course, graph.Student] },
      ),
    ).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_selection' } },
    });
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
      request: { version: 4, kind: 'graph-command', command: {} },
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

describe('data graph ordered Relationship Command protocol', () => {
  const defineOrderedGraph = () => {
    const List = entity('ProtocolList', { id: field.id() });
    const Item = entity('ProtocolItem', { id: field.id(), list: field.ref(List) });
    List.hasMany('items', Item, { via: 'list', ordered: true });
    return { List, Item };
  };

  it('round-trips only through protocol v2 and resolves the declared ordered endpoint', () => {
    const graph = defineOrderedGraph();
    const list = createEntityRef(graph.List, { id: 'list-1' });
    const member = createEntityRef(graph.Item, { id: 'item-2' });
    const anchor = createEntityRef(graph.Item, { id: 'item-1' });
    const command = relationship(graph.List, 'items', list).after(member, anchor, {
      ifPosition: { before: null, after: anchor },
      onMismatch: 'skip',
    });
    expectTypeOf<OrderedRelationshipCommand>().not.toMatchTypeOf<
      GraphCommandRequestV1['command']
    >();
    const request = JSON.parse(JSON.stringify(toGraphCommandRequest(command)));

    expect(request).toEqual({ version: 2, kind: 'graph-command', command });
    const parsed = parseGraphCommandRequest(request);
    expect(parsed).toEqual({ success: true, request });
    if (!parsed.success) throw new Error(parsed.error.error.message);
    expect(
      resolveGraphCommandRequest(parsed.request, { entities: [graph.List, graph.Item] }),
    ).toEqual({ success: true, request: parsed.request, command });
  });

  it('rejects v1, ambiguous placement, and a non-ordered server Relation', () => {
    const graph = defineOrderedGraph();
    const command = relationship(
      graph.List,
      'items',
      createEntityRef(graph.List, { id: 'list-1' }),
    ).prepend(createEntityRef(graph.Item, { id: 'item-1' }));

    expect(
      parseGraphCommandRequest({ ...toGraphCommandRequest(command), version: 1 }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });
    expect(
      parseGraphCommandRequest({
        ...toGraphCommandRequest(command),
        command: { ...command, position: { at: 'start', before: command.member } },
      }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });

    const List = entity('ProtocolList', { id: field.id() });
    const Item = entity('ProtocolItem', { id: field.id(), list: field.ref(List) });
    List.hasMany('items', Item, { via: 'list' });
    expect(
      resolveGraphCommandRequest(toGraphCommandRequest(command), { entities: [List, Item] }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_relation' } } });
  });

  it('rejects malformed ordered placements and neighborhood preconditions', () => {
    const graph = defineOrderedGraph();
    const command = relationship(
      graph.List,
      'items',
      createEntityRef(graph.List, { id: 'list-1' }),
    ).prepend(createEntityRef(graph.Item, { id: 'item-1' }));
    const request = toGraphCommandRequest(command);

    for (const position of [
      null,
      { before: command.member, extra: true },
      { after: command.member, extra: true },
      { destination: 'unknown' },
    ]) {
      expect(
        parseGraphCommandRequest({
          ...request,
          command: { ...command, position },
        }),
      ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });
    }
    expect(
      parseGraphCommandRequest({
        ...request,
        command: {
          ...command,
          precondition: { position: { before: null }, onMismatch: 'skip' },
        },
      }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });
  });

  it('validates a before anchor during server resolution', () => {
    const graph = defineOrderedGraph();
    const command = relationship(
      graph.List,
      'items',
      createEntityRef(graph.List, { id: 'list-1' }),
    ).before(
      createEntityRef(graph.Item, { id: 'item-2' }),
      createEntityRef(graph.Item, { id: 'item-1' }),
    );
    const invalid = {
      ...command,
      position: { before: createEntityRef(graph.List, { id: 'list-1' }) },
    } as unknown as typeof command;
    const parsed = parseGraphCommandRequest(toGraphCommandRequest(invalid));
    if (!parsed.success) throw new Error(parsed.error.error.message);

    expect(
      resolveGraphCommandRequest(parsed.request, { entities: [graph.List, graph.Item] }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_reference' } } });
  });
});

describe('data graph Entity Mutation Command protocol', () => {
  const defineBookGraph = () =>
    entity('Book', {
      id: field.id(),
      title: field.nonEmptyString({ trim: true }),
      published: field.default(field.boolean(), false),
      label: field.derived(field.string(), () => ''),
    });

  it('round-trips create and exact-identity mutations and rebuilds normalized values', () => {
    const client = defineBookGraph();
    const server = defineBookGraph();
    const mutation = mutateEntity(client);
    const book = createEntityRef(client, { id: 'book-1' });
    const commands = [
      mutation.create({ id: 'book-1', title: '  Ontahi  ' }),
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

  it('materializes declared Field defaults while resolving a transported create', () => {
    const server = defineBookGraph();
    const request = toGraphCommandRequest({
      kind: 'entity-mutation-command',
      action: 'create',
      entityName: 'Book',
      values: { id: 'book-1', title: '  Ontahi  ' },
    });

    expect(resolveGraphCommandRequest(request, { entities: [server] })).toEqual({
      success: true,
      request,
      command: mutateEntity(server).create({ id: 'book-1', title: 'Ontahi' }),
    });
  });

  it('keeps receiver-generated Fields out of transported mutation inputs', () => {
    const Job = entity('GeneratedJob', {
      id: field.generated(field.id(), 'uuid'),
      title: field.string(),
    });
    const accepted = toGraphCommandRequest(mutateEntity(Job).create({ title: 'Index books' }));

    expect(resolveGraphCommandRequest(accepted, { entities: [Job] })).toEqual({
      success: true,
      request: accepted,
      command: mutateEntity(Job).create({ title: 'Index books' }),
    });

    const supplied = toGraphCommandRequest({
      kind: 'entity-mutation-command',
      action: 'create',
      entityName: 'GeneratedJob',
      values: { id: 'caller-owned', title: 'Index books' },
    });
    expect(resolveGraphCommandRequest(supplied, { entities: [Job] })).toMatchObject({
      success: false,
      error: {
        error: {
          code: 'invalid_payload',
          message: 'Entity Mutation Command cannot assign receiver-generated GeneratedJob.id.',
        },
      },
    });
  });

  it('uses a fail-closed protocol version for conditional exact mutations', () => {
    const client = defineBookGraph();
    const server = defineBookGraph();
    const book = createEntityRef(client, { id: 'book-1' });
    const command = mutateEntity(client).update(
      book,
      { title: '  Revised  ' },
      { if: { title: '  Ontahi  ', published: false } },
    );
    const transported = JSON.parse(JSON.stringify(toGraphCommandRequest(command)));

    expect(transported).toEqual({ version: 2, kind: 'graph-command', command });
    const parsed = parseGraphCommandRequest(transported);
    expect(parsed).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error.error.message);
    expect(resolveGraphCommandRequest(parsed.request, { entities: [server] })).toEqual({
      success: true,
      request: parsed.request,
      command: mutateEntity(server).update(
        createEntityRef(server, { id: 'book-1' }),
        { title: 'Revised' },
        { if: { title: 'Ontahi', published: false } },
      ),
    });

    expect(parseGraphCommandRequest({ ...transported, version: 1 })).toMatchObject({
      success: false,
      error: { error: { code: 'invalid_request' } },
    });
    expect(
      parseGraphCommandRequest({
        ...transported,
        command: { ...transported.command, if: {} },
      }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });
    expect(
      parseGraphCommandRequest({
        version: 2,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'create',
          entityName: 'Book',
          values: { id: 'book-1', title: 'Ontahi', published: false },
          if: { published: false },
        },
      }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_request' } } });
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
      name: 'unknown condition Field',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Book',
        target: { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
        values: { title: 'Revised' },
        if: { sql: 'drop table books' },
      },
      version: 2,
      code: 'invalid_condition',
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
  ])('rejects an $name while rebuilding the server Command', ({ command, code, version = 1 }) => {
    const Book = defineBookGraph();
    const parsed = parseGraphCommandRequest({
      version,
      kind: 'graph-command',
      command,
    });
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
