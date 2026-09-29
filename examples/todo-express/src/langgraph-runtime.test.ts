import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.TODO_AUTH_MODE = 'disabled';
process.env.TODO_TASK_RUNTIME = 'langgraph';

const { TodoApplication, TodoItem, todoTaskRuntime } = await import('./graph.js');

const getTodoDataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') {
    throw new Error('Todo LangGraph tests require in-memory graph storage.');
  }
  return TodoApplication.storage.dataset;
};

describe('Todo LangGraph runtime', () => {
  beforeEach(() => {
    getTodoDataset().TodoList = [{ id: 'list-1', name: 'Garage', color: '#f5ddd5' }];
    getTodoDataset().TodoItem = [
      { id: 'todo-door', list: 'list-1', title: 'Fix the door', completed: false },
    ];
  });

  it('runs the unchanged interactive Todo operation through LangGraph', async () => {
    expect(todoTaskRuntime).toBe('langgraph');
    const start = await TodoItem.deleteFromNamedList({ listName: 'Garage' });
    expect(start).toMatchObject({ ok: true, kind: 'success' });
    if (!start.ok) throw new Error('Expected the interactive delete Operation to start.');

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        interaction: {
          id: 'approve-delete-items',
          kind: 'approval',
          proposal: { summary: 'Delete 1 item from “Garage”.' },
        },
      });
    });
    await Effect.runPromise(
      TodoApplication.app.task.respondToInteraction(
        start.value,
        { interactionId: 'approve-delete-items', decision: 'approve' },
        { actor: { kind: 'system' } },
      ),
    );

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        status: 'completed',
        result: { deleted: 1, rejected: false },
      });
    });
    expect(getTodoDataset().TodoItem).toEqual([]);
  });

  it('uses the canonical choice before approval when list names are ambiguous', async () => {
    getTodoDataset().TodoList = [
      { id: 'garage-home', name: 'Garage', color: '#f5ddd5' },
      { id: 'garage-work', name: 'Garage', color: '#dbe8f4' },
    ];
    getTodoDataset().TodoItem = [
      { id: 'home-door', list: 'garage-home', title: 'Fix home door', completed: false },
      { id: 'work-door', list: 'garage-work', title: 'Fix work door', completed: false },
    ];
    const start = await TodoItem.deleteFromNamedList({ listName: 'Garage' });
    if (!start.ok) throw new Error('Expected the interactive delete Operation to start.');

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        interaction: {
          id: 'choose-list',
          kind: 'choice',
          options: [
            { id: 'garage-home', label: 'Garage (garage-home)' },
            { id: 'garage-work', label: 'Garage (garage-work)' },
          ],
        },
      });
    });
    await Effect.runPromise(
      TodoApplication.app.task.respondToInteraction(
        start.value,
        { interactionId: 'choose-list', optionId: 'garage-work' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        interaction: {
          id: 'approve-delete-items',
          proposal: { summary: 'Delete 1 item from “Garage”.' },
        },
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
    expect(getTodoDataset().TodoItem).toHaveLength(2);
  });

  it('rejects an approved proposal when graph state changed while waiting', async () => {
    const start = await TodoItem.deleteFromNamedList({ listName: 'Garage' });
    if (!start.ok) throw new Error('Expected the interactive delete Operation to start.');
    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toHaveProperty(
        'interaction.id',
        'approve-delete-items',
      );
    });
    getTodoDataset().TodoItem![0]!.title = 'Changed after proposal';

    await Effect.runPromise(
      TodoApplication.app.task.respondToInteraction(
        start.value,
        { interactionId: 'approve-delete-items', decision: 'approve' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(start.value)).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'todo_delete_proposal_stale' },
      });
    });
    expect(getTodoDataset().TodoItem).toEqual([
      {
        id: 'todo-door',
        list: 'list-1',
        title: 'Changed after proposal',
        completed: false,
      },
    ]);
  });
});
