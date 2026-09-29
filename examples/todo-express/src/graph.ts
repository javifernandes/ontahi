import { adaptEffectMethods } from '@ontahi/core/computation/effect';
import {
  createOllamaModelProvider,
  createTaskBackedModelCommandRuntime,
  getCurrentInvocationContext,
  inProcessTasks,
  ontahi,
} from '@ontahi/core/runtime/server';
import { langGraphTasks } from '@ontahi/runtime-langgraph';

import { createTodoModelRuntime } from './command-chat/runtime.js';
import { defaultStorage } from './storage.js';
import { Tag, TodoItem, TodoList, type TodoCapabilities } from './todo.js';

export const todoNotifications = adaptEffectMethods<TodoCapabilities['runtime']['notifications']>({
  todoListCreated: ({ listId, name }) => console.info(`[todo] created list ${listId}: ${name}`),
});

const model = process.env.TODO_LLM_MODEL;
export const todoCommandProvider = model
  ? createOllamaModelProvider({
      model,
      baseUrl: process.env.TODO_LLM_URL,
    })
  : undefined;

export const todoTaskRuntime =
  process.env.TODO_TASK_RUNTIME === 'langgraph' ? 'langgraph' : 'in-process';

export const TodoApplication = ontahi({
  storage: defaultStorage,
  tasks: todoTaskRuntime === 'langgraph' ? langGraphTasks() : inProcessTasks(),
  capabilities: {
    runtime: {
      notifications: todoNotifications,
    },
  },
  entities: [TodoList, Tag, TodoItem],
});

const todoPreparedModelRuntime = todoCommandProvider
  ? createTodoModelRuntime({
      application: TodoApplication,
      provider: todoCommandProvider,
    })
  : undefined;

export const todoModelRuntime = todoPreparedModelRuntime
  ? createTaskBackedModelCommandRuntime({
      runtime: todoPreparedModelRuntime,
      tasks: TodoApplication.app.task,
      trigger: () => {
        const principal = getCurrentInvocationContext()?.principal;
        return {
          cause: 'user_request',
          actor: principal ? { kind: principal.kind, id: principal.subject } : { kind: 'system' },
        };
      },
    })
  : undefined;

export const TodoGraphApi = TodoApplication.graph;

export { Tag, TodoItem, TodoList };
