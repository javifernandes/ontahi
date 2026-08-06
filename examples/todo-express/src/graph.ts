import { inProcessTasks, ontahi } from '@ontahi/core/runtime/server';

import { defaultStorage } from './storage.js';
import { Tag, Todo, TodoList, TodoTag } from './todo.js';

export const TodoApplication = ontahi({
  storage: defaultStorage,
  tasks: inProcessTasks(),
  entities: [TodoList, Tag, TodoTag, Todo],
});

export const TodoGraphApi = TodoApplication.graph;
