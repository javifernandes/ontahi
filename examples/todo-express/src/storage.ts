import { createInMemoryDataGraphStorage } from '@ontahi/core/data-graph';
import { createPostgresDataGraphStorage, postgresMapping } from '@ontahi/postgres/data-graph';
import { Pool } from 'pg';

import { Todo } from './todo.js';

export const defaultStorage =
  process.env.TODO_STORAGE === 'postgres'
    ? createPostgresDataGraphStorage({
        pool: new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgresql://postgres:postgres@127.0.0.1:54329/ontahi_todos',
        }),
        mappings: [
          postgresMapping({
            entity: Todo,
            table: 'todos',
            columns: { id: 'id', title: 'title', completed: 'completed' },
          }),
        ],
      })
    : createInMemoryDataGraphStorage({
        entities: [Todo],
        dataset: { Todo: [] },
      });
