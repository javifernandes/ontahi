import { createEntityRef, mutateEntity } from '@ontahi/core/data-graph';
import { describe, expect, it, vi } from 'vitest';

import {
  TagSchema,
  TodoItemSchema,
  TodoListSchema,
} from '../../../src/generated/client-entities.js';

import {
  createTodoItem,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  deleteTodoTag,
  renameTodoItem,
  setTodoItemCompleted,
} from './todo-mutations.js';

describe('Todo entity mutations', () => {
  it('creates a list with receiver-owned identity and returns that identity', async () => {
    const runEntityMutationCommand = vi.fn().mockResolvedValue({
      created: [
        {
          entityName: 'TodoList',
          ref: createEntityRef(TodoListSchema, { id: 'generated-list' }),
          values: { id: 'generated-list', name: 'Reading', color: '#dcebdc' },
        },
      ],
      updated: [],
      deleted: [],
    });
    const refetchTodos = vi.fn().mockResolvedValue(undefined);

    await expect(
      createTodoList({ runEntityMutationCommand }, refetchTodos, '  Reading  ', '#dcebdc'),
    ).resolves.toEqual({ ok: true, id: 'generated-list' });
    expect(runEntityMutationCommand).toHaveBeenCalledWith(
      mutateEntity(TodoListSchema).create({ name: 'Reading', color: '#dcebdc' }),
    );
    expect(refetchTodos).toHaveBeenCalledOnce();
  });

  it('creates through one Entity Mutation Command without client-owned defaults or identity', async () => {
    const runEntityMutationCommand = vi.fn().mockResolvedValue({});
    const refetchTodos = vi.fn().mockResolvedValue(undefined);

    await expect(
      createTodoItem({ runEntityMutationCommand }, refetchTodos, 'list-1', '  Buy milk  '),
    ).resolves.toEqual({ ok: true });

    expect(runEntityMutationCommand).toHaveBeenCalledWith(
      mutateEntity(TodoItemSchema).create({
        list: createEntityRef(TodoListSchema, { id: 'list-1' }),
        title: 'Buy milk',
      }),
    );
    expect(refetchTodos).toHaveBeenCalledOnce();
  });

  it('renames through one exact Entity Mutation Command and refreshes todos', async () => {
    const runEntityMutationCommand = vi.fn().mockResolvedValue({});
    const refetchTodos = vi.fn().mockResolvedValue(undefined);

    await expect(
      renameTodoItem({ runEntityMutationCommand }, refetchTodos, 'todo-1', '  Renamed todo  '),
    ).resolves.toEqual({ ok: true });

    expect(runEntityMutationCommand).toHaveBeenCalledWith(
      mutateEntity(TodoItemSchema).update(createEntityRef(TodoItemSchema, { id: 'todo-1' }), {
        title: 'Renamed todo',
      }),
    );
    expect(refetchTodos).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: 'updates completion',
      invoke: (
        executor: Parameters<typeof setTodoItemCompleted>[0],
        refetch: () => Promise<void>,
      ) => setTodoItemCompleted(executor, refetch, 'todo-1', true),
      command: mutateEntity(TodoItemSchema).update(
        createEntityRef(TodoItemSchema, { id: 'todo-1' }),
        { completed: true },
      ),
    },
    {
      label: 'deletes an item',
      invoke: (executor: Parameters<typeof deleteTodoItem>[0], refetch: () => Promise<void>) =>
        deleteTodoItem(executor, refetch, 'todo-1'),
      command: mutateEntity(TodoItemSchema).delete(
        createEntityRef(TodoItemSchema, { id: 'todo-1' }),
      ),
    },
    {
      label: 'deletes a list',
      invoke: (executor: Parameters<typeof deleteTodoList>[0], refetch: () => Promise<void>) =>
        deleteTodoList(executor, refetch, 'list-1'),
      command: mutateEntity(TodoListSchema).delete(
        createEntityRef(TodoListSchema, { id: 'list-1' }),
      ),
    },
    {
      label: 'deletes a tag',
      invoke: (executor: Parameters<typeof deleteTodoTag>[0], refetch: () => Promise<void>) =>
        deleteTodoTag(executor, refetch, 'tag-1'),
      command: mutateEntity(TagSchema).delete(createEntityRef(TagSchema, { id: 'tag-1' })),
    },
  ])('$label through an Entity Mutation Command and refreshes data', async testCase => {
    const runEntityMutationCommand = vi.fn().mockResolvedValue({});
    const refetch = vi.fn().mockResolvedValue(undefined);

    await expect(testCase.invoke({ runEntityMutationCommand }, refetch)).resolves.toEqual({
      ok: true,
    });
    expect(runEntityMutationCommand).toHaveBeenCalledWith(testCase.command);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('rejects blank titles before dispatch', async () => {
    const runEntityMutationCommand = vi.fn();

    await expect(
      renameTodoItem({ runEntityMutationCommand }, vi.fn(), 'todo-1', '   '),
    ).resolves.toEqual({ ok: false, message: 'The todo title cannot be empty.' });
    expect(runEntityMutationCommand).not.toHaveBeenCalled();
  });

  it('reports unavailable and failed mutation runtimes', async () => {
    await expect(renameTodoItem(undefined, vi.fn(), 'todo-1', 'Renamed')).resolves.toEqual({
      ok: false,
      message: 'This runtime cannot rename todos.',
    });

    await expect(
      renameTodoItem(
        { runEntityMutationCommand: vi.fn().mockRejectedValue(new Error('Remote rejected')) },
        vi.fn(),
        'todo-1',
        'Renamed',
      ),
    ).resolves.toEqual({ ok: false, message: 'Remote rejected' });
  });
});
