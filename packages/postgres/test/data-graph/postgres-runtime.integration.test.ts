import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  defineClientEntity,
  query,
  type DataGraphExecutionRuntime,
  type GraphReadMode,
  type GraphReadPolicy,
  type InMemoryDataset,
  type QuerySpec,
  type RuntimeBoundClientEntity,
} from '@ontahi/core/data-graph';
import { createExpressGraphReadHandler } from '@ontahi/runtime-express/graph-read';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect } from 'effect';
import express from 'express';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPostgresDataGraphRuntime,
  createPostgresDataGraphStorage,
} from '../../src/data-graph/index.js';

import { conformanceDataset, conformanceGraph, TodoEntity, TodoMapping } from './fixtures.js';
import { dataGraphRuntimeConformance } from './runtime-conformance.js';

describe('PostgreSQL data graph runtime', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool;

  beforeAll(async () => {
    const externalConnectionUri = process.env.ONTAHI_POSTGRES_TEST_URL;
    if (externalConnectionUri) {
      pool = new Pool({ connectionString: externalConnectionUri });
    } else {
      container = await new PostgreSqlContainer('postgres:17-alpine').start();
      pool = new Pool({ connectionString: container.getConnectionUri() });
    }
    await pool.query(`
      CREATE TABLE todos (
        todo_id text PRIMARY KEY,
        todo_title text NOT NULL,
        is_completed boolean NOT NULL
      );
      CREATE TABLE books (
        id text PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        title text NOT NULL,
        published boolean NOT NULL,
        note text
      );
      CREATE TABLE chapters (
        id text PRIMARY KEY,
        book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        title text NOT NULL,
        position integer NOT NULL
      );
      CREATE TABLE blocks (
        id text PRIMARY KEY,
        chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        content text NOT NULL,
        position integer NOT NULL
      )
    `);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const resetPostgres = async () => {
    await pool.query('TRUNCATE TABLE blocks, chapters, books CASCADE');
    await pool.query(
      'INSERT INTO books (id, slug, title, published, note) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)',
      ['book-1', 'alpha', 'Alpha', false, null, 'book-2', 'beta', 'Beta', true, 'featured'],
    );
    await pool.query(
      'INSERT INTO chapters (id, book_id, title, position) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
      ['chapter-2', 'book-1', 'Second', 2, 'chapter-1', 'book-1', 'First', 1],
    );
    await pool.query(
      'INSERT INTO blocks (id, chapter_id, content, position) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
      ['block-2', 'chapter-1', 'world', 2, 'block-1', 'chapter-1', 'hello', 1],
    );
  };

  dataGraphRuntimeConformance('in-memory reference', async () => {
    const dataset = structuredClone(conformanceDataset) as InMemoryDataset;
    return {
      runtime: createInMemoryDataGraphRuntime({ dataset }),
    };
  });

  dataGraphRuntimeConformance('PostgreSQL', async () => {
    await resetPostgres();
    return {
      runtime: createPostgresDataGraphRuntime({
        pool,
        mappings: conformanceGraph.mappings,
      }),
    };
  });

  it('persists data through a recreated PostgreSQL runtime', async () => {
    await pool.query('TRUNCATE TABLE todos');
    const runtime = () =>
      createPostgresDataGraphRuntime({
        pool,
        mappings: [TodoMapping],
      });

    await Effect.runPromise(
      runtime().runCommand({
        kind: 'command',
        operation: 'insert',
        root: TodoEntity,
        selection: { kind: 'none' },
        payload: { id: 'todo-1', title: 'Persistent', completed: false },
      }),
    );

    await expect(Effect.runPromise(runtime().run(query(TodoEntity), undefined))).resolves.toEqual([
      { id: 'todo-1', title: 'Persistent', completed: false },
    ]);
  });

  it('runs one fluent client Entity read directly and through Express over PostgreSQL', async () => {
    await pool.query('TRUNCATE TABLE todos');
    await pool.query(
      'INSERT INTO todos (todo_id, todo_title, is_completed) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)',
      [
        'todo-2',
        'Build the bridge',
        false,
        'todo-1',
        'Define the protocol',
        false,
        'todo-done',
        'Already done',
        true,
      ],
    );
    const serverRuntime = createPostgresDataGraphRuntime({
      pool,
      mappings: [TodoMapping],
    });
    const policy = {
      entity: TodoEntity,
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 50,
      fields: {
        id: { select: true },
        title: { select: true, order: true },
        completed: { filter: ['eq'] },
      },
      scope: 'all',
    } satisfies GraphReadPolicy<typeof TodoEntity>;
    const execute = (
      runtime: DataGraphExecutionRuntime<any, any, any, any>,
      read: QuerySpec,
      mode: GraphReadMode,
    ) =>
      Effect.runPromise(
        mode === 'get'
          ? runtime.get(read, undefined)
          : mode === 'count'
            ? runtime.count(read, undefined)
            : runtime.run(read, undefined),
      );
    const dispatcher = createGraphReadDispatcher({
      policies: [policy],
      execute: (read, mode) => execute(serverRuntime, read, mode),
    });
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.post('/graph/reads', createExpressGraphReadHandler({ dispatcher }));
    const server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });

    try {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const remoteRuntime = createRemoteDataGraphRuntime({
        transport: async request => {
          const response = await fetch(`${origin}/graph/reads`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
          });
          return response.json();
        },
      });
      const ClientTodo = defineClientEntity(TodoEntity);
      const TodoListItem = ClientTodo.view('TodoListItem', { id: true, title: true });
      const readOpenTodos = <TError, TCommandError>(
        Todo: RuntimeBoundClientEntity<
          typeof ClientTodo,
          TError,
          undefined,
          undefined,
          TCommandError
        >,
      ) =>
        Todo.where(todo => todo.completed.eq(false))
          .as(TodoListItem)
          .orderBy(todo => todo.title)
          .run();
      const directTodo = createRuntimeBoundDataGraphApi(() => serverRuntime).bindClientEntity(
        ClientTodo,
      );
      const remoteTodo = createRuntimeBoundDataGraphApi(() => remoteRuntime).bindClientEntity(
        ClientTodo,
      );

      const direct = await Effect.runPromise(readOpenTodos(directTodo));
      const remote = await Effect.runPromise(readOpenTodos(remoteTodo));

      expect(remote).toEqual(direct);
      expect(remote).toEqual([
        { id: 'todo-2', title: 'Build the bridge' },
        { id: 'todo-1', title: 'Define the protocol' },
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      );
    }
  });

  it('reads reflected entity data with search, filters, sorting and pagination', async () => {
    await resetPostgres();
    const storage = createPostgresDataGraphStorage({
      pool,
      mappings: conformanceGraph.mappings,
      pageSizeOptions: [1, 2],
    });

    await expect(
      storage.readEntityData({
        entityName: 'Book',
        search: 'a',
        filters: [{ field: 'published', operator: 'equals', value: 'false' }],
        sort: { field: 'title', direction: 'desc' },
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toMatchObject({
      entityName: 'Book',
      rows: [
        {
          id: 'book-1',
          slug: 'alpha',
          title: 'Alpha',
          published: false,
          note: null,
        },
      ],
      page: 1,
      pageSize: 1,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      omittedColumns: [],
    });

    await expect(
      storage.readEntityData({
        entityName: 'Book',
        filters: [{ field: 'note', operator: 'isNull' }],
      }),
    ).resolves.toMatchObject({
      rows: [{ id: 'book-1' }],
      totalCount: 1,
    });
  });

  it('reports mapped columns missing from the live PostgreSQL table', async () => {
    await resetPostgres();
    await pool.query('ALTER TABLE books DROP COLUMN note');
    try {
      const storage = createPostgresDataGraphStorage({
        pool,
        mappings: conformanceGraph.mappings,
      });

      await expect(storage.readEntityData({ entityName: 'Book' })).resolves.toMatchObject({
        omittedColumns: [
          {
            field: 'note',
            column: 'note',
            reason: 'The mapped database column was not found in the live table.',
          },
        ],
      });
    } finally {
      await pool.query('ALTER TABLE books ADD COLUMN note text');
    }
  });
});
