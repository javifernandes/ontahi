import { inProcessTasks, ontahi } from '@ontahi/core/runtime/server';

import { defaultStorage } from './storage.js';
import { Todo } from './todo.js';

export const TodoApplication = ontahi({
  storage: defaultStorage,
  tasks: inProcessTasks(),
  entities: [Todo],
});

export const TodoGraphApi = TodoApplication.graph;
