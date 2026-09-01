import {
  createEntityRef,
  definePortableOperationConditionRegistry,
  entity,
  evaluatePortableOperationCondition,
  field,
  graphSchema,
  modelExpression,
  value,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { buildExplorerSnapshot, getExplorerEntityDetail } from './index.js';

describe('explorer descriptor builder', () => {
  it('builds reflected entity, operation, task, ingress, and event descriptors', () => {
    const OperationBook = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({ refBySlug: 'slug' });
    const publishConditions = definePortableOperationConditionRegistry({
      version: 1,
      operations: {
        'Book.publish': {
          pre: [
            {
              name: 'differentBooks',
              expression: modelExpression.define(
                modelExpression.not(
                  modelExpression.ref('book').is(modelExpression.ref('otherBook')),
                ),
              ),
            },
          ],
        },
      },
    }).operations['Book.publish'];
    const snapshot = buildExplorerSnapshot({
      entities: [
        {
          name: 'Book',
          fields: {
            id: { fieldType: 'id' },
            title: { fieldType: 'string' },
            slug: { fieldType: 'string' },
          },
          relations: {
            chapters: {
              relationKind: 'hasMany',
              target: { name: 'Chapter' },
            },
          },
          graph: { exposure: 'public' },
          displayMetadata: {
            primary: 'title',
            secondary: ['slug'],
            search: ['title', 'slug'],
          },
        },
      ],
      graphSummary: {
        entities: [
          {
            name: 'Book',
            graphOperationNames: ['load'],
            domainOperationNames: ['load', 'publish'],
            durableOperationNames: ['publish'],
            taskNames: ['sync'],
          },
        ],
      },
      graphOperations: [
        {
          id: 'Book.load',
          entityName: 'Book',
          name: 'load',
          authority: 'graph',
          exposure: 'public',
          input: value('LoadBookInput', { slug: field.string() }),
          output: value('LoadBookOutput', { title: field.string() }),
        },
      ],
      domainOperations: [
        {
          id: 'Book.load',
          entityName: 'Book',
          name: 'load',
          authority: 'domain',
          exposure: 'bridge',
        },
        {
          id: 'Book.publish',
          entityName: 'Book',
          name: 'publish',
          authority: 'domain',
          exposure: 'bridge',
          execution: { atomicity: 'required' },
          conditions: publishConditions,
          input: graphSchema.object({
            book: graphSchema.ref(OperationBook),
            otherBook: graphSchema.ref(OperationBook),
          }),
          durable: {
            taskId: 'book.publish',
            runtime: 'test-runtime',
            progress: value('PublishBookProgress', { percent: field.number() }),
            finalOutput: value('PublishBookOutput', { published: field.boolean() }),
            subject: {},
            idempotency: { policy: 'semantic' },
          },
        },
      ],
      tasks: [{ id: 'Book.sync', entityName: 'Book', name: 'sync' }],
      getTaskDefinition: () => ({
        input: value('SyncBookInput', { slug: field.string() }),
        progress: value('SyncBookProgress', { percent: field.number() }),
        output: value('SyncBookOutput', { published: field.boolean() }),
        steps: {
          fetch: {
            id: 'fetch',
            input: value('FetchBookStepInput', { slug: field.string() }),
            output: value('FetchBookStepOutput', { title: field.string() }),
          },
        },
      }),
      events: [
        {
          type: 'book_published',
          domain: 'publishing',
          actorScoped: true,
          payloadFields: [{ name: 'bookSlug', type: 'string' }],
          relatedEntities: ['Book'],
          handlers: ['notify'],
        },
      ],
      httpIngress: [
        {
          operationId: 'Book.publish',
          kind: 'http',
          method: 'POST',
          route: '/api/books/publish',
          provider: 'test',
          channel: 'books.publish',
        },
      ],
    });

    expect(snapshot.metrics).toEqual([
      { label: 'Entity kinds', value: 1 },
      { label: 'Operations', value: 2 },
      { label: 'Tasks', value: 1 },
      { label: 'Event kinds', value: 1 },
    ]);
    expect(snapshot.entities[0]).toEqual(
      expect.objectContaining({
        name: 'Book',
        display: {
          primary: 'title',
          secondary: ['slug'],
          search: ['title', 'slug'],
        },
      }),
    );
    expect(snapshot.operations.map(operation => operation.id)).toEqual([
      'Book.load',
      'Book.publish',
    ]);
    expect(snapshot.operations.find(operation => operation.id === 'Book.publish')).toEqual(
      expect.objectContaining({
        kind: 'durable',
        execution: { atomicity: 'required' },
        conditions: publishConditions,
        durable: {
          taskId: 'book.publish',
          runtime: 'test-runtime',
          hasSubject: true,
          idempotencyPolicy: 'semantic',
          runRefSchema: expect.objectContaining({
            source: 'ontahi',
            summary: 'object with 4 fields',
          }),
          progressSchema: expect.objectContaining({
            source: 'ontahi',
            summary: 'object with 1 field',
          }),
          finalOutputSchema: expect.objectContaining({
            source: 'ontahi',
            summary: 'object with 1 field',
          }),
        },
        ingressRoutes: [
          {
            kind: 'http',
            method: 'POST',
            route: '/api/books/publish',
            provider: 'test',
            channel: 'books.publish',
          },
        ],
        inputRefs: [
          {
            path: 'book',
            entityName: 'Book',
            receiver: false,
            optional: false,
            locators: [
              {
                name: 'refById',
                fields: ['book'],
                sourceFields: ['id'],
              },
              {
                name: 'refBySlug',
                fields: ['book'],
                sourceFields: ['slug'],
              },
            ],
          },
          {
            path: 'otherBook',
            entityName: 'Book',
            receiver: false,
            optional: false,
            locators: [
              {
                name: 'refById',
                fields: ['otherBook'],
                sourceFields: ['id'],
              },
              {
                name: 'refBySlug',
                fields: ['otherBook'],
                sourceFields: ['slug'],
              },
            ],
          },
        ],
      }),
    );
    const sameBook = createEntityRef(OperationBook, { slug: 'same-book' });
    expect(
      evaluatePortableOperationCondition(publishConditions.pre[0], {
        book: sameBook,
        otherBook: sameBook,
      }),
    ).toEqual({
      status: 'rejected',
      rejection: {
        reason: 'operation_condition_rejected',
        message: 'Operation condition "differentBooks" was not satisfied.',
      },
    });
    expect(snapshot.tasks[0]?.steps[0]?.inputSchema).toEqual(
      expect.objectContaining({
        source: 'ontahi',
        summary: 'object with 1 field',
      }),
    );
    expect(snapshot.tasks[0]?.steps[0]?.resultSchema).toEqual(
      expect.objectContaining({
        source: 'ontahi',
        summary: 'object with 1 field',
      }),
    );
    expect(snapshot.tasks[0]).toEqual(
      expect.objectContaining({
        progressSchema: expect.objectContaining({ summary: 'object with 1 field' }),
        resultSchema: expect.objectContaining({ summary: 'object with 1 field' }),
      }),
    );
  });

  it('derives optional Ref controls from the Operation input schema', () => {
    const Book = entity('Book', { id: field.id() });
    const snapshot = buildExplorerSnapshot({
      entities: [Book],
      domainOperations: [
        {
          id: 'Book.inspect',
          entityName: 'Book',
          name: 'inspect',
          authority: 'server',
          exposure: 'bridge',
          input: graphSchema.object({
            book: graphSchema.optional(field.ref(Book)),
          }),
        },
      ],
    });

    expect(snapshot.operations[0]?.inputRefs).toEqual([
      {
        path: 'book',
        entityName: 'Book',
        receiver: false,
        optional: true,
        locators: [
          {
            name: 'refById',
            fields: ['book'],
            sourceFields: ['id'],
          },
        ],
      },
    ]);
  });

  it('reflects a direct Entity Operation result for contextual relation actions', () => {
    const List = entity('RelationActionList', { id: field.id() });
    const Item = entity('RelationActionItem', {
      id: field.id(),
      list: field.ref(List),
      title: field.string(),
    });
    const snapshot = buildExplorerSnapshot({
      entities: [List, Item],
      domainOperations: [
        {
          id: 'RelationActionItem.create',
          entityName: 'RelationActionItem',
          name: 'create',
          authority: 'server',
          exposure: 'bridge',
          input: graphSchema.pick(Item, ['id', 'list', 'title']),
          output: Item,
        },
      ],
    });

    expect(snapshot.operations[0]).toEqual(
      expect.objectContaining({ resultEntityName: 'RelationActionItem' }),
    );
  });

  it('reflects when an Operation Ref requires an existing participant', () => {
    const Book = entity('ExistingInputBook', { id: field.id() });
    const snapshot = buildExplorerSnapshot({
      entities: [Book],
      domainOperations: [
        {
          id: 'ExistingInputBook.inspect',
          entityName: 'ExistingInputBook',
          name: 'inspect',
          authority: 'server',
          exposure: 'bridge',
          input: graphSchema.object({ book: graphSchema.existingRef(Book) }),
        },
      ],
    });

    expect(snapshot.operations[0]?.inputRefs).toEqual([
      expect.objectContaining({
        path: 'book',
        entityName: 'ExistingInputBook',
        resolution: 'existing',
      }),
    ]);
  });

  it('builds entity details with relation diagrams', () => {
    const detail = getExplorerEntityDetail(
      {
        entities: [
          {
            name: 'Book',
            fields: {
              id: { fieldType: 'id' },
              status: { fieldType: 'enum', enumValues: ['draft', 'published'] },
              accent: { fieldType: 'string', valueType: 'Color' },
            },
            relations: {
              chapters: {
                relationKind: 'hasMany',
                target: { name: 'Chapter' },
              },
            },
          },
        ],
      },
      'Book',
    );

    expect(detail).toEqual(
      expect.objectContaining({
        name: 'Book',
        fields: expect.arrayContaining([
          {
            name: 'status',
            type: 'enum',
            nullable: false,
            enumValues: ['draft', 'published'],
          },
          {
            name: 'accent',
            type: 'Color',
            nullable: false,
            enumValues: undefined,
          },
        ]),
        relations: [
          expect.objectContaining({
            name: 'chapters',
            kind: 'hasMany',
            target: 'Chapter',
            cardinality: 'many',
          }),
        ],
      }),
    );
    expect(detail?.diagram).toContain('Book');
    expect(detail?.diagram).toContain('chapters (hasMany)');
  });

  it('reflects semantic relation affordances and portable entity identity', () => {
    const Course = entity('Course', { id: field.id(), title: field.string() })
      .display({ primary: 'title' })
      .manyToMany('topics', entity('Topic', { id: field.id(), label: field.string() }));
    const Student = entity('Student', {
      id: field.id(),
      course: field.nullable(field.ref(Course)),
    });
    Course.hasMany('students', Student, { via: 'course' });

    const student = getExplorerEntityDetail({ entities: [Student, Course] }, 'Student');
    const course = getExplorerEntityDetail({ entities: [Student, Course] }, 'Course');

    expect(student).toMatchObject({
      identity: { name: 'refById', fields: ['id'] },
      entityRole: { kind: 'unknown' },
      fields: [
        { name: 'id', type: 'id', nullable: false },
        {
          name: 'course',
          type: 'reference',
          nullable: true,
          reference: {
            entityName: 'Course',
            identity: { name: 'refById', fields: ['id'] },
            display: { primary: 'title' },
          },
        },
      ],
      relations: [
        {
          name: 'course',
          kind: 'belongsTo',
          target: 'Course',
          direction: 'forward',
          cardinality: 'one',
          nullable: true,
          required: false,
          structuralVerbs: ['assign', 'clear'],
          canonicalIdentity: {
            sourceEntityName: 'Student',
            fieldName: 'course',
            targetEntityName: 'Course',
          },
        },
      ],
    });
    expect(course?.relations).toEqual([
      expect.objectContaining({
        name: 'topics',
        kind: 'manyToMany',
        direction: 'forward',
        cardinality: 'many',
        structuralVerbs: ['add', 'remove'],
      }),
      expect.objectContaining({
        name: 'students',
        kind: 'hasMany',
        direction: 'inverse',
        cardinality: 'many',
        structuralVerbs: ['add', 'remove'],
        canonicalIdentity: {
          sourceEntityName: 'Student',
          fieldName: 'course',
          targetEntityName: 'Course',
        },
      }),
    ]);
  });

  it('presents inverse endpoints derived by schema reflection', () => {
    const TodoList = entity('TodoList', { id: field.id(), name: field.string() });
    const Tag = entity('Tag', { id: field.id(), name: field.string() });
    const TodoItem = entity('TodoItem', {
      id: field.id(),
      list: field.ref(TodoList),
    }).manyToMany('tags', Tag);
    const entities = [TodoList, Tag, TodoItem];

    expect(getExplorerEntityDetail({ entities }, 'TodoList')?.relations).toContainEqual(
      expect.objectContaining({
        name: 'TodoItem.list',
        target: 'TodoItem',
        kind: 'hasMany',
        provenance: 'derived-inverse',
        direction: 'inverse',
        cardinality: 'many',
        structuralVerbs: [],
      }),
    );
    expect(getExplorerEntityDetail({ entities }, 'Tag')?.relations).toContainEqual(
      expect.objectContaining({
        name: 'TodoItem.tags',
        target: 'TodoItem',
        kind: 'manyToMany',
        provenance: 'derived-inverse',
        direction: 'inverse',
        cardinality: 'many',
        structuralVerbs: [],
      }),
    );
    expect(
      buildExplorerSnapshot({ entities }).entities.map(({ name, relationCount }) => ({
        name,
        relationCount,
      })),
    ).toEqual([
      { name: 'TodoList', relationCount: 1 },
      { name: 'Tag', relationCount: 1 },
      { name: 'TodoItem', relationCount: 2 },
    ]);
  });

  it('classifies only explicitly reflected relation owners as association entities', () => {
    const ordinary = getExplorerEntityDetail(
      {
        entities: [
          {
            kind: 'entity',
            name: 'MembershipRequest',
            fields: { team: { fieldType: 'reference' }, user: { fieldType: 'reference' } },
          },
        ],
      },
      'MembershipRequest',
    );
    const association = getExplorerEntityDetail(
      {
        entities: [
          {
            kind: 'graph-relation',
            name: 'Enrollment',
            fields: { status: { fieldType: 'string' } },
            relation: {
              source: 'Student',
              name: 'enrollments',
              cardinality: 'many',
              target: 'Course',
            },
          },
        ],
      },
      'Enrollment',
    );

    expect(ordinary?.entityRole).toEqual({ kind: 'unknown' });
    expect(association?.entityRole).toEqual({
      kind: 'association',
      participants: ['Student', 'Course'],
    });
  });

  it('reflects derived Fields with their exact read-only dependencies', () => {
    const Course = entity('DerivedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(
          modelExpression.subtract(
            modelExpression.field('capacity'),
            modelExpression.relation('students').count(),
          ),
        ),
      ),
    });
    const Student = entity('DerivedStudent', {
      id: field.id(),
      course: field.ref(Course),
    });
    const detail = getExplorerEntityDetail(
      { entities: [Course.hasMany('students', Student, { via: 'course' }), Student] },
      'DerivedCourse',
    );

    expect(detail?.fields).toContainEqual({
      name: 'availableSeats',
      type: 'number',
      nullable: false,
      enumValues: undefined,
      derived: {
        dependencies: [
          { kind: 'field', field: 'capacity' },
          { kind: 'relation-aggregate', relation: 'students', aggregate: 'count' },
        ],
      },
    });
  });
});
