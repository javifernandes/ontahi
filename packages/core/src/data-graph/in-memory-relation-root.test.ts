import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineAudienceGraph } from './fixtures.test-support.js';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
} from './index.js';

describe('in-memory relation-root reads', () => {
  it('uses semantic belongs-to fields without physical mapping metadata', async () => {
    const TodoList = entity('TodoList', {
      id: field.id(),
      name: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const TodoItem = entity('TodoItem', {
      id: field.id(),
      list: field.ref(TodoList),
      title: field.string(),
    });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        TodoList: [{ id: 'list-research', name: 'Research' }],
        TodoItem: [
          { id: 'todo-1', list: 'list-research', title: 'Read Ontahi guide' },
          { id: 'todo-2', list: 'list-personal', title: 'Buy milk' },
        ],
      },
    });
    const graph = createRuntimeBoundDataGraphApi(() => runtime);
    const Lists = graph.bindSelectionEntity(TodoList);
    const TodoItems = graph.bindSelectionEntity(TodoItem);
    const research = Lists.selection(list => list.id.eq('list-research'));

    await expect(Effect.runPromise(TodoItems.relatedTo(research).run())).resolves.toEqual([
      {
        id: 'todo-1',
        list: createEntityRef(TodoList, { id: 'list-research' }),
        title: 'Read Ontahi guide',
      },
    ]);
  });

  it('supports rows, entity rows, resolve, count, grouped count, and streams', async () => {
    const { BookCollaboratorWithProfile, BookWithCollaborators } = defineAudienceGraph();
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [
          { id: 'book-1', slug: 'alpha', title: 'Alpha' },
          { id: 'book-2', slug: 'beta', title: 'Beta' },
          { id: 'book-3', slug: 'gamma', title: 'Gamma' },
        ],
        BookCollaborator: [
          { bookId: 'book-1', userId: 'user-1' },
          { bookId: 'book-2', userId: 'user-1' },
          { bookId: 'book-3', userId: 'user-2' },
        ],
        Profile: [],
      },
    });
    const graph = createRuntimeBoundDataGraphApi(() => runtime);
    const Book = graph.bindSelectionEntity(BookWithCollaborators);
    const BookCollaborator = graph.bindSelectionEntity(BookCollaboratorWithProfile);
    const booksForUser = Book.relatedTo(
      BookCollaborator.where(collaborator => collaborator.userId.eq('user-1')).select(
        collaborator => ({
          bookId: collaborator.bookId,
          userId: collaborator.userId,
        }),
      ),
      { through: 'collaborators' },
    ).orderBy(book => book.slug);
    const projectedBooks = booksForUser.select(book => ({ slug: book.slug }));

    await expect(Effect.runPromise(projectedBooks.run())).resolves.toEqual([
      { slug: 'alpha' },
      { slug: 'beta' },
    ]);
    await expect(Effect.runPromise(booksForUser.resolveEntityRows())).resolves.toEqual([
      { id: 'book-1', slug: 'alpha', title: 'Alpha' },
      { id: 'book-2', slug: 'beta', title: 'Beta' },
    ]);
    await expect(Effect.runPromise(projectedBooks.resolve())).resolves.toEqual({
      sourceRows: [
        { bookId: 'book-1', userId: 'user-1' },
        { bookId: 'book-2', userId: 'user-1' },
      ],
      rows: [{ slug: 'alpha' }, { slug: 'beta' }],
    });
    await expect(Effect.runPromise(projectedBooks.count())).resolves.toBe(2);
    await expect(Effect.runPromise(projectedBooks.limit(1).run())).resolves.toEqual([
      { slug: 'alpha' },
    ]);
    await expect(Effect.runPromise(projectedBooks.limit(1).count())).resolves.toBe(2);
    await expect(Effect.runPromise(projectedBooks.countBySource())).resolves.toEqual({
      sourceRows: [
        { bookId: 'book-1', userId: 'user-1' },
        { bookId: 'book-2', userId: 'user-1' },
      ],
      countsBySource: new Map([
        ['book-1', 1],
        ['book-2', 1],
      ]),
    });

    const streamed = await Effect.runPromise(
      Stream.runCollect(runtime.stream(projectedBooks.build(), undefined)),
    );
    expect(Array.from(streamed)).toEqual([{ slug: 'alpha' }, { slug: 'beta' }]);
  });
});
