import { createEntityRef, mutateEntity, type EntityMutationCommand } from '@ontahi/core/data-graph';

import { TodoItemSchema } from '../../../src/generated/client-entities.js';

type TodoMutationExecutor = {
  runEntityMutationCommand?: (command: EntityMutationCommand) => Promise<unknown>;
};

export type TodoMutationResult = { ok: true } | { ok: false; message: string };

export const renameTodoItem = async (
  executor: TodoMutationExecutor | undefined,
  refetchTodos: () => Promise<unknown>,
  todoId: string,
  rawTitle: string,
): Promise<TodoMutationResult> => {
  const title = rawTitle.trim();
  if (!title) return { ok: false, message: 'The todo title cannot be empty.' };
  if (!executor?.runEntityMutationCommand) {
    return { ok: false, message: 'This runtime cannot rename todos.' };
  }

  try {
    await executor.runEntityMutationCommand(
      mutateEntity(TodoItemSchema).update(createEntityRef(TodoItemSchema, { id: todoId }), {
        title,
      }),
    );
    await refetchTodos();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The todo could not be renamed.',
    };
  }
};
