import {
  createInMemoryDataGraphRuntime,
  query,
  type InMemoryDataset,
} from '@ontahi/core/data-graph';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPostgresDataGraphRuntime,
  createPostgresReflectedEntityDataReader,
} from '../../src/data-graph/index.js';

import { conformanceDataset, conformanceGraph, TodoEntity, TodoMapping } from './fixtures.js';
import { dataGraphRuntimeConformance } from './runtime-conformance.js';

describe('PostgreSQL data graph runtime', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool;

  beforeAll(
    async () => {
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
    },
    180_000,
  );

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

  it('reads reflected entity data with search, filters, sorting and pagination', async () => {
    await resetPostgres();
    const reader = createPostgresReflectedEntityDataReader({
      pool,
      mappings: conformanceGraph.mappings,
      pageSizeOptions: [1, 2],
    });

    await expect(
      reader.readEntityData({
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
      reader.readEntityData({
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
      const reader = createPostgresReflectedEntityDataReader({
        pool,
        mappings: conformanceGraph.mappings,
      });

      await expect(reader.readEntityData({ entityName: 'Book' })).resolves.toMatchObject({
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
