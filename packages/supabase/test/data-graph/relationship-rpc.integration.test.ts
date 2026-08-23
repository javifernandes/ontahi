import {
  createEntityRef,
  entity,
  field,
  mapEntity,
  relationship,
  type RelationshipCommand,
} from '@ontahi/core/data-graph';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compileSupabaseRelationshipRpcPayload,
  supabaseRelationshipRpcSql,
} from '../../src/data-graph/index.js';

const Course = entity('RpcCourse', { id: field.id(), name: field.string() });
const Student = entity('RpcStudent', {
  id: field.id(),
  course: field.nullable(field.ref(Course)),
});
mapEntity(Course).toTable('rpc_courses');
mapEntity(Student).toTable('rpc_students', { course: 'course_id' });

describe('Supabase direct Relationship RPC SQL', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(supabaseRelationshipRpcSql);
    await pool.query(`
      create table rpc_courses (id text primary key, name text not null);
      create table rpc_students (
        id text primary key,
        course_id text references rpc_courses(id)
      );
      insert into rpc_courses (id, name)
      values ('course-1', 'Previous'), ('course-2', 'Next'), ('course-3', 'Concurrent');
      insert into rpc_students (id, course_id) values ('student-1', 'course-1');
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
      changed: false,
    });
    await expect(
      pool.query('select course_id from rpc_students where id = $1', ['student-1']),
    ).resolves.toMatchObject({ rows: [{ course_id: 'course-3' }] });
  });
});
