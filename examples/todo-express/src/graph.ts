import {
  createAnthropicModelProvider,
  createDeepSeekModelProvider,
  createOpenAIModelProvider,
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
const modelBaseUrl = process.env.TODO_LLM_URL || undefined;
const modelProviderErrorDetails = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return {};
  const providerError = (payload as { error?: unknown }).error;
  if (!providerError || typeof providerError !== 'object') return {};
  return {
    type:
      'type' in providerError && typeof providerError.type === 'string'
        ? providerError.type
        : undefined,
    message:
      'message' in providerError && typeof providerError.message === 'string'
        ? providerError.message
        : undefined,
  };
};
const loggedModelFetch: typeof fetch = async (input, init) => {
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      const payload: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
      console.error(
        '[todo:model-provider]',
        JSON.stringify({
          provider: modelProvider,
          status: response.status,
          ...modelProviderErrorDetails(payload),
        }),
      );
    }
    return response;
  } catch (error) {
    console.error(
      '[todo:model-provider]',
      JSON.stringify({
        provider: modelProvider,
        message: error instanceof Error ? error.message : 'Unknown transport error.',
      }),
    );
    throw error;
  }
};
const createTodoModelProvider = () => {
  if (!model) return undefined;
  if (modelProvider === 'anthropic')
    return createAnthropicModelProvider({
      model,
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      baseUrl: modelBaseUrl,
      fetchRequest: loggedModelFetch,
    });
  if (modelProvider === 'deepseek')
    return createDeepSeekModelProvider({
      model,
      apiKey: process.env.DEEPSEEK_API_KEY ?? '',
      baseUrl: modelBaseUrl,
      fetchRequest: loggedModelFetch,
    });
  if (modelProvider === 'openai')
    return createOpenAIModelProvider({
      model,
      apiKey: process.env.OPENAI_API_KEY ?? '',
      baseUrl: modelBaseUrl,
      fetchRequest: loggedModelFetch,
    });
  if (modelProvider === 'ollama')
    return createOllamaModelProvider({
      model,
      baseUrl: modelBaseUrl,
      fetchRequest: loggedModelFetch,
    });
  throw new Error(`Unsupported TODO_LLM_PROVIDER: ${modelProvider}`);
};

export const todoCommandProvider = createTodoModelProvider();

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
