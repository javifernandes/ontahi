import {
  createInMemoryDataGraphStorage,
  type AnyEntityRef,
  type DataGraphExecutionRuntime,
  type RelationshipFact,
} from '@ontahi/core/data-graph';
import { createMysqlDataGraphStorage } from '@ontahi/mysql/data-graph';
import { createMysqlEventRuntime } from '@ontahi/mysql/events';
import { createMysqlTaskStorage } from '@ontahi/mysql/tasks';
import { createPostgresDataGraphStorage } from '@ontahi/postgres/data-graph';
import { createPostgresEventRuntime } from '@ontahi/postgres/events';
import { createPostgresTaskStorage } from '@ontahi/postgres/tasks';
import { createPool } from 'mysql2/promise';
import { Pool } from 'pg';

const todoRef = (id: string): AnyEntityRef => ({
  kind: 'entity-ref',
  entityName: 'TodoItem',
  locator: { id },
});

const tagRef = (id: string): AnyEntityRef => ({
  kind: 'entity-ref',
  entityName: 'Tag',
  locator: { id },
});

const todoTag = (todoId: string, tagId: string): RelationshipFact => ({
  relation: {
    sourceEntityName: 'TodoItem',
    relationName: 'tags',
    targetEntityName: 'Tag',
    cardinality: 'many-to-many',
  },
  source: todoRef(todoId),
  target: tagRef(tagId),
});

export const createTodoInMemoryStorage = () =>
  createInMemoryDataGraphStorage({
    dataset: {
      TodoList: [
        { id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' },
        { id: 'list-later', name: 'Later', color: '#dbe8f4' },
      ],
      TodoItem: [
        {
          id: 'todo-explorer',
          list: 'list-inbox',
          title: 'Explore instance windows',
          completed: false,
        },
        {
          id: 'todo-inline-editing',
          list: 'list-inbox',
          title: 'Edit fields inline',
          completed: false,
        },
        {
          id: 'todo-done',
          list: 'list-inbox',
          title: 'Try inline editing',
          completed: true,
        },
        {
          id: 'todo-later',
          list: 'list-later',
          title: 'Design ordered relations',
          completed: false,
        },
      ],
      Tag: [
        { id: 'tag-important', name: 'Important', color: '#dd6658' },
        { id: 'tag-work', name: 'Work', color: '#527d8c' },
        { id: 'tag-idea', name: 'Idea', color: '#8a6ab1' },
      ],
    },
    relationships: [
      todoTag('todo-explorer', 'tag-important'),
      todoTag('todo-explorer', 'tag-work'),
      todoTag('todo-later', 'tag-idea'),
    ],
  });

const postgresPool =
  process.env.TODO_STORAGE === 'postgres'
    ? new Pool({
        connectionString:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54329/ontahi_todos',
      })
    : undefined;

const mysqlPool = (() => {
  if (process.env.TODO_STORAGE !== 'mysql') return undefined;
  const uri = process.env.DATABASE_URL;
  const password = process.env.TODO_MYSQL_PASSWORD;
  if (!uri && !password) throw new Error('MySQL requires DATABASE_URL or TODO_MYSQL_PASSWORD.');
  return uri
    ? createPool(uri)
    : createPool({
        host: '127.0.0.1',
        port: 33069,
        user: 'root',
        database: 'ontahi_todos',
        password,
      });
})();

const createDefaultStorage = () => {
  if (process.env.TODO_STORAGE === 'postgres') {
    return createPostgresDataGraphStorage({ pool: postgresPool! });
  }
  if (process.env.TODO_STORAGE === 'mysql') {
    return createMysqlDataGraphStorage({ pool: mysqlPool! });
  }
  return createTodoInMemoryStorage();
};
export const defaultStorage = createDefaultStorage();
export const todoEventRuntime = postgresPool
  ? createPostgresEventRuntime({ pool: postgresPool })
  : mysqlPool
    ? createMysqlEventRuntime({ pool: mysqlPool })
    : undefined;
export const todoTaskStorage = postgresPool
  ? createPostgresTaskStorage({ pool: postgresPool })
  : mysqlPool
    ? createMysqlTaskStorage({ pool: mysqlPool })
    : undefined;

export const createTodoDataGraphRuntime = (): DataGraphExecutionRuntime<unknown> =>
  defaultStorage.createRuntime();
