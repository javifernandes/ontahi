import { createInMemoryDataGraphStorage } from '@ontahi/core/data-graph';
import { createPostgresDataGraphStorage } from '@ontahi/postgres/data-graph';
import { Pool } from 'pg';

export const defaultStorage =
  process.env.TODO_STORAGE === 'postgres'
    ? createPostgresDataGraphStorage({
        pool: new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgresql://postgres:postgres@127.0.0.1:54329/ontahi_todos',
        }),
      })
    : createInMemoryDataGraphStorage();
