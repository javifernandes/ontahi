import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  mapEntity,
  mapRelation,
  query,
  type InMemoryDataset,
} from '../../src/data-graph/index.js';

describe('in-memory reflected entity data', () => {
  it('creates a read runtime before entity metadata is bound', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    });
    const storage = createInMemoryDataGraphStorage({
      dataset: { Book: [{ id: 'book-1', title: 'Alpha' }] },
    });
    const graph = createRuntimeBoundDataGraphApi(() => storage.createRuntime());

    await expect(
      Effect.runPromise(
        graph
          .bindGraphRead(query(Book).select(book => ({ id: book.id, title: book.title })))
          .run(undefined),
      ),
    ).resolves.toEqual([{ id: 'book-1', title: 'Alpha' }]);
  });

  it('searches, filters, sorts, paginates, and observes live graph mutations', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      published: field.boolean(),
      score: field.number(),
    }).display({
      primary: 'title',
      search: ['title'],
    });
    const dataset: InMemoryDataset = {
      Book: [
        { id: 'book-1', title: 'Alpha', published: true, score: 3 },
        { id: 'book-2', title: 'Beta', published: false, score: 2 },
        { id: 'book-3', title: 'Alphabet', published: true, score: 1 },
      ],
    };
    const storage = createInMemoryDataGraphStorage({
      entities: [Book],
      dataset,
      pageSizeOptions: [1, 2],
    });
    const runtime = storage.createRuntime();

    await expect(
      storage.readEntityData({
        entityName: 'Book',
        search: 'alpha',
        filters: [{ field: 'published', operator: 'equals', value: 'true' }],
        sort: { field: 'score', direction: 'asc' },
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toMatchObject({
      entityName: 'Book',
      display: { primary: 'title', search: ['title'] },
      rows: [{ id: 'book-3', title: 'Alphabet', published: true, score: 1 }],
      page: 1,
      pageSize: 1,
      totalCount: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });

    await Effect.runPromise(
      runtime.runCommand({
        kind: 'command',
        operation: 'update',
        root: Book,
        selection: query(Book)
          .where(book => book.id.eq('book-2'))
          .build().selection,
        payload: { title: 'Beta revised' },
        cardinality: 'one',
      }),
    );

    await expect(
      storage.readEntityData({ entityName: 'Book', search: 'revised' }),
    ).resolves.toMatchObject({
      rows: [{ id: 'book-2', title: 'Beta revised', published: false, score: 2 }],
      totalCount: 1,
    });
    await expect(storage.readEntityData({ entityName: 'Missing' })).rejects.toThrow(
      'Unknown graph entity: Missing',
    );
  });

  it('hydrates belongs-to display paths in batches', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
    });
    const Profile = entity('Profile', {
      id: field.id(),
      displayName: field.string(),
    });
    const ReadingProgress = entity('ReadingProgress', {
      userId: field.id(),
      bookId: field.id(),
    })
      .display({
        primary: 'book.title',
        secondary: ['reader.displayName'],
      })
      .belongsTo('book', Book, { via: 'bookId' })
      .belongsTo('reader', Profile, { via: 'userId' });

    mapEntity(Book).toTable('books');
    mapEntity(Profile).toTable('profiles');
    mapEntity(ReadingProgress).toTable('reading_progress');
    mapRelation(ReadingProgress, 'book', {
      type: 'many-to-one',
      from: 'reading_progress.bookId',
      to: 'books.id',
    });
    mapRelation(ReadingProgress, 'reader', {
      type: 'many-to-one',
      from: 'reading_progress.userId',
      to: 'profiles.id',
    });

    const storage = createInMemoryDataGraphStorage({
      entities: [Book, Profile, ReadingProgress],
      dataset: {
        Book: [{ id: 'book-1', title: 'Programming Book' }],
        Profile: [{ id: 'user-1', displayName: 'Javi' }],
        ReadingProgress: [{ userId: 'user-1', bookId: 'book-1' }],
      },
    });

    await expect(storage.readEntityData({ entityName: 'ReadingProgress' })).resolves.toMatchObject({
      display: {
        primary: 'book.title',
        secondary: ['reader.displayName'],
      },
      rows: [
        {
          userId: 'user-1',
          bookId: 'book-1',
          'book.title': 'Programming Book',
          'reader.displayName': 'Javi',
        },
      ],
    });
  });
});
