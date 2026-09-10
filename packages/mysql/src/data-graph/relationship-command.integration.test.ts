import {
  entity,
  field,
  mapEntity,
  mapRelation,
  modelExpression,
  query,
  createEntityRef,
  relationConstraint,
  relationship,
  relationshipSet,
  selection,
  type AnyEntityDefinition,
  type RelationshipCommandResult,
  type OrderedRelationshipPlacement,
  type RelationshipDelta,
  type OrderedRelationshipMove,
} from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startMysqlTestDatabase } from './mysql.test-support.js';

import { createMysqlDataGraphRuntime, mysqlMapping } from './index.js';

const Course = entity('Course', {
  id: field.id(),
  capacity: field.number(),
  open: field.boolean(),
  availableSeats: field.derived(
    field.number(),
    modelExpression.define(
      modelExpression.subtract(
        modelExpression.field('capacity'),
        modelExpression.relation('students').count(),
      ),
    ),
  ),
});
const Student = entity('Student', {
  id: field.id(),
  active: field.boolean(),
  course: field.nullable(field.ref(Course)),
});
const CourseRelations = Course.hasMany('students', Student, {
  via: 'course',
  constraints: [
    relationConstraint.source(Course, row => row.open.eq(true), {
      code: 'closed',
      message: 'Course closed.',
    }),
    relationConstraint.target(Student, row => row.active.eq(true), {
      code: 'inactive',
      message: 'Student inactive.',
    }),
    relationConstraint.countAtMost('capacity', { code: 'full', message: 'Course full.' }),
  ],
});
const Tag = entity('EdgeTag', { id: field.id(), enabled: field.boolean() });
mapEntity(Course).toTable('rel_courses');
mapEntity(Student).toTable('rel_students', { course: 'course_id' });
mapRelation(CourseRelations, 'students', {
  type: 'one-to-many',
  from: 'rel_courses.id',
  to: 'rel_students.course_id',
});
const Task = entity('EdgeTask', { id: field.id() }).manyToMany('tags', Tag, {
  constraints: [
    relationConstraint.target(Tag, row => row.enabled.eq(true), {
      code: 'disabled',
      message: 'Tag disabled.',
    }),
  ],
});
mapEntity(Task).toTable('rel_tasks');
mapEntity(Tag).toTable('rel_tags');
mapRelation(Task, 'tags', {
  type: 'many-to-many',
  from: 'rel_tasks.id',
  to: 'rel_tags.id',
  through: { table: 'rel_edges', fromColumn: 'task_id', toColumn: 'tag_id' },
});
const ListBase = entity('OrderList', { id: field.id() });
const Item = entity('OrderItem', { id: field.id(), list: field.ref(ListBase) });
const List = ListBase.hasMany('items', Item, { via: 'list', ordered: true });
mapEntity(List).toTable('rel_lists');
mapEntity(Item).toTable('rel_items', { list: 'list_id' });
mapRelation(List, 'items', {
  type: 'one-to-many',
  from: 'rel_lists.id',
  to: 'rel_items.list_id',
  orderBy: 'rel_items.position',
});
const mappings = [
  mysqlMapping({
    entity: Course,
    table: 'rel_courses',
    columns: { id: 'id', capacity: 'capacity', open: 'open' },
  }),
  mysqlMapping({
    entity: Student,
    table: 'rel_students',
    columns: { id: 'id', active: 'active', course: 'course_id' },
  }),
  mysqlMapping({ entity: Task, table: 'rel_tasks', columns: { id: 'id' } }),
  mysqlMapping({ entity: Tag, table: 'rel_tags', columns: { id: 'id', enabled: 'enabled' } }),
  mysqlMapping({ entity: List, table: 'rel_lists', columns: { id: 'id' } }),
  mysqlMapping({ entity: Item, table: 'rel_items', columns: { id: 'id', list: 'list_id' } }),
];
let database: Awaited<ReturnType<typeof startMysqlTestDatabase>>;
let pool: Pool;
const runtime = () => createMysqlDataGraphRuntime({ pool, mappings });
const ref = <TEntity extends AnyEntityDefinition>(entity: TEntity, id: string) =>
  createEntityRef(entity, { id });
const assigned = (student: string, course: string) =>
  relationship(Student, 'course', ref(Student, student)).assign(ref(Course, course));
const move = (member: string, position: OrderedRelationshipPlacement) =>
  relationship(List, 'items', ref(List, 'l1')).move(ref(Item, member), position);
const edge = (task: string, tag: string) =>
  relationshipSet(Task, 'tags', ref(Task, task)).add(ref(Tag, tag));
const delta = (
  result: RelationshipCommandResult,
): RelationshipDelta & { moved?: OrderedRelationshipMove[] } => {
  if (result.status !== 'applied') throw new Error('Expected applied result.');
  return result.delta;
};
const orderedIds = async () => {
  const result = await Effect.runPromise(
    runtime().get(
      query(List)
        .where(row => row.id.eq('l1'))
        .include(row => ({ items: row.items })),
      undefined,
    ),
  );
  return result?.items.map(row => row.id);
};

beforeAll(async () => {
  database = await startMysqlTestDatabase();
  pool = database.pool;
  for (const sql of [
    'CREATE TABLE IF NOT EXISTS rel_courses (id VARCHAR(50) PRIMARY KEY, capacity INT, `open` BOOLEAN) ENGINE=InnoDB',
    'CREATE TABLE IF NOT EXISTS rel_students (id VARCHAR(50) PRIMARY KEY, active BOOLEAN, course_id VARCHAR(50), FOREIGN KEY (course_id) REFERENCES rel_courses(id)) ENGINE=InnoDB',
    'CREATE TABLE IF NOT EXISTS rel_tasks (id VARCHAR(50) PRIMARY KEY) ENGINE=InnoDB',
    'CREATE TABLE IF NOT EXISTS rel_tags (id VARCHAR(50) PRIMARY KEY, enabled BOOLEAN) ENGINE=InnoDB',
    'CREATE TABLE IF NOT EXISTS rel_edges (task_id VARCHAR(50), tag_id VARCHAR(50), PRIMARY KEY(task_id,tag_id), FOREIGN KEY(task_id) REFERENCES rel_tasks(id), FOREIGN KEY(tag_id) REFERENCES rel_tags(id)) ENGINE=InnoDB',
    'CREATE TABLE IF NOT EXISTS rel_lists (id VARCHAR(50) PRIMARY KEY) ENGINE=InnoDB',
    'CREATE TABLE IF NOT EXISTS rel_items (id VARCHAR(50) PRIMARY KEY, list_id VARCHAR(50) NOT NULL, position BIGINT NOT NULL, UNIQUE(list_id,position), FOREIGN KEY(list_id) REFERENCES rel_lists(id)) ENGINE=InnoDB',
  ])
    await pool.query(sql);
}, 180_000);
afterAll(async () => database?.close());
beforeEach(async () => {
  for (const table of [
    'rel_edges',
    'rel_items',
    'rel_students',
    'rel_tasks',
    'rel_tags',
    'rel_lists',
    'rel_courses',
  ])
    await pool.query(`DELETE FROM ${table}`);
  for (const sql of [
    "INSERT INTO rel_courses VALUES ('c1',1,true),('c2',5,true),('closed',5,false)",
    "INSERT INTO rel_students VALUES ('s1',true,NULL),('s2',true,NULL),('inactive',false,NULL)",
    "INSERT INTO rel_tasks VALUES ('t1'),('t2')",
    "INSERT INTO rel_tags VALUES ('g1',true),('g2',true),('disabled',false)",
    "INSERT INTO rel_lists VALUES ('l1'),('l2')",
    "INSERT INTO rel_items VALUES ('i1','l1',1),('i2','l1',2),('i3','l1',3),('other','l2',1)",
  ])
    await pool.query(sql);
});

describe('MySQL direct Relations', () => {
  it('projects, filters, and sorts correlated derived fields without exposing dependencies', async () => {
    await Effect.runPromise(runtime().runRelationshipCommand(assigned('s1', 'c1')));
    await expect(
      Effect.runPromise(
        runtime().run(
          query(Course)
            .where(row => row.availableSeats.lt(5))
            .orderBy(row => row.availableSeats.asc())
            .select(row => ({ id: row.id, seats: row.availableSeats })),
          undefined,
        ),
      ),
    ).resolves.toEqual([{ id: 'c1', seats: 0 }]);
  });
  it('returns exact assign, replace, no-op, and clear deltas', async () => {
    expect(
      delta(await Effect.runPromise(runtime().runRelationshipCommand(assigned('s1', 'c1')))),
    ).toEqual({
      added: [
        {
          relation: assigned('s1', 'c1').relation,
          source: ref(Student, 's1'),
          target: ref(Course, 'c1'),
        },
      ],
      removed: [],
    });
    expect(
      delta(await Effect.runPromise(runtime().runRelationshipCommand(assigned('s1', 'c1')))),
    ).toEqual({ added: [], removed: [] });
    const changed = delta(
      await Effect.runPromise(runtime().runRelationshipCommand(assigned('s1', 'c2'))),
    );
    expect(changed.added[0]?.target).toEqual(ref(Course, 'c2'));
    expect(changed.removed[0]?.target).toEqual(ref(Course, 'c1'));
    const clear = relationship(Student, 'course', ref(Student, 's1')).clear();
    expect(
      delta(await Effect.runPromise(runtime().runRelationshipCommand(clear))).removed,
    ).toHaveLength(1);
    expect(delta(await Effect.runPromise(runtime().runRelationshipCommand(clear)))).toEqual({
      added: [],
      removed: [],
    });
  });
  it('enforces participant eligibility without changing membership', async () => {
    for (const [student, course, code] of [
      ['s1', 'closed', 'closed'],
      ['inactive', 'c1', 'inactive'],
    ]) {
      expect(
        await Effect.runPromise(
          runtime().runRelationshipCommand(assigned(student!, course!)).pipe(Effect.either),
        ),
      ).toMatchObject({
        _tag: 'Left',
        left: { reason: 'relation_constraint_rejected', rejection: { code } },
      });
    }
    const [rows] = await pool.query<RowDataPacket[]>('SELECT course_id FROM rel_students');
    expect(rows.every(row => row.course_id === null)).toBe(true);
  });
  it('preserves count limits under competing connections', async () => {
    const results = await Promise.all(
      ['s1', 's2'].map(id =>
        Effect.runPromise(runtime().runRelationshipCommand(assigned(id, 'c1')).pipe(Effect.either)),
      ),
    );
    expect(results.filter(result => result._tag === 'Right')).toHaveLength(1);
    expect(results.filter(result => result._tag === 'Left')).toMatchObject([
      { left: { reason: 'relation_constraint_rejected', rejection: { code: 'full' } } },
    ]);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM rel_students WHERE course_id='c1'",
    );
    expect(rows).toHaveLength(1);
  });
  it('checks conditional assignments with both fail and skip outcomes', async () => {
    await Effect.runPromise(runtime().runRelationshipCommand(assigned('s1', 'c1')));
    const command = relationship(Student, 'course', ref(Student, 's1')).assign(ref(Course, 'c2'), {
      ifCurrent: ref(Course, 'closed'),
    });
    expect(
      await Effect.runPromise(runtime().runRelationshipCommand(command).pipe(Effect.either)),
    ).toMatchObject({ _tag: 'Left', left: { reason: 'relationship_precondition_failed' } });
    expect(
      await Effect.runPromise(
        runtime().runRelationshipCommand({
          ...command,
          precondition: { ...command.precondition!, onMismatch: 'skip' },
        }),
      ),
    ).toMatchObject({ status: 'not-applied' });
  });
  it('rejects clearing a required reference and missing endpoints', async () => {
    expect(
      await Effect.runPromise(
        runtime()
          .runRelationshipCommand({
            kind: 'relationship-command',
            action: 'unlink',
            relation: {
              sourceEntityName: Item.name,
              fieldName: 'list',
              targetEntityName: List.name,
            },
            source: ref(Item, 'i1'),
          })
          .pipe(Effect.either),
      ),
    ).toMatchObject({ _tag: 'Left', left: { reason: 'invalid_command' } });
    expect(
      await Effect.runPromise(
        runtime().runRelationshipCommand(assigned('missing', 'c1')).pipe(Effect.either),
      ),
    ).toMatchObject({ _tag: 'Left', left: { reason: 'cardinality_mismatch' } });
  });
});

describe('MySQL many-to-many Relations', () => {
  it('adds a Cartesian selection, preserves idempotency, reads links and removes exact edges', async () => {
    const add = relationshipSet(
      Task,
      'tags',
      selection(Task, row => row.id.in(['t1', 't2'])),
    ).add(selection(Tag, row => row.enabled.eq(true)));
    expect(
      delta(await Effect.runPromise(runtime().runManyToManyRelationshipCommand(add))).added,
    ).toHaveLength(4);
    expect(
      delta(await Effect.runPromise(runtime().runManyToManyRelationshipCommand(add))).added,
    ).toEqual([]);
    const rows = await Effect.runPromise(
      runtime().run(
        query(Task)
          .include(row => ({ tags: row.tags.orderBy(tag => tag.id) }))
          .orderBy(row => row.id),
        undefined,
      ),
    );
    expect(rows.map(row => row.tags.map(tag => tag.id))).toEqual([
      ['g1', 'g2'],
      ['g1', 'g2'],
    ]);
    const remove = relationshipSet(Task, 'tags', ref(Task, 't1')).remove(ref(Tag, 'g1'));
    expect(
      delta(await Effect.runPromise(runtime().runManyToManyRelationshipCommand(remove))).removed,
    ).toHaveLength(1);
    expect(
      delta(await Effect.runPromise(runtime().runManyToManyRelationshipCommand(remove))).removed,
    ).toEqual([]);
  });
  it('rejects missing explicit refs and ineligible participants before any edge is written', async () => {
    const command = edge('t1', 'g1');
    const missing = {
      ...command,
      targets: {
        entityName: Tag.name,
        selection: { kind: 'references' as const, refs: [ref(Tag, 'g1'), ref(Tag, 'missing')] },
      },
    };
    expect(
      await Effect.runPromise(
        runtime().runManyToManyRelationshipCommand(missing).pipe(Effect.either),
      ),
    ).toMatchObject({ _tag: 'Left', left: { reason: 'cardinality_mismatch' } });
    expect(
      await Effect.runPromise(
        runtime().runManyToManyRelationshipCommand(edge('t1', 'disabled')).pipe(Effect.either),
      ),
    ).toMatchObject({
      _tag: 'Left',
      left: { reason: 'relation_constraint_rejected', rejection: { code: 'disabled' } },
    });
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM rel_edges');
    expect(rows).toEqual([]);
  });
  it('reports one added edge for competing duplicate commands', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        Effect.runPromise(runtime().runManyToManyRelationshipCommand(edge('t1', 'g1'))),
      ),
    );
    expect(results.flatMap(result => delta(result).added)).toHaveLength(1);
  });
});

describe('MySQL ordered Relations', () => {
  it('moves with exact neighbor deltas while retaining a unique position index', async () => {
    const result = delta(
      await Effect.runPromise(runtime().runOrderedRelationshipCommand(move('i3', { at: 'start' }))),
    );
    expect(result.moved).toEqual([
      {
        relation: move('i3', { at: 'start' }).relation,
        source: ref(List, 'l1'),
        member: ref(Item, 'i3'),
        from: { before: null, after: ref(Item, 'i2') },
        to: { before: ref(Item, 'i1'), after: null },
      },
    ]);
    expect(await orderedIds()).toEqual(['i3', 'i1', 'i2']);
    await Effect.runPromise(
      runtime().runOrderedRelationshipCommand(move('i3', { after: ref(Item, 'i2') })),
    );
    expect(await orderedIds()).toEqual(['i1', 'i2', 'i3']);
    expect(
      delta(
        await Effect.runPromise(runtime().runOrderedRelationshipCommand(move('i3', { at: 'end' }))),
      ).moved,
    ).toEqual([]);
  });
  it('rejects foreign anchors and checks positional preconditions', async () => {
    expect(
      await Effect.runPromise(
        runtime()
          .runOrderedRelationshipCommand(move('i1', { before: ref(Item, 'other') }))
          .pipe(Effect.either),
      ),
    ).toMatchObject({
      _tag: 'Left',
      left: { rejection: { code: 'ordered_relationship_anchor_not_in_relation' } },
    });
    const command = {
      ...move('i1', { at: 'end' }),
      precondition: {
        position: { before: null, after: ref(Item, 'i2') },
        onMismatch: 'skip' as const,
      },
    };
    expect(await Effect.runPromise(runtime().runOrderedRelationshipCommand(command))).toMatchObject(
      { status: 'not-applied' },
    );
    expect(await orderedIds()).toEqual(['i1', 'i2', 'i3']);
  });
  it('serializes competing moves without lost members or duplicate positions', async () => {
    await Promise.all(
      ['i2', 'i3'].map(id =>
        Effect.runPromise(runtime().runOrderedRelationshipCommand(move(id, { at: 'start' }))),
      ),
    );
    expect(new Set(await orderedIds())).toEqual(new Set(['i1', 'i2', 'i3']));
    const [positions] = await pool.query<RowDataPacket[]>(
      "SELECT position FROM rel_items WHERE list_id='l1' ORDER BY position",
    );
    expect(positions.map(row => row.position)).toEqual([1, 2, 3]);
  });
  it('rolls back relation edges and ordering with the outer transaction', async () => {
    await Effect.runPromise(
      runtime()
        .transaction(tx =>
          tx
            .runManyToManyRelationshipCommand(edge('t1', 'g1'))
            .pipe(
              Effect.zipRight(tx.runOrderedRelationshipCommand(move('i3', { at: 'start' }))),
              Effect.zipRight(Effect.fail('abort')),
            ),
        )
        .pipe(Effect.either),
    );
    expect(await orderedIds()).toEqual(['i1', 'i2', 'i3']);
    const [edges] = await pool.query<RowDataPacket[]>('SELECT * FROM rel_edges');
    expect(edges).toEqual([]);
  });
});
