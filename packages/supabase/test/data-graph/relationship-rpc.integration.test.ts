import {
  createEntityRef,
  entity,
  field,
  mapEntity,
  mapRelation,
  relationConstraint,
  relationship,
  relationshipSet,
  selection,
  type ManyToManyRelationshipCommand,
  type RelationshipCommand,
} from '@ontahi/core/data-graph';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compileSupabaseRelationshipRpcPayload,
  compileSupabaseManyToManyRpcPayload,
  supabaseManyToManyRpcSql,
  supabaseRelationshipRpcSql,
} from '../../src/data-graph/index.js';

const Course = entity('RpcCourse', { id: field.id(), name: field.string() });
const Student = entity('RpcStudent', {
  id: field.id(),
  course: field.nullable(field.ref(Course)),
});
mapEntity(Course).toTable('rpc_courses');
mapEntity(Student).toTable('rpc_students', { course: 'course_id' });

const GuardedCourse = entity('GuardedRpcCourse', {
  id: field.id(),
  open: field.boolean(),
});
const GuardedStudent = entity('GuardedRpcStudent', {
  id: field.id(),
  active: field.nullable(field.boolean()),
  course: field.nullable(field.ref(GuardedCourse)),
});
GuardedCourse.hasMany('students', GuardedStudent, {
  constraints: [
    relationConstraint.source(GuardedCourse, course => course.open.eq(true), {
      code: 'course_closed',
      message: 'Course is closed.',
    }),
    relationConstraint.target(GuardedStudent, student => student.active.eq(true), {
      code: 'student_inactive',
      message: 'Student is inactive.',
    }),
  ],
});
mapEntity(GuardedCourse).toTable('guarded_rpc_courses', { open: 'is_open' });
mapEntity(GuardedStudent).toTable('guarded_rpc_students', {
  active: 'is_active',
  course: 'course_id',
});

const GuardedTag = entity('GuardedRpcTag', { id: field.id(), assignable: field.boolean() });
const GuardedTodoDefinition = entity('GuardedRpcTodo', {
  id: field.id(),
  completed: field.boolean(),
});
const GuardedTodo = GuardedTodoDefinition.manyToMany('tags', GuardedTag, {
  constraints: [
    relationConstraint.source(GuardedTodoDefinition, todo => todo.completed.eq(false), {
      code: 'todo_completed',
      message: 'Completed todos cannot be tagged.',
    }),
    relationConstraint.target(GuardedTag, tag => tag.assignable.eq(true), {
      code: 'tag_unassignable',
      message: 'Tag is not assignable.',
    }),
  ],
});
mapEntity(GuardedTodo).toTable('guarded_rpc_todos', { completed: 'is_completed' });
mapEntity(GuardedTag).toTable('guarded_rpc_tags', { assignable: 'is_assignable' });
mapRelation(GuardedTodo, 'tags', {
  type: 'many-to-many',
  from: 'guarded_rpc_todos.id',
  through: {
    table: 'guarded_rpc_todo_tags',
    fromColumn: 'todo_id',
    toColumn: 'tag_id',
  },
  to: 'guarded_rpc_tags.id',
});

describe('Supabase direct Relationship RPC SQL', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(supabaseRelationshipRpcSql);
    await pool.query(supabaseManyToManyRpcSql);
    await pool.query(`
      create table rpc_courses (id text primary key, name text not null);
      create table rpc_students (
        id text primary key,
        course_id text references rpc_courses(id)
      );
      insert into rpc_courses (id, name)
      values ('course-1', 'Previous'), ('course-2', 'Next'), ('course-3', 'Concurrent');
      insert into rpc_students (id, course_id) values ('student-1', 'course-1');
      create table guarded_rpc_courses (id text primary key, is_open boolean not null);
      create table guarded_rpc_students (
        id text primary key,
        is_active boolean,
        course_id text references guarded_rpc_courses(id)
      );
      create table guarded_rpc_todos (id text primary key, is_completed boolean not null);
      create table guarded_rpc_tags (id text primary key, is_assignable boolean not null);
      create table guarded_rpc_todo_tags (
        todo_id text not null references guarded_rpc_todos(id),
        tag_id text not null references guarded_rpc_tags(id),
        primary key (todo_id, tag_id)
      );
      insert into guarded_rpc_courses (id, is_open) values ('course-1', false);
      insert into guarded_rpc_students (id, is_active, course_id)
      values ('student-1', null, null);
      insert into guarded_rpc_todos (id, is_completed)
      values ('todo-1', false), ('todo-2', true);
      insert into guarded_rpc_tags (id, is_assignable) values ('tag-1', true);
    `);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const apply = async (command: RelationshipCommand) => {
    const result = await pool.query<{ result: Record<string, unknown> }>(
      'select public.ontahi_apply_relationship($1::jsonb) as result',
      [compileSupabaseRelationshipRpcPayload(command, [Student, Course])],
    );
    return result.rows[0]!.result;
  };

  const applyGuarded = async (command: RelationshipCommand) => {
    const result = await pool.query<{ result: Record<string, unknown> }>(
      'select public.ontahi_apply_relationship($1::jsonb) as result',
      [compileSupabaseRelationshipRpcPayload(command, [GuardedStudent, GuardedCourse])],
    );
    return result.rows[0]!.result;
  };

  const applyManyToMany = async (command: ManyToManyRelationshipCommand) => {
    const result = await pool.query<{ result: Record<string, unknown> }>(
      'select public.ontahi_apply_many_to_many_relationship($1::jsonb) as result',
      [compileSupabaseManyToManyRpcPayload(command, [GuardedTodo, GuardedTag])],
    );
    return result.rows[0]!.result;
  };

  it('applies and rejects conditional transitions without a read/write race', async () => {
    const student = createEntityRef(Student, { id: 'student-1' });
    const previous = createEntityRef(Course, { id: 'course-1' });
    const next = createEntityRef(Course, { id: 'course-2' });

    await expect(
      apply(relationship(Student, 'course', student).assign(next, { ifCurrent: previous })),
    ).resolves.toEqual({
      sourceCount: 1,
      targetCount: 1,
      oldTarget: 'course-1',
      preconditionMatched: true,
      constraintRejection: null,
      changed: true,
    });
    await pool.query(`update rpc_students set course_id = 'course-3' where id = 'student-1'`);
    await expect(
      apply(relationship(Student, 'course', student).assign(next, { ifCurrent: previous })),
    ).resolves.toEqual({
      sourceCount: 1,
      targetCount: 1,
      oldTarget: 'course-3',
      preconditionMatched: false,
      constraintRejection: null,
      changed: false,
    });
    await expect(
      pool.query('select course_id from rpc_students where id = $1', ['student-1']),
    ).resolves.toMatchObject({ rows: [{ course_id: 'course-3' }] });
  });

  it('rejects direct participant eligibility inside the mutation transaction', async () => {
    const student = createEntityRef(GuardedStudent, { id: 'student-1' });
    const course = createEntityRef(GuardedCourse, { id: 'course-1' });
    const command = relationship(GuardedStudent, 'course', student).assign(course);

    await expect(applyGuarded(command)).resolves.toEqual({
      sourceCount: 1,
      targetCount: 1,
      oldTarget: null,
      preconditionMatched: true,
      constraintRejection: {
        version: 1,
        code: 'course_closed',
        message: 'Course is closed.',
      },
      changed: false,
    });
    await expect(
      pool.query('select course_id from guarded_rpc_students where id = $1', ['student-1']),
    ).resolves.toMatchObject({ rows: [{ course_id: null }] });

    await pool.query(`update guarded_rpc_courses set is_open = true where id = 'course-1'`);
    await expect(applyGuarded(command)).resolves.toMatchObject({
      constraintRejection: {
        version: 1,
        code: 'student_inactive',
        message: 'Student is inactive.',
      },
      changed: false,
    });
    await pool.query(`update guarded_rpc_students set is_active = true where id = 'student-1'`);
    await expect(applyGuarded(command)).resolves.toMatchObject({
      constraintRejection: null,
      changed: true,
    });
  });

  it('rejects a mixed many-to-many set without partial edges and lets unlink repair it', async () => {
    const tag = createEntityRef(GuardedTag, { id: 'tag-1' });
    const add = relationshipSet(
      GuardedTodo,
      'tags',
      selection(GuardedTodo, todo => todo.id.in(['todo-1', 'todo-2'])),
    ).add(tag);

    await expect(applyManyToMany(add)).resolves.toEqual({
      sourceCount: 2,
      targetCount: 1,
      constraintRejection: {
        version: 1,
        code: 'todo_completed',
        message: 'Completed todos cannot be tagged.',
      },
      changed: [],
    });
    await expect(pool.query('select * from guarded_rpc_todo_tags')).resolves.toMatchObject({
      rows: [],
    });

    await pool.query(
      `insert into guarded_rpc_todo_tags (todo_id, tag_id) values ('todo-2', 'tag-1')`,
    );
    await expect(
      applyManyToMany(
        relationshipSet(GuardedTodo, 'tags', createEntityRef(GuardedTodo, { id: 'todo-2' })).remove(
          tag,
        ),
      ),
    ).resolves.toMatchObject({
      constraintRejection: null,
      changed: [{ source: 'todo-2', target: 'tag-1' }],
    });
    await expect(pool.query('select * from guarded_rpc_todo_tags')).resolves.toMatchObject({
      rows: [],
    });
  });
});
