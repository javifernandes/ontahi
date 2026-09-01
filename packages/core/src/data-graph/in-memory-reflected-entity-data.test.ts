import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphStorage,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  modelExpression,
  mapEntity,
  mapRelation,
  query,
  type InMemoryDataset,
  type RelationshipFact,
} from './index.js';

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
      coverColor: field.named('Color', field.string()),
    }).display({
      primary: 'title',
      search: ['title'],
    });
    const dataset: InMemoryDataset = {
      Book: [
        { id: 'book-1', title: 'Alpha', published: true, score: 3, coverColor: '#ffffff' },
        { id: 'book-2', title: 'Beta', published: false, score: 2, coverColor: '#eeeeee' },
        { id: 'book-3', title: 'Alphabet', published: true, score: 1, coverColor: '#dddddd' },
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
    const reflected = await storage.readEntityData({ entityName: 'Book' });
    expect(reflected.columns).toContainEqual({
      field: 'coverColor',
      type: 'Color',
      nullable: false,
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

  it('presents virtual derived Fields without persisting them', async () => {
    const Course = entity('ReflectedCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(modelExpression.field('capacity')),
      ),
    });
    const dataset: InMemoryDataset = {
      ReflectedCourse: [{ id: 'course-1', capacity: 4 }],
    };
    const storage = createInMemoryDataGraphStorage({ entities: [Course], dataset });

    await expect(storage.readEntityData({ entityName: 'ReflectedCourse' })).resolves.toMatchObject({
      columns: [{ field: 'id' }, { field: 'capacity' }, { field: 'availableSeats' }],
      rows: [{ id: 'course-1', capacity: 4, availableSeats: 4 }],
    });
    expect(dataset.ReflectedCourse).toEqual([{ id: 'course-1', capacity: 4 }]);
  });

  it('validates and paginates reflected inverse many-to-many reads', async () => {
    const Tag = entity('ReflectedTag', {
      id: field.id(),
      name: field.string(),
    });
    const Todo = entity('ReflectedTodo', {
      id: field.id(),
      title: field.string(),
    })
      .manyToMany('tags', Tag)
      .display({ primary: 'title' });
    const tag = createEntityRef(Tag, { id: 'tag-1' });
    const todos = Array.from({ length: 12 }, (_, index) => ({
      id: `todo-${index + 1}`,
      title: `Todo ${index + 1}`,
    }));
    const relation = {
      sourceEntityName: 'ReflectedTodo',
      relationName: 'tags',
      targetEntityName: 'ReflectedTag',
      cardinality: 'many-to-many',
    } as const;
    const relationships: RelationshipFact[] = todos.map(todo => ({
      relation,
      source: createEntityRef(Todo, { id: todo.id }),
      target: tag,
    }));
    const storage = createInMemoryDataGraphStorage({
      entities: [Todo, Tag],
      dataset: {
        ReflectedTodo: todos,
        ReflectedTag: [{ id: 'tag-1', name: 'Shared' }],
      },
      relationships,
    });
    const readRelatedEntityData = storage.readRelatedEntityData!;

    await expect(
      readRelatedEntityData({
        source: tag,
        relationName: 'ReflectedTodo.tags',
        sourceEntityName: 'ReflectedTag',
        targetEntityName: 'ReflectedTodo',
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      entityName: 'ReflectedTodo',
      display: { primary: 'title' },
      rows: [
        { id: 'todo-11', title: 'Todo 11' },
        { id: 'todo-12', title: 'Todo 12' },
      ],
      page: 2,
      pageSize: 10,
      totalCount: 12,
      hasPreviousPage: true,
      hasNextPage: false,
    });

    await expect(
      readRelatedEntityData({
        source: tag,
        relationName: 'ReflectedTodo.tags',
        sourceEntityName: 'ReflectedTag',
        targetEntityName: 'ReflectedTodo',
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toMatchObject({
      rows: [{ id: 'todo-1', title: 'Todo 1' }],
      pageSize: 1,
      totalCount: 12,
      hasNextPage: true,
    });

    await expect(
      readRelatedEntityData({
        source: tag,
        relationName: 'ReflectedTodo.tags',
        sourceEntityName: 'ReflectedTag',
        targetEntityName: 'ReflectedTodo',
        page: 0,
        pageSize: 7,
      }),
    ).resolves.toMatchObject({
      page: 1,
      pageSize: 25,
      totalCount: 12,
      hasPreviousPage: false,
      hasNextPage: false,
    });

    await expect(
      readRelatedEntityData({
        source: { ...tag, entityName: 'MissingSource' },
        relationName: 'ReflectedTodo.tags',
        sourceEntityName: 'MissingSource',
        targetEntityName: 'ReflectedTodo',
      }),
    ).rejects.toThrow('Unknown graph Entity: MissingSource');
    await expect(
      readRelatedEntityData({
        source: tag,
        relationName: 'ReflectedTodo.tags',
        sourceEntityName: 'ReflectedTodo',
        targetEntityName: 'ReflectedTag',
      }),
    ).rejects.toThrow('Unknown graph Entity: ReflectedTodo');
    await expect(
      readRelatedEntityData({
        source: tag,
        relationName: 'ReflectedTodo.tags',
        sourceEntityName: 'ReflectedTag',
        targetEntityName: 'MissingTarget',
      }),
    ).rejects.toThrow('Unknown graph Entity: MissingTarget');
  });
});
