import { adaptEffectMethods } from '@ontahi/core/computation/effect';
import { inProcessTasks, ontahi } from '@ontahi/core/runtime/server';

import type { TodoCommandService } from './command-chat/contracts.js';
import { createOllamaProvider } from './command-chat/model-provider.js';
import { createTodoCommandService } from './command-chat/service.js';
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

// Deferred calls avoid coupling domain declarations to application/provider construction.
export const todoCommands: TodoCommandService = {
  interpret: (input, signal) => commandService.interpret(input, signal),
  submit: (input, signal) => commandService.submit(input, signal),
};

export const TodoApplication = ontahi({
  storage: defaultStorage,
  tasks: inProcessTasks(),
  capabilities: {
    runtime: {
      notifications: todoNotifications,
      commands: todoCommands,
    },
  },
  entities: [TodoList, Tag, TodoItem],
});

const commandService = createTodoCommandService({
  application: TodoApplication,
  read: TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>(todoGraphReadPolicies),
  provider: todoCommandProvider,
});

export const TodoGraphApi = TodoApplication.graph;

export { Tag, TodoItem, TodoList };
