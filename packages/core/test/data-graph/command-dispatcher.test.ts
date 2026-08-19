import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createGraphCommandDispatcher,
  entity,
  field,
  relationship,
  toGraphCommandRequest,
  type RelationshipCommandPolicy,
  type RelationshipDelta,
} from '../../src/data-graph/index.js';

const defineSchoolGraph = () => {
  const Course = entity('Course', { id: field.id() });
  const Student = entity('Student', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  return { Course, Student };
};

const commandFor = (graph: ReturnType<typeof defineSchoolGraph>) =>
  relationship(graph.Student, 'course', createEntityRef(graph.Student, { id: 'student-1' })).assign(
    createEntityRef(graph.Course, { id: 'course-1' }),
  );

const policyFor = (
  graph: ReturnType<typeof defineSchoolGraph>,
  actions: RelationshipCommandPolicy['actions'] = ['link', 'unlink'],
): RelationshipCommandPolicy => ({ entity: graph.Student, fieldName: 'course', actions });

describe('graph Relationship Command dispatcher', () => {
  it('rejects invalid and duplicate policies during boundary creation', () => {
    const graph = defineSchoolGraph();
    expect(() =>
      createGraphCommandDispatcher({
        policies: [{ entity: graph.Student, fieldName: 'id', actions: ['link'] }],
        execute: vi.fn(),
      }),
    ).toThrow('Graph Command policy Student.id must target a Reference Field.');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [policyFor(graph, []), policyFor(graph)],
        execute: vi.fn(),
      }),
    ).toThrow('Graph Command policy Student.course requires valid actions.');
    expect(() =>
      createGraphCommandDispatcher({
        policies: [policyFor(graph), policyFor(graph)],
        execute: vi.fn(),
      }),
    ).toThrow('Duplicate Graph Command policy for Relation Student.course.');
  });

  it('denies missing policies and disallowed actions without executing', async () => {
    const client = defineSchoolGraph();
    const server = defineSchoolGraph();
    const execute = vi.fn();
    const noPolicy = createGraphCommandDispatcher({ policies: [], execute });
    const unlinkOnly = createGraphCommandDispatcher({
      policies: [policyFor(server, ['unlink'])],
      execute,
    });
    const request = toGraphCommandRequest(commandFor(client));

    await expect(noPolicy(request, { authority: { userId: 'user-1' } })).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    await expect(unlinkOnly(request, { authority: { userId: 'user-1' } })).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('resolves against server topology and returns the applied delta', async () => {
    const client = defineSchoolGraph();
    const server = defineSchoolGraph();
    const delta: RelationshipDelta = {
      added: [
        {
          relation: commandFor(server).relation,
          source: createEntityRef(server.Student, { id: 'student-1' }),
          target: createEntityRef(server.Course, { id: 'course-1' }),
        },
      ],
      removed: [],
    };
    const execute = vi.fn(async () => delta);
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(server, ['link'])],
      execute,
    });
    const context = { authority: { userId: 'user-1' } };

    await expect(dispatch(toGraphCommandRequest(commandFor(client)), context)).resolves.toEqual({
      kind: 'graph-command-result',
      value: delta,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(commandFor(server), context);
  });

  it('maps executor failures to an unavailable error without leaking the cause', async () => {
    const graph = defineSchoolGraph();
    const cause = new Error('database credentials');
    const reportError = vi.fn();
    const dispatch = createGraphCommandDispatcher({
      policies: [policyFor(graph)],
      execute: vi.fn(async () => Promise.reject(cause)),
      reportError,
    });

    await expect(
      dispatch(toGraphCommandRequest(commandFor(graph)), { authority: undefined }),
    ).resolves.toEqual({
      kind: 'protocol-error',
      error: {
        code: 'execution_unavailable',
        message: 'Data graph Command execution is temporarily unavailable.',
      },
    });
    expect(reportError).toHaveBeenCalledWith(cause);
  });
});
