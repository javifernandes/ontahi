import {
  createDeepSeekModelProvider,
  createOllamaModelProvider,
  createTaskBackedModelCommandRuntime,
  inProcessTasks,
  ontahi,
} from '@ontahi/core/runtime/server';
import { langGraphTasks } from '@ontahi/runtime-langgraph';

import { createTodoModelRuntime } from './command-chat/runtime.js';
import { defaultStorage, todoEventRuntime, todoTaskStorage } from './storage.js';
import {
  Tag,
  TodoItem,
  TodoList,
  TodoListCompleted,
  TodoListCreated,
  TodoListExportReady,
} from './todo.js';

const model = process.env.TODO_LLM_MODEL;
const modelProvider = process.env.TODO_LLM_PROVIDER ?? 'ollama';
if (model && modelProvider !== 'ollama' && modelProvider !== 'deepseek')
  throw new Error(`Unsupported TODO_LLM_PROVIDER: ${modelProvider}`);
export const todoCommandProvider = model
  ? modelProvider === 'deepseek'
    ? createDeepSeekModelProvider({
        model,
        apiKey: process.env.DEEPSEEK_API_KEY ?? '',
        baseUrl: process.env.TODO_LLM_URL,
      })
    : createOllamaModelProvider({
        model,
        baseUrl: process.env.TODO_LLM_URL,
      })
  : undefined;

export const todoTaskRuntime =
  process.env.TODO_TASK_RUNTIME === 'langgraph' ? 'langgraph' : 'in-process';

export const TodoApplication = ontahi({
  storage: defaultStorage,
  eventRuntime: todoEventRuntime,
  tasks:
    todoTaskRuntime === 'langgraph'
      ? langGraphTasks({ storage: todoTaskStorage })
      : inProcessTasks({ storage: todoTaskStorage }),
  capabilities: {
    runtime: {
      model: { provider: todoCommandProvider },
    },
  },
  entities: [TodoList, Tag, TodoItem],
  events: [TodoListCreated, TodoListCompleted, TodoListExportReady],
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
    })
  : undefined;

export const TodoGraphApi = TodoApplication.graph;

export { Tag, TodoItem, TodoList, TodoListCompleted, TodoListCreated, TodoListExportReady };
