import {
  createInMemoryDataGraphRuntime,
  createEntityRef,
  entity,
  field,
  mapRelation,
  query,
  relationshipSet,
  selection,
  type InMemoryDataset,
} from '@ontahi/core/data-graph';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect } from 'effect';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPostgresDataGraphRuntime,
  createPostgresDataGraphStorage,
  postgresMapping,
} from '../../src/data-graph/index.js';

import { conformanceDataset, conformanceGraph, TodoEntity, TodoMapping } from './fixtures.js';
import { dataGraphRuntimeConformance } from './runtime-conformance.js';

const RelationshipTag = entity('RelationshipTag', { id: field.id(), label: field.string() });
const RelationshipTodo = entity('RelationshipTodo', {
  id: field.id(),
  title: field.string(),
}).manyToMany('tags', RelationshipTag);
mapRelation(RelationshipTodo, 'tags', {
  type: 'many-to-many',
  from: 'relationship_todos.id',
  through: {
    table: 'relationship_todo_tags',
    fromColumn: 'todo_id',
    toColumn: 'tag_id',
  },
  to: 'relationship_tags.id',
});
const RelationshipTodoMapping = postgresMapping({
  entity: RelationshipTodo,
  table: 'relationship_todos',
  columns: { id: 'id', title: 'title' },
});
const RelationshipTagMapping = postgresMapping({
  entity: RelationshipTag,
  table: 'relationship_tags',
  columns: { id: 'id', label: 'label' },
});

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
      );
      CREATE TABLE relationship_todos (
        id text PRIMARY KEY,
        title text NOT NULL
      );
      CREATE TABLE relationship_tags (
        id text PRIMARY KEY,
        label text NOT NULL
      );
      CREATE TABLE relationship_todo_tags (
        todo_id text NOT NULL REFERENCES relationship_todos(id) ON DELETE CASCADE,
        tag_id text NOT NULL REFERENCES relationship_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (todo_id, tag_id)
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

  it('applies Selection-valued many-to-many commands atomically with exact deltas', async () => {
    await pool.query(
      'TRUNCATE TABLE relationship_todo_tags, relationship_todos, relationship_tags CASCADE',
    );
    await pool.query(
      `INSERT INTO relationship_todos (id, title) VALUES ('todo-1', 'Selected'), ('todo-2', 'Selected');
       INSERT INTO relationship_tags (id, label) VALUES ('tag-1', 'Core'), ('tag-2', 'Other')`,
    );
    const runtime = createPostgresDataGraphRuntime({
      pool,
      mappings: [RelationshipTodoMapping, RelationshipTagMapping],
    });
    const add = relationshipSet(
      RelationshipTodo,
      'tags',
      selection(RelationshipTodo, todo => todo.title.eq('Selected')),
    ).add(selection(RelationshipTag, tag => tag.label.eq('Core')));

    await expect(
      Effect.runPromise(runtime.runManyToManyRelationshipCommand(add)),
    ).resolves.toMatchObject({
      added: [{ target: { locator: { id: 'tag-1' } } }, { target: { locator: { id: 'tag-1' } } }],
      removed: [],
    });
    await expect(Effect.runPromise(runtime.runManyToManyRelationshipCommand(add))).resolves.toEqual(
      {
        added: [],
        removed: [],
      },
    );
    await expect(
      Effect.runPromise(
        runtime.runManyToManyRelationshipCommand(
          relationshipSet(
            RelationshipTodo,
            'tags',
            createEntityRef(RelationshipTodo, { id: 'missing' }),
          ).add(createEntityRef(RelationshipTag, { id: 'tag-1' })),
        ),
      ),
    ).rejects.toMatchObject({ reason: 'cardinality_mismatch' });
    await expect(
      pool.query('SELECT todo_id, tag_id FROM relationship_todo_tags ORDER BY todo_id, tag_id'),
    ).resolves.toMatchObject({
      rows: [
        { todo_id: 'todo-1', tag_id: 'tag-1' },
        { todo_id: 'todo-2', tag_id: 'tag-1' },
      ],
    });
    await expect(
      Effect.runPromise(
        runtime.get(
          query(RelationshipTodo)
            .where(todo => todo.id.eq('todo-1'))
            .include(todo => ({ tags: todo.tags.orderBy(tag => tag.label) })),
          undefined,
        ),
      ),
    ).resolves.toEqual({
      id: 'todo-1',
      title: 'Selected',
      tags: [{ id: 'tag-1', label: 'Core' }],
    });
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
