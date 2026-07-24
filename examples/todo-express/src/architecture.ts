import {
  createInMemoryDataGraphRuntime,
  type InMemoryDataGraphError,
  type InMemoryDataset,
} from '@ontahi/core/data-graph';
import {
  architecture,
  createDataGraphArchitectureAdapter,
  createInMemoryTaskRunStore,
  createInProcessTaskRuntimeAdapter,
} from '@ontahi/core/runtime/server';
import {
  createPostgresDataGraphRuntime,
  type PostgresDataGraphError,
  postgresMapping,
} from '@ontahi/postgres/data-graph';
import { Pool } from 'pg';

import { TodoEntity } from './todo-schema.js';

export const todoDataset: InMemoryDataset = { Todo: [] };

const postgresPool =
  process.env.TODO_STORAGE === 'postgres'
    ? new Pool({
        connectionString:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54329/ontahi_todos',
      })
    : undefined;

const graph = createDataGraphArchitectureAdapter<
  unknown,
  InMemoryDataGraphError | PostgresDataGraphError
>({
  createRuntime: () =>
    postgresPool
      ? createPostgresDataGraphRuntime({
          pool: postgresPool,
          mappings: [
            postgresMapping({
              entity: TodoEntity,
              table: 'todos',
              columns: { id: 'id', title: 'title', completed: 'completed' },
            }),
          ],
        })
      : createInMemoryDataGraphRuntime({ dataset: todoDataset }),
});

const taskRunStore = createInMemoryTaskRunStore();

export const todoArchitecture = architecture({
  graph,
  task: {
    adapter: createInProcessTaskRuntimeAdapter({ store: taskRunStore }),
  },
  layers: {
    todos: {
      concerns: [graph.withRuntime()],
    },
  },
});

export const app = todoArchitecture.app;
