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

type TodoMutationExecutor = (command: EntityMutationCommand) => Promise<unknown>;

export type TodoMutationResult = { ok: true } | { ok: false; message: string };

const runTodoMutation = async (
  execute: TodoMutationExecutor,
  command: EntityMutationCommand,
  failed: string,
): Promise<TodoMutationResult> => {
  try {
    await execute(command);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : failed };
  }
};

export const createTodoList = async (
  execute: TodoMutationExecutor,
  rawName: string,
  color: string,
): Promise<TodoMutationResult & { id?: string }> => {
  const name = rawName.trim();
  if (!name) return { ok: false, message: 'The list name cannot be empty.' };

  try {
    const result = await execute(mutateEntity(TodoListSchema).create({ name, color }));
    if (!isEntityMutationDelta(result) || result.created[0]?.ref?.locator.id === undefined) {
      return { ok: false, message: 'The list creation result did not include its identity.' };
    }
    return { ok: true, id: String(result.created[0].ref.locator.id) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The list could not be created.',
    };
  }
};

export const createTodoItem = async (
  execute: TodoMutationExecutor,
  listId: string,
  rawTitle: string,
): Promise<TodoMutationResult> => {
  const title = rawTitle.trim();
  if (!title) return { ok: false, message: 'The todo title cannot be empty.' };

  try {
    await execute(
      mutateEntity(TodoItemSchema).create({
        list: createEntityRef(TodoListSchema, { id: listId }),
        title,
      }),
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The todo could not be created.',
    };
  }
};

export const renameTodoItem = async (
  execute: TodoMutationExecutor,
  todoId: string,
  rawTitle: string,
): Promise<TodoMutationResult> => {
  const title = rawTitle.trim();
  if (!title) return { ok: false, message: 'The todo title cannot be empty.' };

  try {
    await execute(
      mutateEntity(TodoItemSchema).update(createEntityRef(TodoItemSchema, { id: todoId }), {
        title,
      }),
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The todo could not be renamed.',
    };
  }
};

export const setTodoItemCompleted = (
  execute: TodoMutationExecutor,
  todoId: string,
  completed: boolean,
) =>
  runTodoMutation(
    execute,
    mutateEntity(TodoItemSchema).update(createEntityRef(TodoItemSchema, { id: todoId }), {
      completed,
    }),
    'The todo completion could not be changed.',
  );

export const deleteTodoItem = (execute: TodoMutationExecutor, todoId: string) =>
  runTodoMutation(
    execute,
    mutateEntity(TodoItemSchema).delete(createEntityRef(TodoItemSchema, { id: todoId })),
    'The todo could not be deleted.',
  );

export const deleteTodoList = (execute: TodoMutationExecutor, listId: string) =>
  runTodoMutation(
    execute,
    mutateEntity(TodoListSchema).delete(createEntityRef(TodoListSchema, { id: listId })),
    'The list could not be deleted.',
  );

export const deleteTodoTag = (execute: TodoMutationExecutor, tagId: string) =>
  runTodoMutation(
    execute,
    mutateEntity(TagSchema).delete(createEntityRef(TagSchema, { id: tagId })),
    'The tag could not be deleted.',
  );
