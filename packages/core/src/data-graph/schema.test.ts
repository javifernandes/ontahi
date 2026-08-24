import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createEntityRef,
  defineDomainOperationMetadata,
  entity,
  field,
  graphOutput,
  graphSchema,
  type InferGraphSchemaClientInput,
  type EntityRef,
  normalizeGraphSchemaClientInput,
  resolveDomainOperations,
  safeParseGraphSchema,
  selection,
  Selection,
  toGraphJsonSchema,
  toGraphOutputDescriptor,
  toGraphSchemaDescriptor,
  toZodSchema,
  value,
} from './index.js';

describe('data-graph schema DSL', () => {
  it('declares excluded string values as a reflected constraint', () => {
    const ListName = field.nonEmptyString({
      trim: true,
      exclude: {
        values: ['archive'],
        caseInsensitive: true,
      },
      messages: {
        exclude: 'Archive is reserved for system use.',
      },
    });

    expect(safeParseGraphSchema(ListName, 'Research')).toEqual({
      success: true,
      data: 'Research',
    });
    expect(safeParseGraphSchema(ListName, '  ARCHIVE  ')).toMatchObject({
      success: false,
      issues: [{ message: 'Archive is reserved for system use.' }],
    });
    expect(toGraphSchemaDescriptor(ListName)).toMatchObject({
      kind: 'scalar',
      stringConstraints: {
        trim: true,
        exclude: {
          values: ['archive'],
          caseInsensitive: true,
        },
        messages: {
          exclude: 'Archive is reserved for system use.',
        },
      },
    });
    expect(toGraphJsonSchema(ListName)).toMatchObject({
      type: 'string',
      'x-ontahi-string-exclusion': {
        values: ['archive'],
        caseInsensitive: true,
        message: 'Archive is reserved for system use.',
      },
    });
  });

  it('derives named value contracts from model fields without duplicating them', () => {
    const Todo = entity('Todo', {
      id: field.id(),
      title: field.nonEmptyString({ trim: true }),
      completed: field.boolean(),
    });
    const CreateTodoInput = graphSchema.pick(Todo, ['id', 'title']).named('CreateTodoInput');

    expect(CreateTodoInput.fields.id).toBe(Todo.fields.id);
    expect(CreateTodoInput.fields.title).toBe(Todo.fields.title);
    expect(CreateTodoInput.fields).not.toHaveProperty('completed');
    expectTypeOf(CreateTodoInput.__value).toEqualTypeOf<
      { id: string; title: string } | undefined
    >();
    expect(
      safeParseGraphSchema(CreateTodoInput, { id: 'todo-1', title: '  Write tests  ' }),
    ).toEqual({
      success: true,
      data: { id: 'todo-1', title: 'Write tests' },
    });
    expect(toGraphSchemaDescriptor(CreateTodoInput)).toMatchObject({
      kind: 'object',
      role: 'value',
      name: 'CreateTodoInput',
      derivedFrom: {
        operation: 'pick',
        source: { kind: 'entity', name: 'Todo' },
        fields: ['id', 'title'],
      },
    });
  });

  it('expresses entity cardinality for inputs and materialized outputs', () => {
    const Todo = entity('Todo', {
      id: field.id(),
      title: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const one = Todo.one();
    const many = Todo.many();
    const array = Todo.array();

    expect({
      one: toGraphSchemaDescriptor(one),
      many: toGraphSchemaDescriptor(many),
      array: toGraphOutputDescriptor(array),
    }).toEqual({
      one: {
        kind: 'selection',
        entityName: 'Todo',
        cardinality: 'one',
        identity: { name: 'refById', fields: ['id'] },
      },
      many: {
        kind: 'selection',
        entityName: 'Todo',
        cardinality: 'many',
        identity: { name: 'refById', fields: ['id'] },
      },
      array: {
        kind: 'graph-output.array',
        item: { kind: 'graph-output.entity', entity: Todo },
      },
    });
    expectTypeOf<string>().toMatchTypeOf<InferGraphSchemaClientInput<typeof one>>();
    expectTypeOf<string[]>().toMatchTypeOf<InferGraphSchemaClientInput<typeof many>>();
    expectTypeOf(array.__value).toEqualTypeOf<{ id: string; title: string }[] | undefined>();
  });

  it('describes, transports, and validates entity selections as operation values', () => {
    const Book = entity('Book', {
      id: field.id(),
      status: field.string(),
    });
    const DeleteBooksInput = value('DeleteBooksInput', {
      books: graphSchema.selection(Book, { cardinality: 'one' }),
    });
    const authored = selection(Book, book => book.status.eq('archived'));
    const transported = JSON.parse(JSON.stringify({ books: authored }));
    const parsed = safeParseGraphSchema(DeleteBooksInput, transported);

    expect(transported).toEqual({
      books: {
        kind: 'selection',
        entityName: 'Book',
        expression: {
          kind: 'predicate',
          operator: 'eq',
          fieldName: 'status',
          value: 'archived',
        },
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.books).toBeInstanceOf(Selection);
      expect(parsed.data.books.root).toBe(Book);
      expect(parsed.data.books.build()).toEqual(authored.build());
      expect(parsed.data.books.cardinality).toBe('one');
    }
    expect(toGraphSchemaDescriptor(DeleteBooksInput)).toMatchObject({
      fields: {
        books: { kind: 'selection', entityName: 'Book', cardinality: 'one' },
      },
    });
    expect(toGraphJsonSchema(DeleteBooksInput)).toMatchObject({
      properties: {
        books: {
          type: 'object',
          'x-ontahi-selection': { entityName: 'Book', cardinality: 'one' },
          properties: { entityName: { const: 'Book' } },
        },
      },
    });
    expect(
      safeParseGraphSchema(DeleteBooksInput, {
        books: {
          kind: 'selection',
          entityName: 'Book',
          expression: {
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'missing',
            value: 'x',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('normalizes ergonomic client selection inputs through the default identity', () => {
    const Todo = entity('Todo', {
      id: field.id(),
      title: field.string(),
      completed: field.boolean(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const inputSchema = graphSchema.object({
      todos: graphSchema.selection(Todo, { cardinality: 'many' }),
    });
    type ClientInput = InferGraphSchemaClientInput<typeof inputSchema>;

    expectTypeOf<{ todos: string[] }>().toMatchTypeOf<ClientInput>();
    expectTypeOf<{
      todos: { id: string; title: string; completed: boolean }[];
    }>().toMatchTypeOf<ClientInput>();
    expect(
      JSON.parse(
        JSON.stringify(
          normalizeGraphSchemaClientInput(inputSchema, {
            todos: ['todo-1', { id: 'todo-2', title: 'Second', completed: false }],
          }),
        ),
      ),
    ).toEqual({
      todos: {
        kind: 'selection',
        entityName: 'Todo',
        expression: {
          kind: 'references',
          refs: [
            {
              kind: 'entity-ref',
              entityName: 'Todo',
              locator: { id: 'todo-1' },
            },
            {
              kind: 'entity-ref',
              entityName: 'Todo',
              locator: { id: 'todo-2' },
            },
          ],
        },
      },
    });
  });

  it('keeps schema-native Ref client inputs portable', () => {
    const Book = entity('SchemaClientBook', { id: field.id() });
    const inputSchema = graphSchema.object({ book: graphSchema.ref(Book) });
    type ClientInput = InferGraphSchemaClientInput<typeof inputSchema>;
    const book = createEntityRef(Book, { id: 'book-1' });

    expectTypeOf<ClientInput>().toEqualTypeOf<{ book: EntityRef<'SchemaClientBook'> }>();
    expect(normalizeGraphSchemaClientInput(inputSchema, { book })).toEqual({ book });
  });

  it('recognizes selections created by another loaded Ontahi entrypoint', () => {
    const Book = entity('CrossEntrypointBook', {
      id: field.id(),
      status: field.string(),
    });
    const Input = value('CrossEntrypointInput', {
      books: graphSchema.selection(Book, { cardinality: 'many' }),
    });
    const authored = selection(Book, book => book.status.eq('draft'));
    const foreignSelection = {
      root: authored.root,
      expression: authored.expression,
      toAst: () => authored.toAst(),
      build: () => authored.build(),
      [Symbol.for('@ontahi/core/data-graph/selection')]: true,
    };

    expect(foreignSelection).not.toBeInstanceOf(Selection);
    expect(normalizeGraphSchemaClientInput(Input, { books: foreignSelection })).toMatchObject({
      books: foreignSelection,
    });
    expect(safeParseGraphSchema(Input, { books: foreignSelection })).toMatchObject({
      success: true,
      data: {
        books: {
          root: Book,
          expression: authored.expression,
          cardinality: 'many',
        },
      },
    });
  });

  it('validates statically knowable selection cardinality and defers predicates', () => {
    const Book = entity('CardinalityBook', { id: field.id(), status: field.string() })
      .locators({ refById: 'id' })
      .identity('refById');
    const Input = value('OneBookInput', {
      book: graphSchema.selection(Book, { cardinality: 'one' }),
    });
    const reference = (id: string) => ({
      kind: 'entity-ref' as const,
      entityName: 'CardinalityBook' as const,
      locator: { id },
    });

    expect(safeParseGraphSchema(Input, { book: Selection.none(Book).toAst() }).success).toBe(false);
    expect(
      safeParseGraphSchema(Input, { book: Selection.references(Book, []).toAst() }).success,
    ).toBe(false);
    expect(
      safeParseGraphSchema(Input, {
        book: Selection.references(Book, [reference('book-1'), reference('book-2')]).toAst(),
      }).success,
    ).toBe(false);

    const parsedReference = safeParseGraphSchema(Input, {
      book: Selection.references(Book, [reference('book-1')]).toAst(),
    });
    const parsedPredicate = safeParseGraphSchema(Input, {
      book: selection(Book, book => book.status.eq('draft')).toAst(),
    });

    expect(parsedReference.success).toBe(true);
    expect(parsedPredicate.success).toBe(true);
    if (parsedPredicate.success) expect(parsedPredicate.data.book.cardinality).toBe('one');
  });

  it('validates and rehydrates selections defined by references', () => {
    const Book = entity('BookReferenceTarget', {
      id: field.id(),
      slug: field.string(),
    })
      .locators({ refById: 'id', refBySlug: 'slug' })
      .identity('refById');
    const Input = value('ArchiveBooksInput', {
      books: graphSchema.selection(Book),
    });
    const references = Selection.references(Book, [
      { kind: 'entity-ref', entityName: 'BookReferenceTarget', locator: { id: 'book-1' } },
    ]);

    expect(safeParseGraphSchema(Input, { books: references.toAst() })).toMatchObject({
      success: true,
    });
    expect(toGraphJsonSchema(Input)).toMatchObject({
      properties: {
        books: {
          'x-ontahi-selection': {
            identity: { name: 'refById', fields: ['id'] },
          },
        },
      },
    });
    expect(
      safeParseGraphSchema(Input, {
        books: {
          kind: 'selection',
          entityName: 'BookReferenceTarget',
          expression: {
            kind: 'references',
            refs: [
              {
                kind: 'entity-ref',
                entityName: 'BookReferenceTarget',
                locator: { missing: 'book-1' },
              },
            ],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('uses entity definitions as graph schemas and Zod adapter inputs', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');

    const schema = toZodSchema(Book);

    expect(schema.parse({ id: 'book-1', slug: 'progbook', title: 'Progbook' })).toEqual({
      id: 'book-1',
      slug: 'progbook',
      title: 'Progbook',
    });
    expect(toGraphOutputDescriptor(Book)).toEqual(graphOutput.entity(Book));
  });

  it('preserves basic field constraints when generating Zod schemas', () => {
    const BookStats = value('BookStats', {
      id: field.id(),
      slug: field.slug(),
      title: field.nonEmptyString(),
      chapterCount: field.nonNegativeInteger(),
      pageCount: field.positiveInteger({ max: 5000 }),
    });
    const schema = toZodSchema(BookStats);

    expect(
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0,
        pageCount: 120,
      }),
    ).toEqual({
      id: 'book-1',
      slug: 'progbook',
      title: 'Programming',
      chapterCount: 0,
      pageCount: 120,
    });
    expect(() =>
      schema.parse({
        id: '',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0,
        pageCount: 120,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: '',
        chapterCount: -1,
        pageCount: 120,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0.5,
        pageCount: 120,
      }),
    ).toThrow();
    expect(() =>
      schema.parse({
        id: 'book-1',
        slug: 'progbook',
        title: 'Programming',
        chapterCount: 0,
        pageCount: 5001,
      }),
    ).toThrow();
  });

  it('describes and validates composed graph-native operation schemas without exposing Zod', () => {
    const OperationInput = value('OperationInput', {
      installationId: field.string({ trim: true, pattern: /^\d+$/ }),
      email: field.email({ maxLength: 200 }),
      limit: graphSchema.default(graphSchema.optional(field.integer({ min: 1, max: 100 })), 20),
      mode: graphSchema.discriminatedUnion('kind', [
        graphSchema.object({
          kind: graphSchema.literal('chapter'),
          slug: field.nonEmptyString(),
        }),
        graphSchema.object({
          kind: graphSchema.literal('book'),
          includeDrafts: graphSchema.optional(field.boolean()),
        }),
      ]),
      metadata: graphSchema.optional(graphSchema.record(field.json())),
    });

    expect(
      safeParseGraphSchema(OperationInput, {
        installationId: ' 123 ',
        email: 'reader@example.com',
        mode: { kind: 'chapter', slug: 'intro' },
      }),
    ).toMatchObject({
      success: true,
      data: {
        installationId: '123',
        email: 'reader@example.com',
        limit: 20,
      },
    });
    expect(
      safeParseGraphSchema(OperationInput, {
        installationId: 'not-a-number',
        email: 'invalid',
        mode: { kind: 'chapter', slug: '' },
      }).success,
    ).toBe(false);
    expect(toGraphSchemaDescriptor(OperationInput)).toMatchObject({
      kind: 'object',
      role: 'value',
      name: 'OperationInput',
      fields: {
        installationId: {
          kind: 'scalar',
          stringConstraints: {
            trim: true,
            pattern: { source: '^\\d+$' },
          },
        },
        email: {
          kind: 'scalar',
          stringConstraints: { format: 'email', maxLength: 200 },
        },
      },
    });
    expect(toGraphJsonSchema(OperationInput)).toMatchObject({
      type: 'object',
      required: ['installationId', 'email', 'mode'],
      properties: {
        installationId: { type: 'string', pattern: '^\\d+$' },
        email: { type: 'string', format: 'email', maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        mode: { anyOf: expect.any(Array) },
      },
    });
  });

  it('defines entity views that include entity fields by default and add derived fields', () => {
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      threadId: field.id(),
      body: field.string(),
      internalModerationFlag: field.boolean(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const ThreadMessageAuthor = value('ThreadMessageAuthor', {
      id: field.id(),
      displayName: field.nullable(field.string()),
    });
    const ThreadMessage = CommentMessage.view('ThreadMessage', {
      omit: ['internalModerationFlag'] as const,
      fields: {
        author: ThreadMessageAuthor,
      },
    });

    const schema = toZodSchema(ThreadMessage);

    expect(
      schema.parse({
        id: 'message-1',
        threadId: 'thread-1',
        body: 'hello',
        author: {
          id: 'user-1',
          displayName: null,
        },
      }),
    ).toEqual({
      id: 'message-1',
      threadId: 'thread-1',
      body: 'hello',
      author: {
        id: 'user-1',
        displayName: null,
      },
    });
    expect(() =>
      schema.parse({
        id: 'message-1',
        threadId: 'thread-1',
        body: 'hello',
      }),
    ).toThrow();
    expect(toGraphOutputDescriptor(ThreadMessage)).toEqual(graphOutput.entity(CommentMessage));
  });

  it('derives normalized output metadata from graph values with nested entity views', () => {
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      body: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const CommentThread = entity('CommentThread', {
      id: field.id(),
      state: field.enum(['open', 'resolved'] as const),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const ThreadMessage = CommentMessage.view('ThreadMessage');
    const ConversationThread = CommentThread.view('ConversationThread', {
      fields: {
        messages: graphSchema.array(ThreadMessage),
      },
    });
    const ListThreadsForChapterResult = value('ListThreadsForChapterResult', {
      threads: graphSchema.array(ConversationThread),
    });

    expect(toGraphOutputDescriptor(ListThreadsForChapterResult)).toEqual(
      graphOutput.object({
        threads: graphOutput.array(
          graphOutput.entity(CommentThread, {
            messages: graphOutput.array(graphOutput.entity(CommentMessage)),
          }),
        ),
      }),
    );
    expect(
      toZodSchema(ListThreadsForChapterResult).parse({
        threads: [
          {
            id: 'thread-1',
            state: 'open',
            messages: [{ id: 'message-1', body: 'hello' }],
          },
        ],
      }),
    ).toEqual({
      threads: [
        {
          id: 'thread-1',
          state: 'open',
          messages: [{ id: 'message-1', body: 'hello' }],
        },
      ],
    });
  });

  it('lets domain operations use graph-native schemas as output contracts', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const FetchBooksResult = value('FetchBooksResult', {
      books: graphSchema.array(Book),
    });

    const operations = resolveDomainOperations('Book', {
      fetchBooks: defineDomainOperationMetadata({
        exposure: 'bridge',
        output: FetchBooksResult,
      }),
    });

    expect(operations.fetchBooks.output).toBe(FetchBooksResult);
    expect(operations.fetchBooks.graphOutput).toEqual(
      graphOutput.object({
        books: graphOutput.array(graphOutput.entity(Book)),
      }),
    );
  });
});
