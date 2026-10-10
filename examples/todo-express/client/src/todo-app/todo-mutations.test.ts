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
    const execute = vi.fn().mockResolvedValue({
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
    await expect(createTodoList(execute, '  Reading  ', '#dcebdc')).resolves.toEqual({
      ok: true,
      id: 'generated-list',
    });
    expect(execute).toHaveBeenCalledWith(
      mutateEntity(TodoListSchema).create({ name: 'Reading', color: '#dcebdc' }),
    );
  });

  it('creates through one Entity Mutation Command without client-owned defaults or identity', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(createTodoItem(execute, 'list-1', '  Buy milk  ')).resolves.toEqual({ ok: true });

    expect(execute).toHaveBeenCalledWith(
      mutateEntity(TodoItemSchema).create({
        list: createEntityRef(TodoListSchema, { id: 'list-1' }),
        title: 'Buy milk',
      }),
    );
  });

  it('renames through one exact Entity Mutation Command', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(renameTodoItem(execute, 'todo-1', '  Renamed todo  ')).resolves.toEqual({
      ok: true,
    });

    expect(execute).toHaveBeenCalledWith(
      mutateEntity(TodoItemSchema).update(createEntityRef(TodoItemSchema, { id: 'todo-1' }), {
        title: 'Renamed todo',
      }),
    );
  });

  it.each([
    {
      label: 'updates completion',
      invoke: (execute: Parameters<typeof setTodoItemCompleted>[0]) =>
        setTodoItemCompleted(execute, 'todo-1', true),
      command: mutateEntity(TodoItemSchema).update(
        createEntityRef(TodoItemSchema, { id: 'todo-1' }),
        { completed: true },
      ),
    },
    {
      label: 'deletes an item',
      invoke: (execute: Parameters<typeof deleteTodoItem>[0]) => deleteTodoItem(execute, 'todo-1'),
      command: mutateEntity(TodoItemSchema).delete(
        createEntityRef(TodoItemSchema, { id: 'todo-1' }),
      ),
    },
    {
      label: 'deletes a list',
      invoke: (execute: Parameters<typeof deleteTodoList>[0]) => deleteTodoList(execute, 'list-1'),
      command: mutateEntity(TodoListSchema).delete(
        createEntityRef(TodoListSchema, { id: 'list-1' }),
      ),
    },
    {
      label: 'deletes a tag',
      invoke: (execute: Parameters<typeof deleteTodoTag>[0]) => deleteTodoTag(execute, 'tag-1'),
      command: mutateEntity(TagSchema).delete(createEntityRef(TagSchema, { id: 'tag-1' })),
    },
  ])('$label through an Entity Mutation Command', async testCase => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(testCase.invoke(execute)).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith(testCase.command);
  });

  it('rejects blank titles before dispatch', async () => {
    const execute = vi.fn();

    await expect(renameTodoItem(execute, 'todo-1', '   ')).resolves.toEqual({
      ok: false,
      message: 'The todo title cannot be empty.',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports failed mutation execution', async () => {
    await expect(
      renameTodoItem(vi.fn().mockRejectedValue(new Error('Remote rejected')), 'todo-1', 'Renamed'),
    ).resolves.toEqual({ ok: false, message: 'Remote rejected' });
  });
});
