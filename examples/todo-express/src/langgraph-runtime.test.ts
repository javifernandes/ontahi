import { createEntityRef, toGraphCommandRequest } from '@ontahi/core/data-graph';
import {
  createTaskBackedModelCommandRuntime,
  withInvocationContext,
} from '@ontahi/core/runtime/server';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.TODO_AUTH_MODE = 'disabled';
process.env.TODO_TASK_RUNTIME = 'langgraph';

const { TodoApplication, TodoItem, TodoList, todoTaskRuntime } = await import('./graph.js');
const { createTodoModelRuntime } = await import('./command-chat/runtime.js');

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

  it('resumes a model-produced choice through LangGraph without another model call', async () => {
    getTodoDataset().TodoList = [
      { id: 'list-1', name: 'Garage', color: '#f5ddd5' },
      { id: 'list-2', name: 'Later', color: '#dbe8f4' },
    ];
    const invocation = (listId: string) => ({
      kind: 'invoke' as const,
      operationId: 'TodoItem.createItem',
      input: {
        id: 'buy-milk',
        title: 'buy milk',
        list: createEntityRef(TodoList, { id: listId }),
      },
    });
    const generate = vi.fn(async () => ({
      status: 'choice' as const,
      prompt: 'Which list?',
      options: [
        { id: 'list-1', label: 'Garage', request: invocation('list-1') },
        { id: 'list-2', label: 'Later', request: invocation('list-2') },
      ],
    }));
    const prepared = createTodoModelRuntime({
      application: TodoApplication,
      provider: { generate },
    });
    const runtime = createTaskBackedModelCommandRuntime({
      id: 'ontahi.model-command.choice-test',
      runtime: prepared,
      tasks: TodoApplication.app.task,
    });

    const pending = await withInvocationContext(
      { principal: { kind: 'user', subject: 'local-test' } },
      () => runtime.submit({ text: 'add item buy milk' }, new AbortController().signal),
    );
    expect(pending).toMatchObject({
      status: 'pending',
      interaction: { id: 'choose-model-command', kind: 'choice' },
    });
    if (pending.status !== 'pending') throw new Error('Expected model choice.');

    await Effect.runPromise(
      TodoApplication.app.task.respondToInteraction(
        pending.run,
        { interactionId: pending.interaction.id, optionId: 'list-2' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(pending.run)).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'Item added.' },
      });
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(getTodoDataset().TodoItem?.at(-1)).toMatchObject({
      id: 'buy-milk',
      list: 'list-2',
      title: 'buy milk',
    });
  });

  it('applies an explicit model approval policy through LangGraph', async () => {
    const generate = vi.fn(async () => ({
      status: 'resolved' as const,
      request: toGraphCommandRequest({
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'TodoList',
        target: createEntityRef(TodoList, { id: 'list-1' }),
        values: { name: 'Workshop' },
        if: { name: 'Garage' },
      }),
    }));
    const prepared = createTodoModelRuntime({
      application: TodoApplication,
      provider: { generate },
    });
    const runtime = createTaskBackedModelCommandRuntime({
      id: 'ontahi.model-command.approval-test',
      runtime: prepared,
      tasks: TodoApplication.app.task,
      approval: () => ({
        prompt: 'Rename this list?',
        summary: 'Rename Garage to Workshop.',
      }),
    });

    const pending = await withInvocationContext(
      { principal: { kind: 'user', subject: 'local-test' } },
      () => runtime.submit({ text: 'rename Garage to Workshop' }, new AbortController().signal),
    );
    expect(pending).toMatchObject({
      status: 'pending',
      interaction: { id: 'approve-model-command', kind: 'approval' },
    });
    if (pending.status !== 'pending') throw new Error('Expected model approval.');
    expect(getTodoDataset().TodoList![0]!.name).toBe('Garage');

    await Effect.runPromise(
      TodoApplication.app.task.respondToInteraction(
        pending.run,
        { interactionId: pending.interaction.id, decision: 'approve' },
        { actor: { kind: 'system' } },
      ),
    );
    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(pending.run)).resolves.toMatchObject({
        status: 'completed',
        result: { status: 'executed', message: 'List renamed.' },
      });
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(getTodoDataset().TodoList![0]!.name).toBe('Workshop');
  });
});
