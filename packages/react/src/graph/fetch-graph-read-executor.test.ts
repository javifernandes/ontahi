import {
  createEntityRef,
  entity,
  field,
  mutateEntity,
  query,
  relationshipSet,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import {
  createRuntimeProtocolResponse,
  runtimeProtocolError,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchGraphReadExecutor } from './index.js';

const Todo = entity('Todo', {
  id: field.id(),
  title: field.string(),
  completed: field.boolean(),
});
const TodoListItem = Todo.view('TodoListItem', { id: true, title: true });
const openTodos = query(Todo)
  .where(todo => todo.completed.eq(false))
  .as(TodoListItem)
  .orderBy(todo => todo.title);

describe('Fetch graph read executor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('executes Graph Reads through the versioned graph.read family', async () => {
    const request = vi.fn<RuntimeTransport['request']>(async envelope =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Read the protocol' }],
      }),
    );
    const executor = createFetchGraphReadExecutor({
      runtimeTransport: { request },
      requestId: () => 'graph-read-1',
    });

    await expect(executor.run(openTodos, undefined)).resolves.toEqual([
      { id: 'todo-1', title: 'Read the protocol' },
    ]);
    expect(request).toHaveBeenCalledWith(
      {
        protocol: 'ontahi.runtime',
        version: 1,
        id: 'graph-read-1',
        kind: 'request',
        family: 'graph.read',
        body: expect.objectContaining({
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: { kind: 'selection', entityName: 'Todo', expression: expect.any(Object) },
          view: expect.objectContaining({ name: 'TodoListItem' }),
        }),
      },
      undefined,
    );
  });

  it('executes Entity Commands through graph.command and does not replay common errors', async () => {
    const command = mutateEntity(Todo).update(createEntityRef(Todo, { id: 'todo-1' }), {
      title: 'Remote',
    });
    const delta = {
      created: [],
      updated: [
        {
          entityName: 'Todo',
          ref: createEntityRef(Todo, { id: 'todo-1' }),
          values: { id: 'todo-1', title: 'Remote', completed: false },
        },
      ],
      deleted: [],
    };
    const request = vi
      .fn<RuntimeTransport['request']>()
      .mockImplementationOnce(async envelope =>
        createRuntimeProtocolResponse(envelope, { kind: 'graph-command-result', value: delta }),
      )
      .mockImplementationOnce(async envelope =>
        runtimeProtocolError('dispatch_unavailable', 'Command runtime unavailable.', {
          id: envelope.id,
          family: envelope.family,
        }),
      );
    const requestIds = ['graph-command-1', 'graph-command-2'][Symbol.iterator]();
    const executor = createFetchGraphReadExecutor({
      runtimeTransport: { request },
      requestId: () => requestIds.next().value ?? 'unexpected',
    });

    await expect(executor.runEntityMutationCommand!(command)).resolves.toEqual(delta);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      id: 'graph-command-1',
      family: 'graph.command',
      body: {
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'Todo',
          target: { entityName: 'Todo', locator: { id: 'todo-1' } },
          values: { title: 'Remote' },
        },
      },
    });

    await expect(executor.runEntityMutationCommand!(command)).rejects.toMatchObject({
      name: 'RemoteDataGraphError',
      code: 'transport_failure',
      cause: expect.objectContaining({ message: 'Command runtime unavailable.' }),
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('executes a projected Query through the graph read endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        kind: 'graph-read-result',
        value: [{ id: 'todo-1', title: 'Read the guide' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor({ endpoint: '/graph/reads' });

    await expect(executor.run(openTodos, undefined)).resolves.toEqual([
      { id: 'todo-1', title: 'Read the guide' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/graph/reads', {
      method: 'POST',
      headers: expect.any(Headers),
      credentials: 'same-origin',
      body: expect.any(String),
    });
    expect(Object.fromEntries(fetchMock.mock.calls[0]![1].headers.entries())).toEqual({
      'content-type': 'application/json',
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection: { entityName: 'Todo' },
      view: { name: 'TodoListItem' },
    });
  });

  it('derives fetch initialization from runtime options without adding it to the graph body', async () => {
    const fetchMock = vi.fn(async (_endpoint: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
      return {
        ok: true,
        status: 200,
        json: async () =>
          createRuntimeProtocolResponse(request, { kind: 'graph-read-result', value: [] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor<{ credential: string }>({
      requestInit: options => ({
        headers: { authorization: `Bearer ${options?.credential}` },
      }),
    });

    await executor.run(openTodos, undefined, { credential: 'server-session' });

    const sentInit = fetchMock.mock.calls[0]?.[1];
    expect(sentInit).toMatchObject({
      headers: expect.any(Headers),
    });
    expect(Object.fromEntries(new Headers(sentInit?.headers).entries())).toEqual({
      authorization: 'Bearer server-session',
      'content-type': 'application/json',
    });
    expect(String(sentInit?.body)).not.toContain('server-session');
    expect(JSON.parse(String(sentInit?.body))).toMatchObject({
      family: 'graph.read',
      body: { kind: 'graph-read' },
    });
  });

  it('supports single-result reads through the same endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return {
          ok: true,
          status: 200,
          json: async () =>
            createRuntimeProtocolResponse(request, {
              kind: 'graph-read-result',
              value: { id: 'todo-1', title: 'Read the guide' },
            }),
        };
      }),
    );
    const executor = createFetchGraphReadExecutor();

    await expect(executor.get(openTodos, undefined)).resolves.toEqual({
      id: 'todo-1',
      title: 'Read the guide',
    });
  });

  it('preserves structured graph protocol errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return {
          ok: true,
          status: 200,
          json: async () =>
            createRuntimeProtocolResponse(request, {
              kind: 'protocol-error',
              error: { code: 'access_denied', message: 'Data graph read access denied.' },
            }),
        };
      }),
    );
    const executor = createFetchGraphReadExecutor();

    await expect(executor.run(openTodos, undefined)).rejects.toMatchObject({
      name: 'RemoteDataGraphError',
      code: 'access_denied',
      message: 'Data graph read access denied.',
    });
  });

  it('reports non-protocol HTTP failures as transport failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: vi.fn().mockRejectedValue(new SyntaxError('not JSON')),
      }),
    );
    const executor = createFetchGraphReadExecutor();

    await expect(executor.count(openTodos, undefined)).rejects.toMatchObject({
      name: 'RemoteDataGraphError',
      code: 'transport_failure',
    });
  });

  it('rejects graph read results returned with a failed HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({
          kind: 'graph-read-result',
          value: [{ id: 'todo-1', title: 'Must not reach the query cache' }],
        }),
      }),
    );
    const executor = createFetchGraphReadExecutor();

    await expect(executor.run(openTodos, undefined)).rejects.toMatchObject({
      name: 'RemoteDataGraphError',
      code: 'transport_failure',
    });
  });

  it('keeps remote Commands explicitly unsupported without calling Fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor();
    const command: GraphCommandSpec<typeof Todo> = {
      kind: 'command',
      operation: 'delete',
      root: Todo,
      selection: { kind: 'all' },
    };

    await expect(executor.runCommand(command)).rejects.toMatchObject({
      name: 'RemoteDataGraphError',
      code: 'unsupported_capability',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('executes many-to-many Relationship Commands through the graph Command endpoint', async () => {
    const Tag = entity('Tag', { id: field.id() });
    const TaggedTodo = entity('TaggedTodo', { id: field.id() }).manyToMany('tags', Tag);
    const command = relationshipSet(
      TaggedTodo,
      'tags',
      createEntityRef(TaggedTodo, { id: 'todo-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));
    const delta = {
      added: [
        {
          relation: command.relation,
          source: createEntityRef(TaggedTodo, { id: 'todo-1' }),
          target: createEntityRef(Tag, { id: 'tag-1' }),
        },
      ],
      removed: [],
    };
    const result = { status: 'applied' as const, delta };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ kind: 'graph-command-result', value: result }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor({ commandEndpoint: '/graph/commands' });

    await expect(executor.runManyToManyRelationshipCommand!(command)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith('/graph/commands', {
      method: 'POST',
      headers: expect.any(Headers),
      credentials: 'same-origin',
      body: expect.any(String),
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      version: 1,
      kind: 'graph-command',
      command: { kind: 'many-to-many-relationship-command', action: 'link' },
    });
  });

  it('executes an exact Entity Mutation Command through the graph Command endpoint', async () => {
    const command = mutateEntity(Todo).update(createEntityRef(Todo, { id: 'todo-1' }), {
      title: 'Remote',
    });
    const delta = {
      created: [],
      updated: [
        {
          entityName: 'Todo',
          ref: createEntityRef(Todo, { id: 'todo-1' }),
          values: { id: 'todo-1', title: 'Remote', completed: false },
        },
      ],
      deleted: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ kind: 'graph-command-result', value: delta }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor({ commandEndpoint: '/graph/commands' });

    await expect(executor.runEntityMutationCommand!(command)).resolves.toEqual(delta);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      version: 1,
      kind: 'graph-command',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Todo',
        target: { entityName: 'Todo', locator: { id: 'todo-1' } },
        values: { title: 'Remote' },
      },
    });
  });

  it('preserves a structured Relationship rejection returned with a conflict status', async () => {
    const Tag = entity('RejectedTag', { id: field.id() });
    const TaggedTodo = entity('RejectedTodo', { id: field.id() }).manyToMany('tags', Tag);
    const command = relationshipSet(
      TaggedTodo,
      'tags',
      createEntityRef(TaggedTodo, { id: 'todo-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_endpoint: string, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as RuntimeProtocolRequestEnvelope;
        return {
          ok: true,
          status: 200,
          json: async () =>
            createRuntimeProtocolResponse(request, {
              kind: 'graph-command-rejection',
              diagnostic: {
                reason: 'relation_constraint_rejected',
                rejection: {
                  version: 1,
                  code: 'tag_unavailable',
                  message: 'This tag is unavailable.',
                },
              },
            }),
        };
      }),
    );
    const executor = createFetchGraphReadExecutor();

    await expect(executor.runManyToManyRelationshipCommand!(command)).rejects.toMatchObject({
      name: 'RemoteDataGraphError',
      code: 'relation_constraint_rejected',
      diagnostic: {
        rejection: { version: 1, code: 'tag_unavailable' },
      },
    });
  });
});
