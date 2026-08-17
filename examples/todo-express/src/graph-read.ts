import { createGraphReadDispatcher, type GraphReadDispatchExecutor } from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import { createTodoDataGraphRuntime } from './storage.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from './todo-read-policies.js';

const runtime = createTodoDataGraphRuntime();

const execute: GraphReadDispatchExecutor = (read, mode) => {
  if (mode === 'get') return Effect.runPromise(runtime.get(read, undefined));
  if (mode === 'count') return Effect.runPromise(runtime.count(read, undefined));
  return Effect.runPromise(runtime.run(read, undefined));
};

export const todoGraphReadDispatcher = createGraphReadDispatcher<TodoGraphReadAuthority>({
  policies: todoGraphReadPolicies,
  execute,
});
