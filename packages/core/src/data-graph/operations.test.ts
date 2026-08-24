import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  defineClientDomainOperation,
  defineClientDomainOperationsForEntity,
  defineClientEntity,
  defineDomainOperationMetadata,
  defineDomainOperationsForEntity,
  cacheRef,
  createEntityRef,
  createGraphEntityFactory,
  defineGraphApi,
  defineGraphRelation,
  defineGraphOperation,
  defineOperationBridgeBinding,
  entity,
  field,
  graphOutput,
  graphSchema,
  queryRef,
  selection,
  type AnyEntityDefinition,
  resolveDomainOperations,
  resolveGraphOperations,
  resolveOperationId,
  value,
} from './index.js';

describe('data-graph operations', () => {
  it('authors caller-owned Views from a client Entity facade', () => {
    const TripSchema = entity('Trip', { id: field.id(), status: field.string() });
    const Trip = defineClientEntity(TripSchema, {
      domainOperations: {
        available: defineClientDomainOperation({
          authority: 'server',
          exposure: 'bridge',
          bridge: {},
          output: graphSchema.selection(TripSchema, { cardinality: 'many' }),
        }),
      },
    });
    const TripList = Trip.view('TripList', { id: true });
    const projected = Trip.domain.available.as(TripList);

    expect(TripList.entity).toBe(TripSchema);
    expect(TripList.toJSON()).toMatchObject({
      kind: 'entity-view',
      name: 'TripList',
      entity: 'Trip',
    });
    expect(projected.view).toBe(TripList.ast);
    expectTypeOf(projected.__clientTypes?.output).toEqualTypeOf<
      Array<{ id: string }> | undefined
    >();
  });

  it('authors portable Queries from a client Entity facade', () => {
    const TripSchema = entity('Trip', { id: field.id(), status: field.string() });
    const Trip = defineClientEntity(TripSchema);
    const available = Trip.all()
      .where(trip => trip.status.eq('available'))
      .orderBy(trip => trip.id);
    const selected = Trip.where(trip => trip.id.eq('trip-1'));

    expect(available.build()).toMatchObject({
      kind: 'query',
      root: TripSchema,
      orderBy: [{ fieldName: 'id', direction: 'asc' }],
    });
    expect(selected.build().selection).toMatchObject({
      kind: 'predicate',
      fieldName: 'id',
      operator: 'eq',
      value: 'trip-1',
    });
    expectTypeOf(available.__result).toEqualTypeOf<{ id: string; status: string } | undefined>();
  });

  it('does not expose projection on durable Selection operations', () => {
    const Trip = entity('Trip', { id: field.id() });
    const durable = defineClientDomainOperation({
      authority: 'server',
      exposure: 'bridge',
      bridge: {},
      durable: { runtime: 'workflow' },
      output: graphSchema.selection(Trip, { cardinality: 'many' }),
    });

    expectTypeOf(durable).not.toHaveProperty('as');
    expect('as' in durable).toBe(false);
  });

  it('safe parses public drafts through the operation input contract', () => {
    const TodoList = entity('TodoList', {
      id: field.id(),
      name: field.nonEmptyString({
        trim: true,
        exclude: { values: ['archive'], caseInsensitive: true },
        messages: { exclude: 'Archive is reserved for system use.' },
      }),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const rename = defineClientDomainOperation({
      authority: 'server',
      exposure: 'bridge',
      bridge: {},
      input: graphSchema.object({
        list: graphSchema.selection(TodoList, { cardinality: 'one' }),
        name: TodoList.fields.name,
      }),
    });

    expect(rename.input.safeParse({ list: 'list-1', name: '  ARCHIVE  ' })).toMatchObject({
      success: false,
      issues: [{ path: ['name'], message: 'Archive is reserved for system use.' }],
    });

    const parsed = rename.input.safeParse({ list: 'list-1', name: '  Reading queue  ' });
    expect(parsed).toMatchObject({
      success: true,
      data: {
        name: 'Reading queue',
        list: {
          root: { name: 'TodoList' },
          cardinality: 'one',
        },
      },
    });
  });

  it('accepts first-class selections as transport-safe operation inputs', () => {
    const Book = entity('Book', {
      id: field.id(),
      createdAt: field.date(),
    });
    const DeleteBooksInput = value('DeleteBooksInput', {
      books: graphSchema.selection(Book, { cardinality: 'many' }),
    });
    const operations = resolveDomainOperations('Book', {
      deleteBooks: defineDomainOperationMetadata({
        exposure: 'bridge',
        input: DeleteBooksInput,
      }),
    });
    const clientBook = defineClientEntity(Book, {
      exposure: 'bridge',
      domainOperations: {
        deleteBooks: defineClientDomainOperation({
          authority: 'server',
          exposure: 'bridge',
          bridge: {},
          input: DeleteBooksInput,
        }),
      },
    });
    const oldBooks = selection(Book, book =>
      book.createdAt.lt(new Date('2026-01-01T00:00:00.000Z')),
    );
    const clientOldBooks = clientBook.selection(book =>
      book.createdAt.lt(new Date('2026-01-01T00:00:00.000Z')),
    );
    const invocation = operations.deleteBooks({ books: oldBooks });
    const clientInvocation = clientBook.domain.deleteBooks({ books: clientOldBooks });

    expect(graphSchema.selection(Book).cardinality).toBe('many');
    expect(DeleteBooksInput.fields.books.cardinality).toBe('many');
    expect(invocation.input.books).toBe(oldBooks);
    expect(clientInvocation.input.books).toBe(clientOldBooks);
    expect(clientOldBooks.build()).toEqual(oldBooks.build());
    expect(JSON.parse(JSON.stringify(invocation.input))).toEqual({
      books: {
        kind: 'selection',
        entityName: 'Book',
        expression: {
          kind: 'predicate',
          operator: 'lt',
          fieldName: 'createdAt',
          value: '2026-01-01T00:00:00.000Z',
        },
      },
    });
  });

  it('resolves canonical operation ids for graph and domain operations', () => {
    const FetchBooksInputSchema = value('FetchBooksInput', {
      limit: field.number(),
    });
    const FetchBooksOutputSchema = graphSchema.array(field.string());
    const ReindexBookSearchResultSchema = value('ReindexBookSearchResult', {
      indexed: field.boolean(),
    });
    const graphOperations = resolveGraphOperations('Book', {
      fetchBooks: defineGraphOperation({
        authority: 'client-safe',
        exposure: 'browser-direct',
        input: FetchBooksInputSchema,
        output: FetchBooksOutputSchema,
        run: ({ limit }) => ['progbook'].slice(0, limit),
      }),
    });
    const domainOperations = resolveDomainOperations(
      'Book',
      {
        reindexBookSearch: defineDomainOperationMetadata({
          authority: 'server',
          exposure: 'server-only',
          durable: {
            finalOutput: ReindexBookSearchResultSchema,
          },
        }),
      },
      {
        durable: {
          runtime: 'vercel-workflow',
        },
      },
    );

    expect(resolveOperationId('Book', 'fetchBooks')).toBe('Book.fetchBooks');
    expect(graphOperations.fetchBooks).toMatchObject({
      kind: 'graph-operation',
      id: 'Book.fetchBooks',
      input: FetchBooksInputSchema,
      output: FetchBooksOutputSchema,
      entityName: 'Book',
      name: 'fetchBooks',
      authority: 'client-safe',
      exposure: 'browser-direct',
    });
    expect({ ...domainOperations.reindexBookSearch }).toMatchObject({
      kind: 'domain-operation',
      id: 'Book.reindexBookSearch',
      entityName: 'Book',
      name: 'reindexBookSearch',
      authority: 'server',
      exposure: 'server-only',
      durable: {
        runtime: 'vercel-workflow',
        finalOutput: ReindexBookSearchResultSchema,
      },
    });
  });

  it('requires a runtime when an operation opts into durable execution', () => {
    expect(() =>
      resolveDomainOperations('Book', {
        importFromGithubMarkdown: defineDomainOperationMetadata({
          authority: 'server',
          exposure: 'bridge',
          durable: {
            finalOutput: value('GithubMarkdownImportResult', {
              imported: field.boolean(),
            }),
          },
        }),
      }),
    ).toThrow(
      'Durable domain operation "Book.importFromGithubMarkdown" must declare durable.runtime or inherit it from domainOperationDefaults.durable.runtime.',
    );
  });

  it('uses the operation output as the durable final output by default', () => {
    const Output = value('RefreshOutput', { refreshed: field.boolean() });
    const operations = resolveDomainOperations('Book', {
      refresh: defineDomainOperationMetadata({
        authority: 'server',
        exposure: 'bridge',
        output: Output,
        durable: { runtime: 'in-process' },
      }),
    });

    expect(operations.refresh.durable?.finalOutput).toBe(Output);
  });

  it('defines client entities with bridge-only domain operation metadata and locators', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    }).locators({
      refBySlug: 'slug',
    });
    const fetchChapter = defineClientDomainOperation({
      authority: 'server',
      exposure: 'bridge',
      bridge: {
        query: [
          (input: { bookSlug: string; chapterSlug: string }) => input.bookSlug,
          (input: { bookSlug: string; chapterSlug: string }) => input.chapterSlug,
        ],
        invalidate: [[(input: { bookSlug: string; chapterSlug: string }) => input.bookSlug]],
      },
    });
    const inviteCollaborator = defineClientDomainOperation({
      authority: 'server',
      exposure: 'bridge',
      bridge: {},
    });
    const clientBookCollaborators = defineClientEntity('BookCollaborators', {
      domainOperations: {
        invite: inviteCollaborator,
      },
    });

    const clientBook = defineClientEntity(Book, {
      exposure: 'bridge',
      relations: {
        collaborators: {
          sourceName: 'Book',
          domain: clientBookCollaborators.domain,
        },
      },
      domainOperations: {
        fetchChapter,
      },
    });

    expect(clientBook.entityName).toBe('Book');
    expect(clientBook.graph.exposure).toBe('bridge');
    expect(clientBook.domain.fetchChapter.id).toBe('Book.fetchChapter');
    expect(clientBook.refBySlug('progbook')).toMatchObject({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
    expect(clientBook.ref({ slug: 'progbook' })).toMatchObject({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
    expect(
      clientBook.ref({ slug: 'progbook' }).collaborators.invite({
        email: 'reader@example.com',
      }),
    ).toMatchObject({
      kind: 'domain-operation-invocation',
      operationId: 'BookCollaborators.invite',
      input: {
        book: {
          kind: 'entity-ref',
          entityName: 'Book',
          locator: {
            slug: 'progbook',
          },
        },
        email: 'reader@example.com',
      },
    });
    expect(
      clientBook.domain.fetchChapter.bridge.query?.map(part =>
        typeof part === 'function'
          ? part({
              bookSlug: 'progbook',
              chapterSlug: 'intro',
            })
          : part,
      ),
    ).toEqual(['progbook', 'intro']);
  });

  it('binds domain operations to entity names from strings or entity definitions', () => {
    const Book = entity('Book', {
      id: field.id(),
    });
    const fromEntity = defineDomainOperationsForEntity(Book, {
      reindex: defineDomainOperationMetadata({
        authority: 'server',
        exposure: 'server-only',
      }),
    });
    const fromName = defineClientDomainOperationsForEntity('Profile', {
      listProfiles: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {
          query: [],
        },
      }),
    });

    expect(fromEntity.reindex.id).toBe('Book.reindex');
    expect(fromName.listProfiles.id).toBe('Profile.listProfiles');
  });

  it('resolves query and cache keys only from direct Entity Refs', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });
    const resolveBookCacheRef = cacheRef('book') as (
      input: Record<string, unknown>,
      context: {
        input: Record<string, unknown>;
        operation: {};
        resolveRef?: (ref: unknown) => unknown;
      },
    ) => unknown;
    const resolveBookQueryRef = queryRef('book') as (
      input: Record<string, unknown>,
      context: { input: Record<string, unknown>; operation: {} },
    ) => unknown;
    const slugBookRef = createEntityRef(Book, { slug: 'progbook' });
    const canonicalBookRef = createEntityRef(Book, { id: 'book-1' });

    expect(
      resolveBookCacheRef(
        {
          book: slugBookRef,
        },
        {
          input: {},
          operation: {},
          resolveRef: () => canonicalBookRef,
        },
      ),
    ).toBe(canonicalBookRef);
    expect(resolveBookQueryRef({ book: slugBookRef }, { input: {}, operation: {} })).toBe(
      'Book:{"slug":"progbook"}',
    );
    expect(resolveBookCacheRef({ bookId: 'book-1' }, { input: {}, operation: {} })).toBeNull();
    expect(resolveBookQueryRef({ bookId: 'book-1' }, { input: {}, operation: {} })).toBeNull();
  });

  it('rejects non-Ontahi domain operation contracts during resolution', () => {
    expect(() =>
      resolveDomainOperations('Book', {
        legacy: defineDomainOperationMetadata({
          exposure: 'bridge',
          input: { parse: () => ({}) } as never,
        }),
      }),
    ).toThrow('Domain operation "Book.legacy" input must be an Ontahi schema.');
  });

  it('derives graph output metadata from nested Ontahi schemas', () => {
    const CommentMessage = entity('CommentMessage', {
      id: field.id(),
      body: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const CommentThread = entity('CommentThread', {
      id: field.id(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const MessageSchema = CommentMessage.view('ThreadMessage');
    const ThreadSchema = CommentThread.view('Thread', {
      fields: {
        messages: graphSchema.array(MessageSchema),
      },
    });
    const output = value('ListThreadsResult', {
      threads: graphSchema.array(ThreadSchema),
    });

    const operations = resolveDomainOperations('CommentThread', {
      listThreads: defineDomainOperationMetadata({
        exposure: 'bridge',
        output,
      }),
    });

    expect(operations.listThreads.graphOutput).toEqual(
      graphOutput.object({
        threads: graphOutput.array(
          graphOutput.entity(CommentThread, {
            messages: graphOutput.array(graphOutput.entity(CommentMessage)),
          }),
        ),
      }),
    );
  });

  it('defines graph relations with domain operations', () => {
    const Profile = entity('Profile', {
      id: field.id(),
    });
    const Book = entity('Book', {
      id: field.id(),
    }).hasMany('collaborators', Profile);

    const BookCollaborators = defineGraphRelation(Book, 'collaborators', {
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'bridge',
      },
      domainOperations: {
        invite: defineDomainOperationMetadata({
          exposure: 'bridge',
        }),
      },
    });

    expect(BookCollaborators).toMatchObject({
      kind: 'graph-relation',
      name: 'BookCollaborators',
      entityName: 'BookCollaborators',
      fields: {},
      relations: {},
      relation: {
        source: 'Book',
        name: 'collaborators',
        cardinality: 'hasMany',
        target: 'Profile',
      },
    });
    expect({ ...BookCollaborators.domain.invite }).toMatchObject({
      id: 'BookCollaborators.invite',
      entityName: 'BookCollaborators',
      name: 'invite',
      exposure: 'bridge',
    });
  });

  it('creates invocation descriptors by calling resolved domain operations', () => {
    const operations = defineClientDomainOperationsForEntity('Book', {
      importFromGithubMarkdown: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {
          query: [(input: { repositoryId?: number }) => input.repositoryId ?? null],
        },
      }),
    });

    const invocation = operations.importFromGithubMarkdown({
      repositoryId: 123,
    });

    expect(operations.importFromGithubMarkdown.id).toBe('Book.importFromGithubMarkdown');
    expect(invocation).toMatchObject({
      kind: 'domain-operation-invocation',
      operationId: 'Book.importFromGithubMarkdown',
      input: {
        repositoryId: 123,
      },
    });
    expect(invocation.operation).toBe(operations.importFromGithubMarkdown);
  });

  it('binds entity locators to domain operation invocations', () => {
    const Publisher = entity('Publisher', {
      id: field.id(),
    });
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      publisher: field.nullable(field.ref(Publisher)),
    }).locators({
      refBySlug: 'slug',
    });
    const defineGraphEntity = createGraphEntityFactory({
      bindSelectionEntity: <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) =>
        entityDefinition,
    });

    const BoundBook = defineGraphEntity(Book, {
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'bridge',
      },
      domainOperations: {
        getInfo: defineDomainOperationMetadata<{ slug: string }>({
          exposure: 'bridge',
        }),
      },
    });
    const book = BoundBook.refBySlug('progbook');

    expect(book).toMatchObject({
      kind: 'entity-ref',
      entityName: 'Book',
      locator: {
        slug: 'progbook',
      },
    });
    expect(book.getInfo()).toMatchObject({
      kind: 'domain-operation-invocation',
      operationId: 'Book.getInfo',
      input: {
        slug: 'progbook',
      },
    });
    const publisher = createEntityRef(Publisher, { id: 'publisher-1' });
    expect(book.publisher.assign(publisher)).toMatchObject({
      kind: 'relationship-command',
      action: 'link',
      source: book,
      target: publisher,
    });
    expect(BoundBook.ref({ id: 'book-1' }).publisher.clear()).toMatchObject({
      kind: 'relationship-command',
      action: 'unlink',
      source: { entityName: 'Book', locator: { id: 'book-1' } },
    });
  });

  it('describes graph APIs and filters bridge domain operations', () => {
    const bridgeBinding = defineOperationBridgeBinding('next-action', async () => ({
      success: true,
    }));
    const Book = {
      entityName: 'Book',
      graph: {
        exposure: 'bridge' as const,
      },
      operations: resolveGraphOperations('Book', {
        fetchBooks: defineGraphOperation({
          authority: 'server-required',
          exposure: 'bridge',
          run: () => [],
        }),
      }),
      domain: resolveDomainOperations('Book', {
        fetchChapter: defineDomainOperationMetadata({
          authority: 'server',
          exposure: 'bridge',
          bridge: {
            query: [(input: { bookSlug: string }) => input.bookSlug],
          },
          durable: {
            runtime: 'vercel-workflow',
            finalOutput: value('FetchChapterResult', {
              fetched: field.boolean(),
            }),
            subject: (input: { bookSlug: string }) => ({
              type: 'book',
              id: input.bookSlug,
            }),
            idempotency: {
              policy: 'reuse-running',
            },
          },
        }),
        reindex: defineDomainOperationMetadata({
          authority: 'server',
          exposure: 'server-only',
        }),
      }),
      taskDefinitions: {
        importFromGithubMarkdown: {
          id: 'book.import-github-markdown',
        },
      },
      bridgeBinding,
    };
    const Profile = {
      entityName: 'Profile',
      graph: {},
    };
    const graphApi = defineGraphApi({
      entities: {
        Book,
        Profile,
      },
    });

    expect(graphApi.entityNames).toEqual(['Book', 'Profile']);
    expect(graphApi.listEntities()).toEqual([Book, Profile]);
    expect(graphApi.listGraphOperationEntities()).toEqual([Book]);
    expect(graphApi.listDomainEntities()).toEqual([Book]);
    expect(graphApi.listTaskEntities()).toEqual([Book]);
    expect(graphApi.getEntity('Book')).toBe(Book);
    expect(graphApi.listGraphOperations().map(operation => operation.id)).toEqual([
      'Book.fetchBooks',
    ]);
    expect(graphApi.listDomainOperations().map(operation => operation.id)).toEqual([
      'Book.fetchChapter',
      'Book.reindex',
    ]);
    expect(graphApi.listBridgeDomainOperations().map(operation => operation.id)).toEqual([
      'Book.fetchChapter',
    ]);
    expect(graphApi.listTaskDefinitions()).toEqual([
      {
        id: 'book.import-github-markdown',
        entityName: 'Book',
        name: 'importFromGithubMarkdown',
      },
      {
        id: 'Book.fetchChapter',
        entityName: 'Book',
        name: 'fetchChapter',
      },
    ]);
    expect(graphApi.getDomainOperation('Book.fetchChapter')?.name).toBe('fetchChapter');
    expect(graphApi.getOperation('Book.fetchBooks')?.name).toBe('fetchBooks');
    expect(graphApi.getOperation('Book.missing')).toBeUndefined();
    expect(graphApi.getTaskDefinition('book.import-github-markdown')?.name).toBe(
      'importFromGithubMarkdown',
    );
    expect(graphApi.describe()).toEqual({
      entities: [
        {
          name: 'Book',
          graphExposure: 'bridge',
          graphOperationNames: ['fetchBooks'],
          domainOperationNames: ['fetchChapter', 'reindex'],
          durableOperationNames: ['fetchChapter'],
          taskNames: ['importFromGithubMarkdown', 'fetchChapter'],
        },
        {
          name: 'Profile',
          graphExposure: undefined,
          graphOperationNames: [],
          domainOperationNames: [],
          durableOperationNames: [],
          taskNames: [],
        },
      ],
      graphOperations: [
        {
          id: 'Book.fetchBooks',
          entityName: 'Book',
          name: 'fetchBooks',
          authority: 'server-required',
          exposure: 'bridge',
        },
      ],
      domainOperations: [
        {
          id: 'Book.fetchChapter',
          entityName: 'Book',
          name: 'fetchChapter',
          description: undefined,
          authority: 'server',
          exposure: 'bridge',
          hasBridgeQuery: true,
        },
        {
          id: 'Book.reindex',
          entityName: 'Book',
          name: 'reindex',
          description: undefined,
          authority: 'server',
          exposure: 'server-only',
          hasBridgeQuery: false,
        },
      ],
      durableOperations: [
        {
          id: 'Book.fetchChapter',
          entityName: 'Book',
          name: 'fetchChapter',
          runtime: 'vercel-workflow',
          hasProgress: false,
          hasFinalOutput: true,
          hasSubject: true,
          idempotencyPolicy: 'reuse-running',
        },
      ],
      ingress: [],
      taskDefinitions: [
        {
          id: 'book.import-github-markdown',
          entityName: 'Book',
          name: 'importFromGithubMarkdown',
        },
        {
          id: 'Book.fetchChapter',
          entityName: 'Book',
          name: 'fetchChapter',
        },
      ],
    });
    expect(Book.bridgeBinding).toEqual({
      adapter: 'next-action',
      callable: bridgeBinding.callable,
    });
    expect(graphApi.listDurableDomainOperations().map(operation => operation.id)).toEqual([
      'Book.fetchChapter',
    ]);
  });
});
