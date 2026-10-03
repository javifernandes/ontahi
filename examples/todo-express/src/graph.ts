import { adaptEffectMethods } from '@ontahi/core/computation/effect';
import {
  createDeepSeekModelProvider,
  createOllamaModelProvider,
  createTaskBackedModelCommandRuntime,
  inProcessTasks,
  ontahi,
} from '@ontahi/core/runtime/server';
import { langGraphTasks } from '@ontahi/runtime-langgraph';
import { Effect } from 'effect';

import { createTodoModelRuntime } from './command-chat/runtime.js';
import { defaultStorage } from './storage.js';
import { Tag, TodoItem, TodoList, type TodoEvent } from './todo.js';

export const todoNotifications = adaptEffectMethods<{
  todoListCreated(input: { listId: string; name: string }): Effect.Effect<void>;
}>({
  todoListCreated: ({ listId, name }) => console.info(`[todo] created list ${listId}: ${name}`),
});

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
  tasks: todoTaskRuntime === 'langgraph' ? langGraphTasks() : inProcessTasks(),
  capabilities: {
    effectors: {
      'emit-event': ({ event }: { event: TodoEvent }) =>
        todoNotifications.todoListCreated({ listId: event.listId, name: event.name }),
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
    })
  : undefined;

export const TodoGraphApi = TodoApplication.graph;

export { Tag, TodoItem, TodoList };
