import {
  compileQueryPlan,
  createEntityRef,
  createRelatedRootReadSpec,
  entity,
  field,
  mapEntity,
  mapRelation,
  relationConstraint,
  query,
  relationshipSet,
  resolveQuerySpec,
  Selection,
  selection,
  selectionNot,
  selectionOr,
} from '@ontahi/core/data-graph';
import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createSupabaseDataGraphRuntime,
  compileSupabaseManyToManyRpcPayload,
  executeSupabaseGraphCountEffect,
  executeSupabaseGraphCommandEffect,
  executeSupabaseGraphQueryEffect,
  executeSupabaseManyToManyRelationshipCommandEffect,
  fetchSupabaseEntityRowsEffect,
  hydrateSupabaseEntityRowsEffect,
  materializeSupabaseEntityRow,
  supabaseManyToManyRpcSql,
  toSupabaseEntityRow,
} from '../../src/data-graph/index.js';

import { defineAudienceGraph, expectedAudienceResult } from './fixtures.js';

type QueryResult = {
  count?: number | null;
  data?: unknown;
  error?: { message: string } | null;
};

type QueryOperation = {
  method: string;
  args: unknown[];
};

class TestQueryBuilder implements PromiseLike<QueryResult> {
  readonly operations: QueryOperation[] = [];

  constructor(
    readonly table: string,
    private readonly result: QueryResult,
  ) {}

  private chain(method: string, ...args: unknown[]) {
    this.operations.push({ method, args });
    return this;
  }

  select(...args: unknown[]) {
    return this.chain('select', ...args);
  }

  eq(...args: unknown[]) {
    return this.chain('eq', ...args);
  }

  in(...args: unknown[]) {
    return this.chain('in', ...args);
  }

  is(...args: unknown[]) {
    return this.chain('is', ...args);
  }

  order(...args: unknown[]) {
    return this.chain('order', ...args);
  }

  limit(...args: unknown[]) {
    return this.chain('limit', ...args);
  }

  lt(...args: unknown[]) {
    return this.chain('lt', ...args);
  }

  lte(...args: unknown[]) {
    return this.chain('lte', ...args);
  }

  gt(...args: unknown[]) {
    return this.chain('gt', ...args);
  }

  gte(...args: unknown[]) {
    return this.chain('gte', ...args);
  }

  or(...args: unknown[]) {
    return this.chain('or', ...args);
  }

  insert(...args: unknown[]) {
    return this.chain('insert', ...args);
  }

  update(...args: unknown[]) {
    return this.chain('update', ...args);
  }

  delete(...args: unknown[]) {
    return this.chain('delete', ...args);
  }

  upsert(...args: unknown[]) {
    return this.chain('upsert', ...args);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

class TestSupabaseDouble {
  readonly queries: TestQueryBuilder[] = [];
  private readonly queryQueue: Array<{ table: string; result: QueryResult }> = [];

  queueQuery(table: string, result: QueryResult) {
    this.queryQueue.push({ table, result });
  }

  from(table: string) {
    const index = this.queryQueue.findIndex(entry => entry.table === table);
    if (index === -1) {
      throw new Error(`No queued query result for table "${table}"`);
    }

    const [{ result }] = this.queryQueue.splice(index, 1);
    const query = new TestQueryBuilder(table, result);
    this.queries.push(query);
    return query;
  }
}

const createError = ({ message, cause }: { message: string; logMessage: string; cause: unknown }) =>
  new Error(`${message}: ${String(cause)}`);

describe('data-graph supabase runtime helpers', () => {
  it('fetches rows using compiled metadata and maps columns back to entity fields', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const bookQuery = query(Book).where(book => book.ownerId.eq('owner-1'));
    const spec = resolveQuerySpec(bookQuery, undefined);
    const plan = compileQueryPlan(bookQuery, undefined);
    const supabase = new TestSupabaseDouble();

    supabase.queueQuery('books', {
      data: [{ id: 'book-1', owner_id: 'owner-1', title: 'Book' }],
      error: null,
    });

    const rows = await Effect.runPromise(
      fetchSupabaseEntityRowsEffect({
        supabase,
        entityDefinition: Book,
        predicates: [],
        orderBy: spec.orderBy,
        selectShape: spec.select,
        includeShape: spec.includes,
        tableName: plan.rootTable,
        compiledWhere: plan.where,
        compiledOrderBy: plan.orderBy,
        message: 'Failed to load books',
        createError,
      }),
    );

    expect(rows).toEqual([{ id: 'book-1', ownerId: 'owner-1', title: 'Book' }]);
    expect(supabase.queries[0]?.operations).toEqual([
      {
        method: 'select',
        args: ['id, owner_id, title'],
      },
      {
        method: 'eq',
        args: ['owner_id', 'owner-1'],
      },
    ]);
  });

  it('hydrates nested includes through compiled relation plans', async () => {
    const { BookWithCollaborators } = defineAudienceGraph();
    const audienceQuery = query(BookWithCollaborators).include(book => ({
      collaborators: book.collaborators.include(collaborator => ({
        profile: collaborator.profile,
      })),
    }));
    const spec = resolveQuerySpec(audienceQuery, undefined);
    const plan = compileQueryPlan(audienceQuery, undefined);
    const supabase = {} as TestSupabaseDouble;

    const fetchEntityRowsEffectMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Effect.succeed([
          { bookId: 'book-1', userId: 'user-2' },
          { bookId: 'book-1', userId: 'user-3' },
        ]),
      )
      .mockImplementationOnce(() =>
        Effect.succeed([
          { id: 'user-2', email: 'ada@example.com', displayName: 'Ada' },
          { id: 'user-3', email: 'linus@example.com', displayName: 'Linus' },
        ]),
      );

    const rows = await Effect.runPromise(
      hydrateSupabaseEntityRowsEffect({
        supabase,
        rows: [{ id: 'book-1', slug: 'progbook', title: 'Progbook' }],
        includeShape: spec.includes,
        includePlans: plan.includes,
        fetchEntityRowsEffect: fetchEntityRowsEffectMock,
        createError,
      }),
    );

    expect(fetchEntityRowsEffectMock).toHaveBeenNthCalledWith(1, {
      supabase,
      entityDefinition: spec.includes!.collaborators.toNodeSpec().entity,
      predicates: [{ operator: 'in', fieldName: 'bookId', values: ['book-1'] }],
      orderBy: [],
      limit: undefined,
      selectShape: undefined,
      includeShape: spec.includes!.collaborators.toNodeSpec().includes,
      tableName: 'book_collaborators',
      message: 'Failed to load BookCollaborator records',
      compiledWhere: [
        {
          operator: 'in',
          field: 'bookId',
          column: 'book_id',
          values: ['book-1'],
        },
      ],
      compiledOrderBy: [],
      createError,
    });
    expect(fetchEntityRowsEffectMock).toHaveBeenNthCalledWith(2, {
      supabase,
      entityDefinition: spec.includes!.collaborators.toNodeSpec().includes!.profile.toNodeSpec()
        .entity,
      predicates: [{ operator: 'in', fieldName: 'id', values: ['user-2', 'user-3'] }],
      orderBy: [],
      limit: undefined,
      selectShape: undefined,
      includeShape: undefined,
      tableName: 'profiles',
      message: 'Failed to load Profile records',
      compiledWhere: [
        {
          operator: 'in',
          field: 'id',
          column: 'id',
          values: ['user-2', 'user-3'],
        },
      ],
      compiledOrderBy: [],
      createError,
    });
    expect(rows).toEqual([expectedAudienceResult]);
  });

  it('hydrates many-to-many includes through anonymous edge storage', async () => {
    const Tag = entity('Tag', { id: field.id(), label: field.string() });
    const Todo = entity('Todo', { id: field.id(), title: field.string() }).manyToMany('tags', Tag);
    mapEntity(Todo).toTable('todos');
    mapEntity(Tag).toTable('tags');
    mapRelation(Todo, 'tags', {
      type: 'many-to-many',
      from: 'todos.id',
      through: { table: 'todo_tags', fromColumn: 'todo_id', toColumn: 'tag_id' },
      to: 'tags.id',
    });
    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('todos', {
      data: [{ id: 'todo-1', title: 'Write semantics' }],
      error: null,
    });
    supabase.queueQuery('todo_tags', {
      data: [
        { todo_id: 'todo-1', tag_id: 'tag-2' },
        { todo_id: 'todo-1', tag_id: 'tag-1' },
      ],
      error: null,
    });
    supabase.queueQuery('tags', {
      data: [
        { id: 'tag-1', label: 'Core' },
        { id: 'tag-2', label: 'Relations' },
      ],
      error: null,
    });

    await expect(
      Effect.runPromise(
        executeSupabaseGraphQueryEffect(
          { getClient: () => Effect.succeed(supabase), createError },
          query(Todo).include(todo => ({ tags: todo.tags.orderBy(tag => tag.label) })),
          undefined,
        ),
      ),
    ).resolves.toEqual([
      {
        id: 'todo-1',
        title: 'Write semantics',
        tags: [
          { id: 'tag-1', label: 'Core' },
          { id: 'tag-2', label: 'Relations' },
        ],
      },
    ]);
    expect(supabase.queries.map(value => value.table)).toEqual(['todos', 'todo_tags', 'tags']);
    expect(supabase.queries[1]?.operations).toEqual([
      { method: 'select', args: ['todo_id, tag_id'] },
      { method: 'in', args: ['todo_id', ['todo-1']] },
    ]);
  });

  it('lowers a many-to-many Command to one atomic Ontahi RPC and materializes its delta', async () => {
    const Tag = entity('RpcTag', { id: field.id(), label: field.string() });
    const Todo = entity('RpcTodo', { id: field.id(), title: field.string() }).manyToMany(
      'tags',
      Tag,
    );
    mapEntity(Todo).toTable('rpc_todos');
    mapEntity(Tag).toTable('rpc_tags');
    mapRelation(Todo, 'tags', {
      type: 'many-to-many',
      from: 'rpc_todos.id',
      through: { table: 'rpc_todo_tags', fromColumn: 'todo_id', toColumn: 'tag_id' },
      to: 'rpc_tags.id',
    });
    const command = relationshipSet(
      Todo,
      'tags',
      selection(Todo, todo => todo.title.eq('Selected')),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));
    const rpc = vi.fn().mockResolvedValue({
      data: { sourceCount: 2, targetCount: 1, changed: [{ source: 'todo-1', target: 'tag-1' }] },
      error: null,
    });
    const client = { from: vi.fn(), rpc };

    await expect(
      Effect.runPromise(
        executeSupabaseManyToManyRelationshipCommandEffect(
          {
            getClient: () => Effect.succeed(client),
            createError,
            entities: [Todo, Tag],
          },
          command,
        ),
      ),
    ).resolves.toEqual({
      added: [
        {
          relation: command.relation,
          source: createEntityRef(Todo, { id: 'todo-1' }),
          target: createEntityRef(Tag, { id: 'tag-1' }),
        },
      ],
      removed: [],
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('ontahi_apply_many_to_many_relationship', {
      command: compileSupabaseManyToManyRpcPayload(command, [Todo, Tag]),
    });
  });

  it('compiles many-to-many eligibility and surfaces all-or-nothing rejection', async () => {
    const Tag = entity('GuardedRpcTag', { id: field.id(), assignable: field.boolean() });
    const TodoDefinition = entity('GuardedRpcTodo', {
      id: field.id(),
      completed: field.boolean(),
    });
    const Todo = TodoDefinition.manyToMany('tags', Tag, {
      constraints: [
        relationConstraint.source(TodoDefinition, todo => todo.completed.eq(false), {
          code: 'todo_completed',
          message: 'Completed todos cannot be tagged.',
        }),
        relationConstraint.target(Tag, tag => tag.assignable.eq(true), {
          code: 'tag_unassignable',
          message: 'Tag is not assignable.',
        }),
      ],
    });
    mapEntity(Todo).toTable('guarded_rpc_todos', { completed: 'is_completed' });
    mapEntity(Tag).toTable('guarded_rpc_tags', { assignable: 'is_assignable' });
    mapRelation(Todo, 'tags', {
      type: 'many-to-many',
      from: 'guarded_rpc_todos.id',
      through: {
        table: 'guarded_rpc_todo_tags',
        fromColumn: 'todo_id',
        toColumn: 'tag_id',
      },
      to: 'guarded_rpc_tags.id',
    });
    const command = relationshipSet(
      Todo,
      'tags',
      selection(Todo, todo => todo.id.in(['todo-1', 'todo-2'])),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));
    const payload = compileSupabaseManyToManyRpcPayload(command, [Todo, Tag]);
    const rejection = {
      version: 1 as const,
      code: 'todo_completed',
      message: 'Completed todos cannot be tagged.',
    };

    expect(payload).toMatchObject({
      version: 2,
      constraints: [
        {
          participant: 'source',
          selection: {
            operator: 'eq',
            field: 'completed',
            column: 'is_completed',
            value: false,
          },
          rejection: { code: 'todo_completed' },
        },
        {
          participant: 'target',
          selection: {
            operator: 'eq',
            field: 'assignable',
            column: 'is_assignable',
            value: true,
          },
          rejection: { code: 'tag_unassignable' },
        },
      ],
    });

    const createStructuredError = (input: {
      message: string;
      logMessage: string;
      cause: unknown;
    }) => input;
    const result = await Effect.runPromise(
      executeSupabaseManyToManyRelationshipCommandEffect(
        {
          getClient: () =>
            Effect.succeed({
              from: vi.fn(),
              rpc: vi.fn().mockResolvedValue({
                data: {
                  sourceCount: 2,
                  targetCount: 1,
                  constraintRejection: rejection,
                  changed: [],
                },
                error: null,
              }),
            }),
          createError: createStructuredError,
          entities: [Todo, Tag],
        },
        command,
      ).pipe(Effect.either),
    );
    expect(result).toMatchObject({
      _tag: 'Left',
      left: {
        message: 'Completed todos cannot be tagged.',
        logMessage: 'Supabase many-to-many Relation constraint rejected',
        cause: { reason: 'relation_constraint_rejected', rejection },
      },
    });
  });

  it('fails structurally when the Supabase atomic relationship capability is absent', async () => {
    const Tag = entity('MissingRpcTag', { id: field.id() });
    const Todo = entity('MissingRpcTodo', { id: field.id() }).manyToMany('tags', Tag);
    const command = relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'todo-1' })).add(
      createEntityRef(Tag, { id: 'tag-1' }),
    );

    await expect(
      Effect.runPromise(
        executeSupabaseManyToManyRelationshipCommandEffect(
          {
            getClient: () => Effect.succeed({ from: vi.fn() }),
            createError,
            entities: [Todo, Tag],
          },
          command,
        ),
      ),
    ).rejects.toThrow('does not expose the Ontahi many-to-many RPC capability');
  });

  it('ships the reusable invoker-rights RPC migration', () => {
    expect(supabaseManyToManyRpcSql).toContain(
      'create or replace function public.ontahi_apply_many_to_many_relationship',
    );
    expect(supabaseManyToManyRpcSql).toContain('language plpgsql');
    expect(supabaseManyToManyRpcSql).not.toContain('security definer');
  });

  it('returns no rows without touching supabase when an in predicate has no values', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const rows = await Effect.runPromise(
      fetchSupabaseEntityRowsEffect({
        supabase: new TestSupabaseDouble(),
        entityDefinition: Book,
        predicates: [{ operator: 'in', fieldName: 'ownerId', values: [] }],
        orderBy: [],
        message: 'Failed to load books',
        createError,
      }),
    );

    expect(rows).toEqual([]);
  });

  it('materializes selected objects and relation values from hydrated rows', () => {
    const { BookWithCollaborators } = defineAudienceGraph();
    const spec = query(BookWithCollaborators)
      .select(book => ({
        summary: {
          slug: book.slug,
          title: book.title,
        },
        audience: book.collaborators,
      }))
      .build();

    const rawRow = {
      id: 'book-1',
      slug: 'progbook',
      title: 'Progbook',
    };

    const row = {
      ...toSupabaseEntityRow(BookWithCollaborators, rawRow),
      collaborators: [
        {
          bookId: 'book-1',
          userId: 'user-2',
        },
      ],
    };

    const result = materializeSupabaseEntityRow(
      row,
      BookWithCollaborators,
      spec.select,
      spec.includes,
    );

    expect(result).toEqual({
      summary: {
        slug: 'progbook',
        title: 'Progbook',
      },
      audience: [{ bookId: 'book-1', userId: 'user-2' }],
    });
  });

  it('skips nullish selection entries to match selected columns', () => {
    const dynamicUndefinedSelection = undefined as any;
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });
    const spec = query(Book)
      .select(book => ({
        slug: book.slug,
        maybe: dynamicUndefinedSelection,
      }))
      .build();

    const result = materializeSupabaseEntityRow(
      toSupabaseEntityRow(Book, { id: 'book-1', slug: 'progbook' }),
      Book,
      spec.select as any,
      spec.includes,
    );

    expect(result).toEqual({
      slug: 'progbook',
    });
  });

  it('applies hasMany limits per parent after batching child fetches', async () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });
    const Chapter = entity('Chapter', {
      id: field.id(),
      bookId: field.id(),
      title: field.string(),
      order: field.number(),
    });

    const BookWithChapters = Book.hasMany('chapters', Chapter);

    mapEntity(BookWithChapters).toTable('books');
    mapEntity(Chapter).toTable('chapters', {
      bookId: 'book_id',
    });
    mapRelation(BookWithChapters, 'chapters', {
      type: 'one-to-many',
      from: 'books.id',
      to: 'chapters.book_id',
    });

    const readerQuery = query(BookWithChapters).include(book => ({
      chapters: book.chapters.orderBy(chapter => chapter.order).limit(1),
    }));
    const spec = resolveQuerySpec(readerQuery, undefined);
    const plan = compileQueryPlan(readerQuery, undefined);
    const fetchEntityRowsEffectMock = vi.fn().mockReturnValue(
      Effect.succeed([
        { id: 'chapter-1', bookId: 'book-1', title: 'First', order: 1 },
        { id: 'chapter-2', bookId: 'book-1', title: 'Second', order: 2 },
        { id: 'chapter-3', bookId: 'book-2', title: 'Third', order: 1 },
        { id: 'chapter-4', bookId: 'book-2', title: 'Fourth', order: 2 },
      ]),
    );
    const supabase = {} as TestSupabaseDouble;

    const rows = await Effect.runPromise(
      hydrateSupabaseEntityRowsEffect({
        supabase,
        rows: [
          { id: 'book-1', slug: 'book-1' },
          { id: 'book-2', slug: 'book-2' },
        ],
        includeShape: spec.includes,
        includePlans: plan.includes,
        fetchEntityRowsEffect: fetchEntityRowsEffectMock,
        createError,
      }),
    );

    expect(rows).toEqual([
      {
        id: 'book-1',
        slug: 'book-1',
        chapters: [{ id: 'chapter-1', bookId: 'book-1', title: 'First', order: 1 }],
      },
      {
        id: 'book-2',
        slug: 'book-2',
        chapters: [{ id: 'chapter-3', bookId: 'book-2', title: 'Third', order: 1 }],
      },
    ]);
  });

  it('returns 0 without touching supabase when counting with an empty in predicate', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const count = await Effect.runPromise(
      executeSupabaseGraphCountEffect(
        {
          getClient: () => Effect.die('should not request a client'),
          createError,
        },
        query(Book).where(book => book.ownerId.in([])),
        undefined,
      ),
    );

    expect(count).toBe(0);
  });

  it('executes recursive selections through PostgREST logic', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });
    mapEntity(Book).toTable('books', { ownerId: 'owner_id' });

    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', { data: [{ id: 'book-1', owner_id: 'owner-1', title: 'A' }] });

    const rows = await Effect.runPromise(
      executeSupabaseGraphQueryEffect(
        { getClient: () => Effect.succeed(supabase), createError },
        query(Book).where(book =>
          selectionOr(book.ownerId.eq('owner-1'), selectionNot(book.title.eq('Archived, old'))),
        ),
        undefined,
      ),
    );

    expect(rows).toEqual([{ id: 'book-1', ownerId: 'owner-1', title: 'A' }]);
    expect(supabase.queries[0]?.operations).toContainEqual({
      method: 'or',
      args: ['owner_id.eq."owner-1",not.title.eq."Archived, old"'],
    });
  });

  it('enforces exact-one selection cardinality for Supabase reads and counts', async () => {
    const Book = entity('CardinalityBook', {
      id: field.id(),
      status: field.string(),
    });
    mapEntity(Book).toTable('cardinality_books');
    const exactDraft = query(Book).where(
      new Selection(
        Book,
        { kind: 'predicate', operator: 'eq', fieldName: 'status', value: 'draft' },
        undefined,
        'one',
      ),
    );

    const readSupabase = new TestSupabaseDouble();
    readSupabase.queueQuery('cardinality_books', {
      data: [
        { id: 'book-1', status: 'draft' },
        { id: 'book-2', status: 'draft' },
      ],
      error: null,
    });
    await expect(
      Effect.runPromise(
        executeSupabaseGraphQueryEffect(
          { getClient: () => Effect.succeed(readSupabase), createError },
          exactDraft,
          undefined,
        ),
      ),
    ).rejects.toThrow('Expected exactly one CardinalityBook, received 2');

    const countSupabase = new TestSupabaseDouble();
    countSupabase.queueQuery('cardinality_books', { count: 0, data: null, error: null });
    await expect(
      Effect.runPromise(
        executeSupabaseGraphCountEffect(
          { getClient: () => Effect.succeed(countSupabase), createError },
          exactDraft,
          undefined,
        ),
      ),
    ).rejects.toThrow('Expected exactly one CardinalityBook, received 0');
  });

  it('executes relation-root read specs with the generic Supabase runtime', async () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const supabase = new TestSupabaseDouble();

    supabase.queueQuery('book_collaborators', {
      data: [{ book_id: 'book-1', user_id: 'user-1' }],
      error: null,
    });
    supabase.queueQuery('books', {
      data: [{ id: 'book-1', slug: 'progbook' }],
      error: null,
    });

    const rows = await Effect.runPromise(
      executeSupabaseGraphQueryEffect(
        {
          getClient: () => Effect.succeed(supabase),
          createError,
        },
        createRelatedRootReadSpec({
          mode: 'resolve',
          source: query(BookCollaboratorWithProfile)
            .where(collaborator => collaborator.userId.eq('user-1'))
            .select(collaborator => ({
              bookId: collaborator.bookId,
              userId: collaborator.userId,
            }))
            .build(),
          sourceEntity: BookCollaboratorWithProfile,
          target: query(BookWithCollaborators)
            .select(book => ({
              id: book.id,
              slug: book.slug,
            }))
            .build(),
          relationName: 'collaborators' as keyof typeof BookWithCollaborators.relations & string,
        }),
        undefined,
      ),
    );

    expect(rows).toEqual([
      {
        sourceRows: [{ bookId: 'book-1', userId: 'user-1' }],
        rows: [{ id: 'book-1', slug: 'progbook' }],
      },
    ]);
    expect(supabase.queries[0]?.operations).toEqual([
      { method: 'select', args: ['book_id, user_id'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
    ]);
    expect(supabase.queries[1]?.operations).toEqual([
      { method: 'select', args: ['id, slug'] },
      { method: 'in', args: ['id', ['book-1']] },
    ]);
  });

  it('verifies cardinality one inserts without returning by selecting the probe column', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', {
      data: [{ id: 'book-1' }],
      error: null,
    });

    const result = await Effect.runPromise(
      executeSupabaseGraphCommandEffect(
        {
          getClient: () => Effect.succeed(supabase),
          createError,
        },
        {
          kind: 'command',
          operation: 'insert',
          root: Book,
          selection: { kind: 'none' },
          payload: [
            {
              ownerId: 'owner-1',
              title: 'Book',
            },
            {
              ownerId: 'owner-2',
              title: 'Another book',
            },
          ],
          cardinality: 'one',
        },
      ),
    );

    expect(result).toBeUndefined();
    expect(supabase.queries[0]?.operations).toEqual([
      {
        method: 'insert',
        args: [
          [
            {
              owner_id: 'owner-1',
              title: 'Book',
            },
            {
              owner_id: 'owner-2',
              title: 'Another book',
            },
          ],
        ],
      },
      {
        method: 'select',
        args: ['id'],
      },
    ]);
  });

  it('executes update commands with returning columns and mapped predicates', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', {
      data: [{ id: 'book-1', owner_id: 'owner-1' }],
      error: null,
    });

    const result = await Effect.runPromise(
      executeSupabaseGraphCommandEffect(
        {
          getClient: () => Effect.succeed(supabase),
          createError,
        },
        {
          kind: 'command',
          operation: 'update',
          root: Book,
          selection: {
            kind: 'predicate',
            operator: 'eq',
            fieldName: 'ownerId',
            value: 'owner-1',
          },
          payload: {
            title: 'Updated',
          },
          returning: ['id', 'ownerId'],
          cardinality: 'many',
        },
      ),
    );

    expect(result).toEqual([{ id: 'book-1', ownerId: 'owner-1' }]);
    expect(supabase.queries[0]?.operations).toEqual([
      {
        method: 'update',
        args: [
          {
            title: 'Updated',
          },
        ],
      },
      {
        method: 'select',
        args: ['id, owner_id'],
      },
      {
        method: 'eq',
        args: ['owner_id', 'owner-1'],
      },
    ]);
  });

  it('applies recursive selections to commands', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });
    mapEntity(Book).toTable('books', { ownerId: 'owner_id' });
    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', { data: [], error: null });

    await Effect.runPromise(
      executeSupabaseGraphCommandEffect(
        { getClient: () => Effect.succeed(supabase), createError },
        {
          kind: 'command',
          operation: 'delete',
          root: Book,
          selection: selectionOr(
            { kind: 'predicate', operator: 'eq', fieldName: 'ownerId', value: 'owner-1' },
            selectionNot({
              kind: 'predicate',
              operator: 'eq',
              fieldName: 'title',
              value: 'Keep',
            }),
          ),
          cardinality: 'many',
        },
      ),
    );

    expect(supabase.queries[0]?.operations).toEqual([
      { method: 'delete', args: [] },
      { method: 'or', args: ['owner_id.eq."owner-1",not.title.eq."Keep"'] },
    ]);
  });

  it('lowers reference selections through entity locators', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    });
    mapEntity(Book).toTable('books');
    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', { data: [], error: null });

    await Effect.runPromise(
      executeSupabaseGraphCommandEffect(
        { getClient: () => Effect.succeed(supabase), createError },
        {
          kind: 'command',
          operation: 'delete',
          root: Book,
          selection: {
            kind: 'references',
            refs: [
              { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
              { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-2' } },
            ],
          },
          cardinality: 'many',
        },
      ),
    );

    expect(supabase.queries[0]?.operations).toEqual([
      { method: 'delete', args: [] },
      { method: 'or', args: ['id.eq."book-1",id.eq."book-2"'] },
    ]);
  });

  it('executes upserts with Supabase conflict options', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
      title: field.string(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', {
      data: [],
      error: null,
    });

    const result = await Effect.runPromise(
      executeSupabaseGraphCommandEffect(
        {
          getClient: () => Effect.succeed(supabase),
          createError,
        },
        {
          kind: 'command',
          operation: 'upsert',
          root: Book,
          selection: { kind: 'none' },
          payload: {
            ownerId: 'owner-1',
            title: 'Book',
          },
          upsert: {
            conflictOn: ['ownerId'],
            strategy: 'ignore',
          },
          cardinality: 'many',
        },
      ),
    );

    expect(result).toBeUndefined();
    expect(supabase.queries[0]?.operations).toEqual([
      {
        method: 'upsert',
        args: [
          {
            owner_id: 'owner-1',
            title: 'Book',
          },
          {
            ignoreDuplicates: true,
            onConflict: 'owner_id',
          },
        ],
      },
    ]);
  });

  it('fails cardinality one returning commands when Supabase affects no rows', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', {
      data: [],
      error: null,
    });

    await expect(
      Effect.runPromise(
        executeSupabaseGraphCommandEffect(
          {
            getClient: () => Effect.succeed(supabase),
            createError,
          },
          {
            kind: 'command',
            operation: 'delete',
            root: Book,
            selection: {
              kind: 'predicate',
              operator: 'eq',
              fieldName: 'ownerId',
              value: 'owner-1',
            },
            returning: ['id'],
            cardinality: 'one',
          },
          {
            message: 'Delete failed',
            logMessage: 'delete.log',
          },
        ),
      ),
    ).rejects.toThrow('Delete failed: Expected exactly one affected row, got 0');
  });

  it('counts rows through Supabase head queries and maps failures through createError', async () => {
    const Book = entity('Book', {
      id: field.id(),
      ownerId: field.id(),
    });

    mapEntity(Book).toTable('books', {
      ownerId: 'owner_id',
    });

    const supabase = new TestSupabaseDouble();
    supabase.queueQuery('books', {
      count: 2,
      data: null,
      error: null,
    });

    const count = await Effect.runPromise(
      executeSupabaseGraphCountEffect(
        {
          getClient: () => Effect.succeed(supabase),
          createError,
        },
        query(Book).where(book => book.ownerId.eq('owner-1')),
        undefined,
      ),
    );

    expect(count).toBe(2);
    expect(supabase.queries[0]?.operations).toEqual([
      {
        method: 'select',
        args: ['*', { count: 'exact', head: true }],
      },
      {
        method: 'eq',
        args: ['owner_id', 'owner-1'],
      },
    ]);

    const failingSupabase = new TestSupabaseDouble();
    failingSupabase.queueQuery('books', {
      data: null,
      error: { message: 'count failed' },
    });

    await expect(
      Effect.runPromise(
        executeSupabaseGraphCountEffect(
          {
            getClient: () => Effect.succeed(failingSupabase),
            createError,
          },
          query(Book),
          undefined,
        ),
      ),
    ).rejects.toThrow('Failed to count Book records: count failed');
  });

  it('creates a runtime facade that routes reads, commands, counts, and unsupported streams', async () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const readSupabase = new TestSupabaseDouble();
    const commandSupabase = new TestSupabaseDouble();

    readSupabase.queueQuery('books', {
      data: [{ id: 'book-1', slug: 'progbook' }],
      error: null,
    });
    readSupabase.queueQuery('books', {
      count: 1,
      data: null,
      error: null,
    });
    commandSupabase.queueQuery('books', {
      data: [{ id: 'book-1' }],
      error: null,
    });

    const runtime = createSupabaseDataGraphRuntime({
      getReadClient: () => Effect.succeed(readSupabase),
      getCommandClient: () => Effect.succeed(commandSupabase),
      createError,
    });

    await expect(
      Effect.runPromise(runtime.get(query(BookWithCollaborators), undefined)),
    ).resolves.toEqual({ id: 'book-1', slug: 'progbook' });
    await expect(
      Effect.runPromise(runtime.count(query(BookWithCollaborators), undefined)),
    ).resolves.toBe(1);
    await expect(
      Effect.runPromise(
        runtime.runCommand({
          kind: 'command',
          operation: 'insert',
          root: BookWithCollaborators,
          selection: { kind: 'none' },
          payload: {
            slug: 'progbook',
          },
          returning: ['id'],
          cardinality: 'one',
        }),
      ),
    ).resolves.toEqual({ id: 'book-1' });

    const relationRootRead = createRelatedRootReadSpec({
      mode: 'rows',
      source: query(BookCollaboratorWithProfile).build(),
      sourceEntity: BookCollaboratorWithProfile,
      target: query(BookWithCollaborators).build(),
      relationName: 'collaborators' as keyof typeof BookWithCollaborators.relations & string,
    });

    await expect(
      Effect.runPromise(Stream.runCollect(runtime.stream(relationRootRead, undefined))),
    ).rejects.toThrow('Relation-root graph streams are not supported');
  });
});
