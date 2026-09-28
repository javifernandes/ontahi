import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    getTodoDataset().TodoList = [{ id: 'list-1', name: 'Public', color: '#f5ddd5' }];
    getTodoDataset().TodoItem = [
      { id: 'todo-public', list: 'list-1', title: 'Try public mode', completed: false },
    ];
  });

  it('accepts a system response for an interactive Operation when authentication is disabled', async () => {
    const start = await TodoItem.deleteFromNamedList({ listName: 'Public' });
    expect(start).toMatchObject({ ok: true, kind: 'success' });
    if (!start.ok) throw new Error('Expected the interactive delete Operation to start.');

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        interaction: { id: 'approve-delete-items', kind: 'approval' },
      });
    });
    await Effect.runPromise(
      TodoApplication.app.task.respondToInteraction(
        start.value,
        { interactionId: 'approve-delete-items', decision: 'reject' },
        { actor: { kind: 'system' } },
      ),
    );

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        status: 'completed',
        result: { deleted: 0, rejected: true },
      });
    });
    expect(getTodoDataset().TodoItem).toHaveLength(1);
  });

  it('keeps the complete operation public when authentication is disabled', async () => {
    await expect(
      TodoItem.setCompleted({ todos: ['todo-public'], completed: true }),
    ).resolves.toMatchObject({
      ok: true,
      kind: 'success',
    });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(true);
  });
});
