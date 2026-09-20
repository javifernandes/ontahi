import { adaptEffectMethods } from '@ontahi/core/computation/effect';
import { inProcessTasks, ontahi } from '@ontahi/core/runtime/server';

import { createOllamaProvider } from './command-chat/model-provider.js';
import { createTodoModelRuntime } from './command-chat/runtime.js';
import { defaultStorage } from './storage.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from './todo-read-policies.js';
import { Tag, TodoItem, TodoList, type TodoCapabilities } from './todo.js';

export const todoNotifications = adaptEffectMethods<TodoCapabilities['runtime']['notifications']>({
  todoListCreated: ({ listId, name }) => console.info(`[todo] created list ${listId}: ${name}`),
});

const model = process.env.TODO_LLM_MODEL;
export const todoCommandProvider = model
  ? createOllamaProvider({
      model,
      baseUrl: process.env.TODO_LLM_URL,
    })
  : undefined;

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

export const todoModelRuntime = todoCommandProvider
  ? createTodoModelRuntime({
      application: TodoApplication,
      read: TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>(
        todoGraphReadPolicies,
      ),
      provider: todoCommandProvider,
    })
  : undefined;

export const TodoGraphApi = TodoApplication.graph;

export { Tag, TodoItem, TodoList };
