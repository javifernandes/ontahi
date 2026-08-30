import { createEntityRef, mutateEntity } from '@ontahi/core/data-graph';
import { describe, expect, it, vi } from 'vitest';

import { TodoItemSchema } from '../../../src/generated/client-entities.js';

import { renameTodoItem } from './todo-mutations.js';

describe('Todo entity mutations', () => {
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
