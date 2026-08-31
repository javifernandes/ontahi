import { describe, expect, it } from 'vitest';

import { createTodoInMemoryStorage } from './storage.js';

describe('Todo in-memory storage', () => {
  it('starts with a deterministic workspace for application and Explorer testing', () => {
    const storage = createTodoInMemoryStorage();

    expect(storage.dataset.TodoList).toEqual([
      { id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' },
      { id: 'list-later', name: 'Later', color: '#dbe8f4' },
    ]);
    expect(storage.dataset.TodoItem).toEqual(
      expect.arrayContaining([
        {
          id: 'todo-explorer',
          list: 'list-inbox',
          title: 'Explore instance windows',
          completed: false,
        },
        {
          id: 'todo-done',
          list: 'list-inbox',
          title: 'Try inline editing',
          completed: true,
        },
      ]),
    );
    expect(storage.dataset.Tag).toEqual(
      expect.arrayContaining([
        { id: 'tag-important', name: 'Important', color: '#dd6658' },
        { id: 'tag-idea', name: 'Idea', color: '#8a6ab1' },
      ]),
    );
    expect(storage.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation: {
            sourceEntityName: 'TodoItem',
            relationName: 'tags',
            targetEntityName: 'Tag',
            cardinality: 'many-to-many',
          },
          source: expect.objectContaining({ locator: { id: 'todo-explorer' } }),
          target: expect.objectContaining({ locator: { id: 'tag-important' } }),
        }),
      ]),
    );
  });

  it('creates fresh mutable seed collections for every runtime', () => {
    const first = createTodoInMemoryStorage();
    const second = createTodoInMemoryStorage();

    first.dataset.TodoList = [];
    first.relationships.length = 0;

    expect(second.dataset.TodoList).toHaveLength(2);
    expect(second.relationships.length).toBeGreaterThan(0);
  });
});
