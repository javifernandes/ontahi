import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  createEntityRef,
  entity,
  field,
  isDataGraphTransactionCapability,
  mapRelation,
  mutateEntity,
  relationConstraint,
  relationship,
  relationshipSet,
  selection,
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
import { createDataGraphArchitectureAdapter, layer } from '@ontahi/core/runtime/server';
import { createExpressGraphReadHandler } from '@ontahi/runtime-express/graph-read';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect, Either } from 'effect';
import express from 'express';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  conformanceDataset,
  conformanceGraph,
  TodoEntity,
  TodoMapping,
} from './fixtures.test-support.js';
import { dataGraphRuntimeConformance } from './runtime-conformance.test-support.js';

import {
  createPostgresDataGraphRuntime,
  createPostgresDataGraphStorage,
  type PostgresDataGraphError,
  type PostgresTransactionDataGraphRuntime,
  postgresMapping,
} from './index.js';

const RelationshipTag = entity('RelationshipTag', {
  id: field.id(),
  label: field.string(),
  assignable: field.boolean(),
});
const RelationshipCourse = entity('RelationshipCourse', {
  id: field.id(),
  name: field.string(),
  open: field.boolean(),
});
const RelationshipStudent = entity('RelationshipStudent', {
  id: field.id(),
  active: field.nullable(field.boolean()),
  course: field.nullable(field.ref(RelationshipCourse)),
});
RelationshipCourse.hasMany('students', RelationshipStudent, {
  via: 'course',
  constraints: [
    relationConstraint.source(RelationshipCourse, course => course.open.eq(true), {
      code: 'course_closed',
      message: 'Course is closed.',
    }),
    relationConstraint.target(RelationshipStudent, student => student.active.eq(true), {
      code: 'student_inactive',
      message: 'Student is inactive.',
    }),
  ],
});
const RelationshipCourseMapping = postgresMapping({
  entity: RelationshipCourse,
  table: 'relationship_courses',
  columns: { id: 'id', name: 'name', open: 'is_open' },
});
const RelationshipStudentMapping = postgresMapping({
  entity: RelationshipStudent,
  table: 'relationship_students',
  columns: { id: 'id', active: 'is_active', course: 'course_id' },
});
const CapacityCourse = entity('CapacityCourse', {
  id: field.id(),
  capacity: field.nonNegativeInteger(),
});
const CapacityStudent = entity('CapacityStudent', {
  id: field.id(),
  course: field.nullable(field.ref(CapacityCourse)),
});
CapacityCourse.hasMany('students', CapacityStudent, {
  via: 'course',
  constraints: [
    relationConstraint.countAtMost('capacity', {
      code: 'course_full',
      message: 'Course has no available seats.',
    }),
  ],
});
const CapacityCourseMapping = postgresMapping({
  entity: CapacityCourse,
  table: 'capacity_courses',
  columns: { id: 'id', capacity: 'capacity' },
});
const CapacityStudentMapping = postgresMapping({
  entity: CapacityStudent,
  table: 'capacity_students',
  columns: { id: 'id', course: 'course_id' },
});
const RelationshipTodoDefinition = entity('RelationshipTodo', {
  id: field.id(),
  title: field.string(),
  completed: field.boolean(),
});
const RelationshipTodo = RelationshipTodoDefinition.manyToMany('tags', RelationshipTag, {
  constraints: [
    relationConstraint.source(RelationshipTodoDefinition, todo => todo.completed.eq(false), {
      code: 'todo_completed',
      message: 'Completed todos cannot be tagged.',
    }),
    relationConstraint.target(RelationshipTag, tag => tag.assignable.eq(true), {
      code: 'tag_unassignable',
      message: 'Tag is not assignable.',
    }),
  ],
});
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
  columns: { id: 'id', title: 'title', completed: 'is_completed' },
});
const RelationshipTagMapping = postgresMapping({
  entity: RelationshipTag,
  table: 'relationship_tags',
  columns: { id: 'id', label: 'label', assignable: 'is_assignable' },
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
        title text NOT NULL,
        is_completed boolean NOT NULL
      );
      CREATE TABLE relationship_tags (
        id text PRIMARY KEY,
        label text NOT NULL,
        is_assignable boolean NOT NULL
      );
      CREATE TABLE relationship_todo_tags (
        todo_id text NOT NULL REFERENCES relationship_todos(id) ON DELETE CASCADE,
        tag_id text NOT NULL REFERENCES relationship_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (todo_id, tag_id)
      );
      CREATE TABLE relationship_courses (
        id text PRIMARY KEY,
        name text NOT NULL,
        is_open boolean NOT NULL
      );
      CREATE TABLE relationship_students (
        id text PRIMARY KEY,
        is_active boolean,
        course_id text REFERENCES relationship_courses(id)
      );
      CREATE TABLE capacity_courses (
        id text PRIMARY KEY,
        capacity integer NOT NULL CHECK (capacity >= 0)
      );
      CREATE TABLE capacity_students (
        id text PRIMARY KEY,
        course_id text REFERENCES capacity_courses(id)
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

  it('executes exact Entity Mutation Commands with portable deltas', async () => {
    await pool.query('TRUNCATE TABLE todos');
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: [TodoMapping] });
    const mutation = mutateEntity(TodoEntity);
    const todo = createEntityRef(TodoEntity, { id: 'todo-entity-command' });

    await expect(
      Effect.runPromise(
        runtime.runEntityMutationCommand(
          mutation.create({ id: 'todo-entity-command', title: 'Draft', completed: false }),
        ),
      ),
    ).resolves.toEqual({
      created: [
        {
          entityName: 'Todo',
          ref: todo,
          values: { id: 'todo-entity-command', title: 'Draft', completed: false },
        },
      ],
      updated: [],
      deleted: [],
    });
    await expect(
      Effect.runPromise(
        runtime.runEntityMutationCommand(
          mutation.update(todo, { completed: true }, { if: { completed: false } }),
        ),
      ),
    ).resolves.toMatchObject({
      created: [],
      updated: [{ entityName: 'Todo', ref: todo, values: { completed: true } }],
      deleted: [],
    });
    await expect(
      Effect.runPromise(
        runtime
          .runEntityMutationCommand(mutation.delete(todo, { if: { completed: false } }))
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'entity_mutation_condition_not_met' },
    });
    await expect(
      Effect.runPromise(
        runtime.runEntityMutationCommand(mutation.delete(todo, { if: { completed: true } })),
      ),
    ).resolves.toMatchObject({
      created: [],
      updated: [],
      deleted: [{ entityName: 'Todo', ref: todo, values: { completed: true } }],
    });
    await expect(
      Effect.runPromise(
        runtime.runEntityMutationCommand(mutation.delete(todo)).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
  });

  it('commits required mutations composed through one transaction runtime', async () => {
    await pool.query('TRUNCATE TABLE todos');
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: [TodoMapping] });

    const result = await Effect.runPromise(
      runtime.transaction(tx =>
        Effect.gen(function* () {
          expect(isDataGraphTransactionCapability(tx)).toBe(false);
          yield* tx.runCommand({
            kind: 'command',
            operation: 'insert',
            root: TodoEntity,
            selection: { kind: 'none' },
            payload: { id: 'todo-1', title: 'First', completed: false },
          });
          yield* tx.runCommand({
            kind: 'command',
            operation: 'insert',
            root: TodoEntity,
            selection: { kind: 'none' },
            payload: { id: 'todo-2', title: 'Second', completed: false },
          });

          return 'committed' as const;
        }),
      ),
    );

    expect(result).toBe('committed');
    await expect(
      Effect.runPromise(
        runtime.run(
          query(TodoEntity).orderBy(todo => todo.id),
          undefined,
        ),
      ),
    ).resolves.toEqual([
      { id: 'todo-1', title: 'First', completed: false },
      { id: 'todo-2', title: 'Second', completed: false },
    ]);
  });

  it('routes bound application commands through the contextual transaction runtime', async () => {
    await pool.query('TRUNCATE TABLE todos');
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      PostgresDataGraphError,
      undefined,
      undefined,
      PostgresTransactionDataGraphRuntime
    >({
      defaultStorage: createPostgresDataGraphStorage({ pool, mappings: [TodoMapping] }),
    });
    const Todo = graph.defineEntity(TodoEntity);
    const transition = layer('tests.postgres', {
      concerns: [graph.withRuntime()],
    }).effect('contextualTransaction', () =>
      graph.transaction(
        Effect.gen(function* () {
          yield* Todo.insert({
            id: 'todo-context-1',
            title: 'Context first',
            completed: false,
          }).run();
          yield* Todo.insert({
            id: 'todo-context-2',
            title: 'Context second',
            completed: false,
          }).run();
        }),
      ),
    );

    await transition();

    await expect(
      pool.query<{ id: string }>('SELECT todo_id AS id FROM todos ORDER BY todo_id'),
    ).resolves.toMatchObject({
      rows: [{ id: 'todo-context-1' }, { id: 'todo-context-2' }],
    });
  });

  it('rolls back every composed mutation and preserves the callback failure', async () => {
    await pool.query('TRUNCATE TABLE todos');
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: [TodoMapping] });
    const rejection = { code: 'course_capacity_rejected' } as const;

    const result = await Effect.runPromise(
      runtime
        .transaction(tx =>
          Effect.gen(function* () {
            yield* tx.runCommand({
              kind: 'command',
              operation: 'insert',
              root: TodoEntity,
              selection: { kind: 'none' },
              payload: { id: 'todo-rollback', title: 'Rollback', completed: false },
            });

            return yield* Effect.fail(rejection);
          }),
        )
        .pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) expect(result.left).toBe(rejection);
    await expect(Effect.runPromise(runtime.run(query(TodoEntity), undefined))).resolves.toEqual([]);
  });

  it('applies Selection-valued many-to-many commands atomically with exact deltas', async () => {
    await pool.query(
      'TRUNCATE TABLE relationship_todo_tags, relationship_todos, relationship_tags CASCADE',
    );
    await pool.query(
      `INSERT INTO relationship_todos (id, title, is_completed)
       VALUES ('todo-1', 'Selected', false), ('todo-2', 'Selected', false);
       INSERT INTO relationship_tags (id, label, is_assignable)
       VALUES ('tag-1', 'Core', true), ('tag-2', 'Other', true)`,
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
      status: 'applied',
      delta: {
        added: [{ target: { locator: { id: 'tag-1' } } }, { target: { locator: { id: 'tag-1' } } }],
        removed: [],
      },
    });
    await expect(Effect.runPromise(runtime.runManyToManyRelationshipCommand(add))).resolves.toEqual(
      {
        status: 'applied',
        delta: { added: [], removed: [] },
      },
    );
    const graph = createRuntimeBoundDataGraphApi(() => runtime);
    const Todos = graph.bindSelectionEntity(RelationshipTodo);
    const Tags = graph.bindSelectionEntity(RelationshipTag);
    await expect(
      Effect.runPromise(
        Tags.relatedTo(
          Todos.selection(todo => todo.id.eq('todo-1')),
          {
            through: 'tags',
          },
        ).resolveEntityRows(),
      ),
    ).resolves.toEqual([{ id: 'tag-1', label: 'Core', assignable: true }]);
    await expect(
      Effect.runPromise(
        Todos.relatedTo(
          Tags.selection(tag => tag.id.eq('tag-1')),
          {
            through: 'tags',
          },
        ).resolveEntityRows(),
      ),
    ).resolves.toEqual([
      { id: 'todo-1', title: 'Selected', completed: false },
      { id: 'todo-2', title: 'Selected', completed: false },
    ]);
    await expect(
      Effect.runPromise(
        Todos.relatedTo(
          Tags.selection(tag => tag.id.eq('tag-1')),
          {
            through: 'tags',
          },
        ).count(),
      ),
    ).resolves.toBe(2);
    const reflectedStorage = createPostgresDataGraphStorage({
      pool,
      mappings: [RelationshipTodoMapping, RelationshipTagMapping],
    });
    reflectedStorage.bindEntities?.([RelationshipTodo, RelationshipTag]);
    await expect(
      reflectedStorage.readRelatedEntityData!({
        source: createEntityRef(RelationshipTag, { id: 'tag-1' }),
        relationName: 'RelationshipTodo.tags',
        sourceEntityName: RelationshipTag.name,
        targetEntityName: RelationshipTodo.name,
      }),
    ).resolves.toMatchObject({
      rows: [
        { id: 'todo-1', title: 'Selected' },
        { id: 'todo-2', title: 'Selected' },
      ],
      totalCount: 2,
    });
    await pool.query(`UPDATE relationship_todos SET is_completed = true WHERE id = 'todo-2'`);
    try {
      await expect(
        Effect.runPromise(
          runtime
            .runManyToManyRelationshipCommand(
              relationshipSet(
                RelationshipTodo,
                'tags',
                selection(RelationshipTodo, todo => todo.title.eq('Selected')),
              ).add(selection(RelationshipTag, tag => tag.label.eq('Other'))),
            )
            .pipe(Effect.either),
        ),
      ).resolves.toMatchObject({
        _tag: 'Left',
        left: {
          reason: 'relation_constraint_rejected',
          rejection: { code: 'todo_completed' },
        },
      });
      await expect(
        pool.query(`SELECT todo_id FROM relationship_todo_tags WHERE tag_id = 'tag-2'`),
      ).resolves.toMatchObject({ rows: [] });
    } finally {
      await pool.query(`UPDATE relationship_todos SET is_completed = false WHERE id = 'todo-2'`);
    }
    await expect(
      Effect.runPromise(
        runtime
          .runManyToManyRelationshipCommand(
            relationshipSet(
              RelationshipTodo,
              'tags',
              createEntityRef(RelationshipTodo, { id: 'missing' }),
            ).add(createEntityRef(RelationshipTag, { id: 'tag-1' })),
          )
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
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
        runtime.runManyToManyRelationshipCommand(
          relationshipSet(
            RelationshipTodo,
            'tags',
            selection(RelationshipTodo, todo => todo.title.eq('Missing')),
          ).add(selection(RelationshipTag, tag => tag.label.eq('Core'))),
        ),
      ),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [] } });
    const remove = relationshipSet(
      RelationshipTodo,
      'tags',
      selection(RelationshipTodo, todo => todo.title.eq('Selected')),
    ).remove(selection(RelationshipTag, tag => tag.label.eq('Core')));
    await expect(
      Effect.runPromise(runtime.runManyToManyRelationshipCommand(remove)),
    ).resolves.toMatchObject({
      status: 'applied',
      delta: {
        added: [],
        removed: [
          { source: { locator: { id: 'todo-1' } }, target: { locator: { id: 'tag-1' } } },
          { source: { locator: { id: 'todo-2' } }, target: { locator: { id: 'tag-1' } } },
        ],
      },
    });
    await expect(
      Effect.runPromise(runtime.runManyToManyRelationshipCommand(remove)),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [] } });
    await expect(
      pool.query('SELECT todo_id, tag_id FROM relationship_todo_tags ORDER BY todo_id, tag_id'),
    ).resolves.toMatchObject({ rows: [] });
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
      completed: false,
      tags: [],
    });
  });

  it('applies direct conditional reassignment atomically and rejects stale callers', async () => {
    await pool.query('TRUNCATE TABLE relationship_students, relationship_courses CASCADE');
    await pool.query(
      `INSERT INTO relationship_courses (id, name, is_open)
       VALUES ('course-1', 'Previous', true), ('course-2', 'Next', false),
              ('course-3', 'Concurrent', true);
       INSERT INTO relationship_students (id, is_active, course_id)
       VALUES ('student-1', null, 'course-1')`,
    );
    const runtime = createPostgresDataGraphRuntime({
      pool,
      mappings: [RelationshipStudentMapping, RelationshipCourseMapping],
    });
    const student = createEntityRef(RelationshipStudent, { id: 'student-1' });
    const previous = createEntityRef(RelationshipCourse, { id: 'course-1' });
    const next = createEntityRef(RelationshipCourse, { id: 'course-2' });

    await expect(
      Effect.runPromise(
        runtime
          .runRelationshipCommand(
            relationship(RelationshipStudent, 'course', student).assign(next, {
              ifCurrent: previous,
            }),
          )
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'course_closed' },
      },
    });
    await expect(
      pool.query(`SELECT course_id FROM relationship_students WHERE id = 'student-1'`),
    ).resolves.toMatchObject({ rows: [{ course_id: 'course-1' }] });
    await pool.query(`UPDATE relationship_courses SET is_open = true WHERE id = 'course-2'`);
    await expect(
      Effect.runPromise(
        runtime
          .runRelationshipCommand(
            relationship(RelationshipStudent, 'course', student).assign(next, {
              ifCurrent: previous,
            }),
          )
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'student_inactive' },
      },
    });
    await pool.query(`UPDATE relationship_students SET is_active = true WHERE id = 'student-1'`);

    await expect(
      Effect.runPromise(
        runtime.runRelationshipCommand(
          relationship(RelationshipStudent, 'course', student).assign(next, {
            ifCurrent: previous,
          }),
        ),
      ),
    ).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [
          {
            relation: {
              sourceEntityName: 'RelationshipStudent',
              fieldName: 'course',
              targetEntityName: 'RelationshipCourse',
            },
            source: student,
            target: next,
          },
        ],
        removed: [
          {
            relation: {
              sourceEntityName: 'RelationshipStudent',
              fieldName: 'course',
              targetEntityName: 'RelationshipCourse',
            },
            source: student,
            target: previous,
          },
        ],
      },
    });
    await pool.query(
      `UPDATE relationship_students SET course_id = 'course-3' WHERE id = 'student-1'`,
    );
    await expect(
      Effect.runPromise(
        runtime
          .runRelationshipCommand(
            relationship(RelationshipStudent, 'course', student).assign(next, {
              ifCurrent: previous,
            }),
          )
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'relationship_precondition_failed' },
    });
    await expect(
      Effect.runPromise(
        runtime.runRelationshipCommand(
          relationship(RelationshipStudent, 'course', student).assign(next, {
            ifCurrent: previous,
            onMismatch: 'skip',
          }),
        ),
      ),
    ).resolves.toMatchObject({
      status: 'not-applied',
      diagnostic: { reason: 'relationship_precondition_failed' },
    });
    await expect(
      pool.query(`SELECT course_id FROM relationship_students WHERE id = 'student-1'`),
    ).resolves.toMatchObject({ rows: [{ course_id: 'course-3' }] });

    await expect(
      Effect.runPromise(
        runtime.runRelationshipCommand(
          relationship(RelationshipCourse, 'students', previous).remove(student),
        ),
      ),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [] } });
    const concurrent = createEntityRef(RelationshipCourse, { id: 'course-3' });
    await expect(
      Effect.runPromise(
        runtime.runRelationshipCommand(
          relationship(RelationshipCourse, 'students', concurrent).remove(student),
        ),
      ),
    ).resolves.toEqual({
      status: 'applied',
      delta: {
        added: [],
        removed: [
          {
            relation: {
              sourceEntityName: 'RelationshipStudent',
              fieldName: 'course',
              targetEntityName: 'RelationshipCourse',
            },
            source: student,
            target: concurrent,
          },
        ],
      },
    });
    await expect(
      Effect.runPromise(
        runtime.runRelationshipCommand(
          relationship(RelationshipStudent, 'course', student).assign(next),
        ),
      ),
    ).resolves.toMatchObject({
      status: 'applied',
      delta: { added: [{ target: next }], removed: [] },
    });
    await expect(
      Effect.runPromise(
        runtime.runRelationshipCommand(
          relationship(RelationshipStudent, 'course', student).clear(),
        ),
      ),
    ).resolves.toMatchObject({
      status: 'applied',
      delta: { added: [], removed: [{ target: next }] },
    });
  });

  it('serializes concurrent admissions competing for the last Relation slot', async () => {
    await pool.query('TRUNCATE TABLE capacity_students, capacity_courses CASCADE');
    await pool.query(
      `INSERT INTO capacity_courses (id, capacity) VALUES ('course-1', 1);
       INSERT INTO capacity_students (id, course_id)
       VALUES ('student-1', null), ('student-2', null)`,
    );
    const runtime = createPostgresDataGraphRuntime({
      pool,
      mappings: [CapacityCourseMapping, CapacityStudentMapping],
    });
    const course = createEntityRef(CapacityCourse, { id: 'course-1' });
    const commands = ['student-1', 'student-2'].map(id =>
      runtime
        .runRelationshipCommand(
          relationship(CapacityStudent, 'course', createEntityRef(CapacityStudent, { id })).assign(
            course,
          ),
        )
        .pipe(Effect.either, Effect.runPromise),
    );

    const results = await Promise.all(commands);
    expect(results.filter(Either.isRight)).toHaveLength(1);
    const rejected = results.filter(Either.isLeft);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'relation_constraint_rejected',
        rejection: { code: 'course_full' },
      },
    });
    await expect(
      pool.query(`SELECT id FROM capacity_students WHERE course_id = 'course-1'`),
    ).resolves.toMatchObject({ rowCount: 1 });
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
