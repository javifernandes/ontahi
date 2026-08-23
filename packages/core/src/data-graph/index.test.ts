import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { runCollectArray } from '../computation/stream.js';

import {
  audienceDataset,
  defineAudienceGraph,
  defineReaderGraph,
  expectedAudienceResult,
  expectedReaderResult,
  readerDataset,
} from './fixtures.test-support.js';

import {
  compileQueryPlan,
  createGraphEntityFactory,
  createInMemoryDataGraphRuntime,
  defineGraphOperation,
  entity,
  field,
  getEntityMapping,
  mapEntity,
  query,
  view,
  type AnyEntityDefinition,
} from './index.js';


describe('data-graph', () => {
  it('executes a nested effect-backed reader view in memory', async () => {
    const { BookWithChapters } = defineReaderGraph();

    const loadBookForReadingView = view(
      'loadBookForReading',
      BookWithChapters,
      ({ root, params }: { root: typeof BookWithChapters; params: { slug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.slug))
          .include(book => ({
            chapters: book.chapters
              .orderBy(chapter => chapter.order)
              .include(chapter => ({
                blocks: chapter.blocks.orderBy(block => block.order),
              })),
          })),
    );

    const data = createInMemoryDataGraphRuntime({
      dataset: readerDataset,
    });

    const result = await Effect.runPromise(data.get(loadBookForReadingView, { slug: 'progbook' }));

    expect(result).toEqual(expectedReaderResult);
  });

  it('executes a nested effect-backed audience view and infers same-name mappings', async () => {
    const { BookWithCollaborators } = defineAudienceGraph();

    expect(getEntityMapping(BookWithCollaborators).columns).toEqual({
      id: 'id',
      slug: 'slug',
      title: 'title',
    });

    const bookAudienceView = view(
      'bookAudience',
      BookWithCollaborators,
      ({ root, params }: { root: typeof BookWithCollaborators; params: { bookSlug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.bookSlug))
          .include(book => ({
            collaborators: book.collaborators.include(collaborator => ({
              profile: collaborator.profile,
            })),
          })),
    );

    const plan = compileQueryPlan(bookAudienceView, { bookSlug: 'progbook' });
    expect(plan.rootTable).toBe('books');
    expect(plan.includes).toEqual([
      {
        relationName: 'collaborators',
        relationKind: 'hasMany',
        sourceField: 'id',
        sourceColumn: 'id',
        targetField: 'bookId',
        targetColumn: 'book_id',
        targetEntity: 'BookCollaborator',
        targetTable: 'book_collaborators',
        orderBy: [],
        limit: undefined,
        includes: [
          {
            relationName: 'profile',
            relationKind: 'belongsTo',
            sourceField: 'userId',
            sourceColumn: 'user_id',
            targetField: 'id',
            targetColumn: 'id',
            targetEntity: 'Profile',
            targetTable: 'profiles',
            orderBy: [],
            limit: undefined,
            includes: [],
          },
        ],
      },
    ]);

    const data = createInMemoryDataGraphRuntime({
      dataset: audienceDataset,
    });

    const result = await Effect.runPromise(data.get(bookAudienceView, { bookSlug: 'progbook' }));

    expect(result).toEqual(expectedAudienceResult);
  });

  it('streams a top-level many view from the in-memory runtime', async () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
      version: field.string(),
    });

    mapEntity(Book).toTable('books');

    const booksIndexView = view('booksIndex', Book, ({ root }: { root: typeof Book }) =>
      query(root)
        .select(book => ({
          slug: book.slug,
          title: book.title,
          version: book.version,
        }))
        .orderBy(book => book.title),
    );

    const data = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [
          { id: 'book-2', slug: 'zig', title: 'Zig', version: '2' },
          { id: 'book-1', slug: 'ada', title: 'Ada', version: '1' },
        ],
      },
    });

    const result = await Effect.runPromise(runCollectArray(data.stream(booksIndexView, undefined)));

    expect(result).toEqual([
      { slug: 'ada', title: 'Ada', version: '1' },
      { slug: 'zig', title: 'Zig', version: '2' },
    ]);
  });

  it('creates bound graph entities with resolved operation ids', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });
    const bindSelectionEntity = <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) =>
      ({
        ...entityDefinition,
        all: () => query(entityDefinition),
      }) as TEntity & { all: () => unknown };
    const defineGraphEntity = createGraphEntityFactory({
      bindSelectionEntity,
    });

    const BoundBook = defineGraphEntity(Book, {
      exposure: 'browser-direct',
      operations: bound => ({
        save: defineGraphOperation({
          authority: 'client-safe',
          exposure: 'browser-direct',
          run: (input: { id: string; slug: string }) => ({ bound: bound.name, input }),
        }),
      }),
    });

    expect(BoundBook.graph.exposure).toBe('browser-direct');
    expect(BoundBook.operations.save.id).toBe('Book.save');
    expect(BoundBook.operations.save.entityName).toBe('Book');
    expect(BoundBook.operations.save.name).toBe('save');
    expect(BoundBook.operations.save.run({ id: 'book-1', slug: 'progbook' })).toEqual({
      bound: 'Book',
      input: { id: 'book-1', slug: 'progbook' },
    });
  });
});
