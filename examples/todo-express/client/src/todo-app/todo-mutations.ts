import {
  createEntityRef,
  isEntityMutationDelta,
  mutateEntity,
  type EntityMutationCommand,
} from '@ontahi/core/data-graph';

import {
  TagSchema,
  TodoItemSchema,
  TodoListSchema,
} from '../../../src/generated/client-entities.js';

type TodoMutationExecutor = {
  runEntityMutationCommand?: (command: EntityMutationCommand) => Promise<unknown>;
};

export type TodoMutationResult = { ok: true } | { ok: false; message: string };

const runTodoMutation = async (
  executor: TodoMutationExecutor | undefined,
  refetch: () => Promise<unknown>,
  command: EntityMutationCommand,
  unsupported: string,
  failed: string,
): Promise<TodoMutationResult> => {
  if (!executor?.runEntityMutationCommand) return { ok: false, message: unsupported };
  try {
    await executor.runEntityMutationCommand(command);
    await refetch();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : failed };
  }
};

export const createTodoList = async (
  executor: TodoMutationExecutor | undefined,
  refetchTodos: () => Promise<unknown>,
  rawName: string,
  color: string,
): Promise<TodoMutationResult & { id?: string }> => {
  const name = rawName.trim();
  if (!name) return { ok: false, message: 'The list name cannot be empty.' };
  if (!executor?.runEntityMutationCommand) {
    return { ok: false, message: 'This runtime cannot create lists.' };
  }

  try {
    const result = await executor.runEntityMutationCommand(
      mutateEntity(TodoListSchema).create({ name, color }),
    );
    if (!isEntityMutationDelta(result) || result.created[0]?.ref?.locator.id === undefined) {
      return { ok: false, message: 'The list creation result did not include its identity.' };
    }
    await refetchTodos();
    return { ok: true, id: String(result.created[0].ref.locator.id) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The list could not be created.',
    };
  }
};

export const createTodoItem = async (
  executor: TodoMutationExecutor | undefined,
  refetchTodos: () => Promise<unknown>,
  listId: string,
  rawTitle: string,
): Promise<TodoMutationResult> => {
  const title = rawTitle.trim();
  if (!title) return { ok: false, message: 'The todo title cannot be empty.' };
  if (!executor?.runEntityMutationCommand) {
    return { ok: false, message: 'This runtime cannot create todos.' };
  }

  try {
    await executor.runEntityMutationCommand(
      mutateEntity(TodoItemSchema).create({
        list: createEntityRef(TodoListSchema, { id: listId }),
        title,
      }),
    );
    await refetchTodos();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The todo could not be created.',
    };
  }
};

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

export const setTodoItemCompleted = (
  executor: TodoMutationExecutor | undefined,
  refetch: () => Promise<unknown>,
  todoId: string,
  completed: boolean,
) =>
  runTodoMutation(
    executor,
    refetch,
    mutateEntity(TodoItemSchema).update(createEntityRef(TodoItemSchema, { id: todoId }), {
      completed,
    }),
    'This runtime cannot update todos.',
    'The todo completion could not be changed.',
  );

export const deleteTodoItem = (
  executor: TodoMutationExecutor | undefined,
  refetch: () => Promise<unknown>,
  todoId: string,
) =>
  runTodoMutation(
    executor,
    refetch,
    mutateEntity(TodoItemSchema).delete(createEntityRef(TodoItemSchema, { id: todoId })),
    'This runtime cannot delete todos.',
    'The todo could not be deleted.',
  );

export const deleteTodoList = (
  executor: TodoMutationExecutor | undefined,
  refetch: () => Promise<unknown>,
  listId: string,
) =>
  runTodoMutation(
    executor,
    refetch,
    mutateEntity(TodoListSchema).delete(createEntityRef(TodoListSchema, { id: listId })),
    'This runtime cannot delete lists.',
    'The list could not be deleted.',
  );

export const deleteTodoTag = (
  executor: TodoMutationExecutor | undefined,
  refetch: () => Promise<unknown>,
  tagId: string,
) =>
  runTodoMutation(
    executor,
    refetch,
    mutateEntity(TagSchema).delete(createEntityRef(TagSchema, { id: tagId })),
    'This runtime cannot delete tags.',
    'The tag could not be deleted.',
  );
