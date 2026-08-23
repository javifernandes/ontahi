import { createEntityRef, entity, field, mapEntity, relationship } from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  compileSupabaseRelationshipRpcPayload,
  createSupabaseDataGraphRuntime,
  executeSupabaseRelationshipCommandEffect,
  supabaseRelationshipRpcSql,
} from '../../src/data-graph/index.js';

const Course = entity('Course', { id: field.id(), name: field.string() });
const Student = entity('Student', {
  id: field.id(),
  course: field.nullable(field.ref(Course)),
});
Course.hasMany('students', Student, { via: 'course' });
mapEntity(Course).toTable('courses', { id: 'course_id' });
mapEntity(Student).toTable('students', { id: 'student_id', course: 'course_id' });

const createError = ({ message, cause }: { message: string; logMessage: string; cause: unknown }) =>
  new Error(`${message}: ${String(cause)}`);

describe('Supabase direct Relationship Commands', () => {
  const student = createEntityRef(Student, { id: 'student-1' });
  const previous = createEntityRef(Course, { id: 'course-1' });
  const next = createEntityRef(Course, { id: 'course-2' });

  it('compiles a portable conditional transition payload from server-owned mappings', () => {
    expect(
      compileSupabaseRelationshipRpcPayload(
        relationship(Student, 'course', student).assign(next, { ifCurrent: previous }),
        [Student, Course],
      ),
    ).toMatchObject({
      version: 1,
      action: 'link',
      source: { table: 'students' },
      target: { table: 'courses' },
      relationColumn: 'course_id',
      nextTarget: 'course-2',
      expectedCurrent: 'course-1',
    });
  });

  it('uses one RPC and materializes the exact replacement delta', async () => {
    const command = relationship(Student, 'course', student).assign(next, {
      ifCurrent: previous,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        sourceCount: 1,
        targetCount: 1,
        oldTarget: 'course-1',
        preconditionMatched: true,
        changed: true,
      },
      error: null,
    });

    await expect(
      Effect.runPromise(
        executeSupabaseRelationshipCommandEffect(
          {
            getClient: () => Effect.succeed({ from: vi.fn(), rpc }),
            createError,
            entities: [Student, Course],
          },
          command,
        ),
      ),
    ).resolves.toEqual({
      added: [{ relation: command.relation, source: student, target: next }],
      removed: [{ relation: command.relation, source: student, target: previous }],
    });
    expect(rpc).toHaveBeenCalledWith('ontahi_apply_relationship', {
      command: compileSupabaseRelationshipRpcPayload(command, [Student, Course]),
    });
  });

  it('surfaces stale conditional assignment without reporting an empty delta', async () => {
    const command = relationship(Student, 'course', student).assign(next, {
      ifCurrent: previous,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        sourceCount: 1,
        targetCount: 1,
        oldTarget: 'course-3',
        preconditionMatched: false,
        changed: false,
      },
      error: null,
    });

    await expect(
      Effect.runPromise(
        executeSupabaseRelationshipCommandEffect(
          {
            getClient: () => Effect.succeed({ from: vi.fn(), rpc }),
            createError,
            entities: [Student, Course],
          },
          command,
        ),
      ),
    ).rejects.toThrow('current target did not match its precondition');
  });

  it('routes the focused runtime capability with a configurable RPC name', async () => {
    const command = relationship(Course, 'students', previous).remove(student);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        sourceCount: 1,
        targetCount: 1,
        oldTarget: 'course-1',
        preconditionMatched: true,
        changed: true,
      },
      error: null,
    });
    const runtime = createSupabaseDataGraphRuntime({
      getReadClient: () => Effect.succeed({ from: vi.fn(), rpc }),
      getCommandClient: () => Effect.succeed({ from: vi.fn(), rpc }),
      createError,
      entities: [Student, Course],
      relationshipRpcName: 'apply_direct_relation',
    });

    await expect(Effect.runPromise(runtime.runRelationshipCommand(command))).resolves.toEqual({
      added: [],
      removed: [{ relation: command.relation, source: student, target: previous }],
    });
    expect(rpc).toHaveBeenCalledWith('apply_direct_relation', { command: expect.any(Object) });
  });

  it('keeps inverse remove stale guards as successful no-ops', async () => {
    const command = relationship(Course, 'students', previous).remove(student);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        sourceCount: 1,
        targetCount: 1,
        oldTarget: 'course-3',
        preconditionMatched: false,
        changed: false,
      },
      error: null,
    });

    await expect(
      Effect.runPromise(
        executeSupabaseRelationshipCommandEffect(
          {
            getClient: () => Effect.succeed({ from: vi.fn(), rpc }),
            createError,
            entities: [Student, Course],
          },
          command,
        ),
      ),
    ).resolves.toEqual({ added: [], removed: [] });
  });

  it('fails explicitly when the atomic RPC capability is absent', async () => {
    const command = relationship(Student, 'course', student).assign(next);

    await expect(
      Effect.runPromise(
        executeSupabaseRelationshipCommandEffect(
          {
            getClient: () => Effect.succeed({ from: vi.fn() }),
            createError,
            entities: [Student, Course],
          },
          command,
        ),
      ),
    ).rejects.toThrow('does not expose the Ontahi Relationship RPC capability');
  });

  it.each([
    {
      name: 'invalid RPC response',
      response: { data: { changed: true }, error: null },
      message: 'Supabase Relationship Command failed',
    },
    {
      name: 'unresolved target',
      response: {
        data: {
          sourceCount: 1,
          targetCount: 0,
          oldTarget: null,
          preconditionMatched: true,
          changed: false,
        },
        error: null,
      },
      message: 'endpoint Ref did not resolve exactly once',
    },
  ])('rejects an $name', async ({ response, message }) => {
    const command = relationship(Student, 'course', student).assign(next);

    await expect(
      Effect.runPromise(
        executeSupabaseRelationshipCommandEffect(
          {
            getClient: () =>
              Effect.succeed({ from: vi.fn(), rpc: vi.fn().mockResolvedValue(response) }),
            createError,
            entities: [Student, Course],
          },
          command,
        ),
      ),
    ).rejects.toThrow(message);
  });

  it('fails closed for Relations whose constraints are not compiled by the RPC', () => {
    const GuardedCourse = entity('GuardedCourse', { id: field.id() });
    const GuardedStudent = entity('GuardedStudent', {
      id: field.id(),
      course: field.nullable(field.ref(GuardedCourse)),
    });
    GuardedCourse.hasMany('students', GuardedStudent, {
      via: 'course',
      constraints: [
        {
          kind: 'participant-selection',
          participant: 'target',
          selection: { kind: 'all' },
          rejection: { version: 1, code: 'guarded', message: 'Guarded.' },
        },
      ],
    });
    mapEntity(GuardedCourse).toTable('guarded_courses');
    mapEntity(GuardedStudent).toTable('guarded_students');

    expect(() =>
      compileSupabaseRelationshipRpcPayload(
        relationship(
          GuardedStudent,
          'course',
          createEntityRef(GuardedStudent, { id: 'student-1' }),
        ).assign(createEntityRef(GuardedCourse, { id: 'course-1' })),
        [GuardedStudent, GuardedCourse],
      ),
    ).toThrow('do not yet compile Relation constraints');
  });

  it('ships an invoker-rights transactional RPC migration', () => {
    expect(supabaseRelationshipRpcSql).toContain(
      'create or replace function public.ontahi_apply_relationship',
    );
    expect(supabaseRelationshipRpcSql).toContain('for update');
    expect(supabaseRelationshipRpcSql).not.toContain('security definer');
  });
});
