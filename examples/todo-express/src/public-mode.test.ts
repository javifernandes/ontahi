import { beforeEach, describe, expect, it } from 'vitest';

process.env.TODO_AUTH_MODE = 'disabled';

const { TodoApplication, TodoItem } = await import('./graph.js');

const getTodoDataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') {
    throw new Error('Todo public-mode tests require in-memory storage.');
  }

  return TodoApplication.storage.dataset;
};

describe('Todo public mode', () => {
  beforeEach(() => {
    getTodoDataset().TodoItem = [
      { id: 'todo-public', list: 'list-1', title: 'Try public mode', completed: false },
    ];
  });

  it('keeps the complete operation public when authentication is disabled', async () => {
    await expect(TodoItem.complete({ todos: ['todo-public'] })).resolves.toMatchObject({
      ok: true,
      kind: 'success',
    });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(true);
  });
});
