import { adaptEffectMethods } from '@ontahi/core/computation/effect';
import { inProcessTasks, ontahi } from '@ontahi/core/runtime/server';

import { defaultStorage } from './storage.js';
import { Tag, TodoItem, TodoList, type TodoCapabilities } from './todo.js';

export const todoNotifications = adaptEffectMethods<TodoCapabilities['runtime']['notifications']>({
  todoListCreated: ({ listId, name }) => console.info(`[todo] created list ${listId}: ${name}`),
});

export const TodoApplication = ontahi({
  storage: defaultStorage,
  tasks: inProcessTasks(),
  capabilities: {
    runtime: {
      notifications: todoNotifications,
    },
  },
  entities: [TodoList, Tag, TodoItem],
});

export const TodoGraphApi = TodoApplication.graph;

export { Tag, TodoItem, TodoList };
