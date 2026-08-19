import {
  createEntityRef,
  entity,
  field,
  query,
  relationshipSet,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchGraphReadExecutor } from '../../src/graph/index.js';

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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ kind: 'graph-read-result', value: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor<{ credential: string }>({
      requestInit: options => ({
        headers: { authorization: `Bearer ${options?.credential}` },
      }),
    });

    await executor.run(openTodos, undefined, { credential: 'server-session' });

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      headers: expect.any(Headers),
    });
    expect(Object.fromEntries(fetchMock.mock.calls[0]![1].headers.entries())).toEqual({
      authorization: 'Bearer server-session',
      'content-type': 'application/json',
    });
    expect(fetchMock.mock.calls[0]![1].body).not.toContain('server-session');
  });

  it('supports single-result reads through the same endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          kind: 'graph-read-result',
          value: { id: 'todo-1', title: 'Read the guide' },
        }),
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
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({
          kind: 'protocol-error',
          error: { code: 'access_denied', message: 'Data graph read access denied.' },
        }),
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ kind: 'graph-command-result', value: delta }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = createFetchGraphReadExecutor({ commandEndpoint: '/graph/commands' });

    await expect(executor.runManyToManyRelationshipCommand!(command)).resolves.toEqual(delta);
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
});
