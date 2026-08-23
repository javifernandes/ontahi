import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createGraphCommandDispatcher,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  entity,
  field,
  relationship,
  type InMemoryDataset,
  type RemoteDataGraphError,
} from './index.js';

const defineSchoolGraph = () => {
  const Course = entity('Course', { id: field.id() });
  const Student = entity('Student', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  return { Course, Student };
};

const createDataset = (): InMemoryDataset => ({
  Course: [{ id: 'course-1' }],
  Student: [{ id: 'student-1', course: null }],
});

describe('Relationship Command runtime routing', () => {
  it('produces identical deltas and state through direct and remote in-process execution', async () => {
    const client = defineSchoolGraph();
    const directGraph = defineSchoolGraph();
    const server = defineSchoolGraph();
    const directDataset = createDataset();
    const serverDataset = createDataset();
    const directRuntime = createInMemoryDataGraphRuntime({
      dataset: directDataset,
      entities: [directGraph.Student, directGraph.Course],
    });
    const serverRuntime = createInMemoryDataGraphRuntime({
      dataset: serverDataset,
      entities: [server.Student, server.Course],
    });
    const dispatch = createGraphCommandDispatcher({
      policies: [{ entity: server.Student, fieldName: 'course', actions: ['link'] }],
      execute: command => Effect.runPromise(serverRuntime.runRelationshipCommand(command)),
    });
    const commandTransport = vi.fn(
      (request: unknown, options?: { credential: string; authority: { userId: string } }) =>
        dispatch(JSON.parse(JSON.stringify(request)), {
          authority: options?.authority ?? { userId: 'missing' },
        }).then(response => JSON.parse(JSON.stringify(response))),
    );
    const remoteRuntime = createRemoteDataGraphRuntime({
      transport: vi.fn(),
      commandTransport,
    });
    const clientCommand = relationship(
      client.Student,
      'course',
      createEntityRef(client.Student, { id: 'student-1' }),
    ).assign(createEntityRef(client.Course, { id: 'course-1' }));
    const directCommand = relationship(
      directGraph.Student,
      'course',
      createEntityRef(directGraph.Student, { id: 'student-1' }),
    ).assign(createEntityRef(directGraph.Course, { id: 'course-1' }));

    const direct = await Effect.runPromise(directRuntime.runRelationshipCommand(directCommand));
    const remote = await Effect.runPromise(
      remoteRuntime.runRelationshipCommand(clientCommand, {
        credential: 'server-session',
        authority: { userId: 'user-1' },
      }),
    );

    expect(remote).toEqual(direct);
    expect(serverDataset).toEqual(directDataset);
    expect(commandTransport).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, kind: 'graph-command' }),
      { credential: 'server-session', authority: { userId: 'user-1' } },
    );
    expect(commandTransport.mock.calls[0]?.[0]).not.toHaveProperty('authority');
    expect(JSON.stringify(commandTransport.mock.calls[0]?.[0])).not.toContain('server-session');
  });

  it('reports a missing command transport as an unsupported capability', async () => {
    const graph = defineSchoolGraph();
    const runtime = createRemoteDataGraphRuntime({ transport: vi.fn() });
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).clear();

    await expect(
      Effect.runPromise(runtime.runRelationshipCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { code: 'unsupported_capability' },
    });
  });

  it('preserves protocol errors and distinguishes malformed results from transport failures', async () => {
    const graph = defineSchoolGraph();
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).clear();
    const run = async (response: unknown | Promise<unknown>) => {
      const runtime = createRemoteDataGraphRuntime({
        transport: vi.fn(),
        commandTransport: () => Promise.resolve(response),
      });
      const result = await Effect.runPromise(
        runtime.runRelationshipCommand(command).pipe(Effect.either),
      );
      return result._tag === 'Left' ? (result.left as RemoteDataGraphError) : undefined;
    };

    await expect(
      run({
        kind: 'protocol-error',
        error: { code: 'access_denied', message: 'Data graph Command access denied.' },
      }),
    ).resolves.toMatchObject({ code: 'access_denied' });
    await expect(
      run({ kind: 'graph-command-result', value: { added: 'invalid', removed: [] } }),
    ).resolves.toMatchObject({ code: 'invalid_response' });

    const transportFailure = createRemoteDataGraphRuntime({
      transport: vi.fn(),
      commandTransport: () => Promise.reject(new Error('network')),
    });
    await expect(
      Effect.runPromise(transportFailure.runRelationshipCommand(command).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { code: 'transport_failure' },
    });
  });
});
