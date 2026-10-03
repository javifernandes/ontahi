import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createEntityRef,
  mutateEntity,
  query,
  relationship,
  relationshipSet,
  Selection,
  toGraphCommandRequest,
} from '@ontahi/core/data-graph';
import type { TaskRunIdentity } from '@ontahi/core/runtime/contracts';
import {
  createRuntimeProtocolExchange,
  toDurableOperationInteractionResponseRequest,
  toDurableOperationProtocolRequest,
} from '@ontahi/core/runtime/protocol';
import { createUserTaskTrigger, defineTask } from '@ontahi/core/runtime/server';
import {
  createFetchGraphClient,
  createFetchGraphReadExecutor,
  createFetchRuntimeTransport,
  createRuntimeGraphClient,
  createWebSocketRuntimeTransport,
  type RuntimeWebSocket,
} from '@ontahi/react/graph';
import { Effect, Stream } from 'effect';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { createTodoExpressServer } from './application.js';
import type { TodoAuthenticationAdapter } from './authentication.js';
import {
  TodoItem as ClientTodoItem,
  TodoItemSchema as ClientTodoItemSchema,
  TodoList as ClientTodoList,
  TodoListSchema as ClientTodoListSchema,
  TagSchema as ClientTagSchema,
} from './generated/client-entities.js';
import {
  Tag,
  TodoItem,
  TodoApplication,
  TodoList,
  todoNotifications,
  todoTaskRuntime,
} from './graph.js';
import { createTodoDataGraphRuntime } from './storage.js';
import { todoGraphCommandPolicies } from './todo-command-policies.js';

const testPrincipal = {
  subject: 'github-user-123',
  kind: 'user' as const,
  issuer: 'https://github.com',
};

const testAuthentication: TodoAuthenticationAdapter = {
  mode: 'github',
  mount: () => undefined,
  principal: (request: Request) =>
    request.header('x-test-principal') === testPrincipal.subject ? testPrincipal : null,
  webSocketPrincipal: request =>
    request.headers['x-test-principal'] === testPrincipal.subject ? testPrincipal : null,
};

const getTodoDataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') {
    throw new Error('Todo application tests require in-memory storage.');
  }

  return TodoApplication.storage.dataset;
};

const getTodoRelationships = () => {
  if (TodoApplication.storage.kind !== 'in-memory') {
    throw new Error('Todo application tests require in-memory storage.');
  }
  return TodoApplication.storage.relationships;
};

describe('Ontahi todo portability example', () => {
  let closeServer: (() => Promise<void>) | undefined;
  let origin = '';

  beforeEach(async () => {
    getTodoDataset().TodoList = [{ id: 'list-1', name: 'Inbox', color: '#f5ddd5' }];
    getTodoDataset().Tag = [];
    getTodoRelationships().length = 0;
    getTodoDataset().TodoItem = [];
    const runtimeServer = createTodoExpressServer({ authentication: testAuthentication });
    const server = await new Promise<Server>(resolve => {
      const started = runtimeServer.listen(0, '127.0.0.1', () => resolve(started));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeServer = async () => {
      await runtimeServer.runtimeProtocolWebSocket.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeServer?.();
  });

  it('discovers TodoItem ordering over HTTP and WebSocket before any data query', async () => {
    const http = createFetchRuntimeTransport({ endpoint: `${origin}/runtime` });
    const websocket = createWebSocketRuntimeTransport({
      url: `${origin.replace(/^http/, 'ws')}/runtime`,
      createWebSocket: url => new WebSocket(url, { origin }) as unknown as RuntimeWebSocket,
    });
    try {
      for (const transport of [http, websocket]) {
        const exchange = createRuntimeProtocolExchange({ transport });
        expect(
          await exchange({
            family: 'graph.read',
            body: {
              version: 1,
              kind: 'graph-read-capabilities',
              entityName: 'TodoItem',
            },
          }),
        ).toEqual({
          kind: 'graph-read-capabilities-result',
          entityName: 'TodoItem',
          capabilities: {
            orderBy: ['title'],
            relationSelections: { version: 2, relations: ['tags'] },
          },
        });
      }
    } finally {
      websocket.close();
    }
  });

  it('discovers Todo structural Commands over the ordinary Runtime Protocol transports', async () => {
    const http = createFetchRuntimeTransport({ endpoint: `${origin}/runtime` });
    const websocket = createWebSocketRuntimeTransport({
      url: `${origin.replace(/^http/, 'ws')}/runtime`,
      createWebSocket: url => new WebSocket(url, { origin }) as unknown as RuntimeWebSocket,
    });
    try {
      for (const transport of [http, websocket]) {
        const exchange = createRuntimeProtocolExchange({ transport });
        await expect(
          exchange({
            family: 'graph.command',
            body: {
              version: 1,
              kind: 'graph-command-capabilities',
              entityName: 'TodoItem',
            },
          }),
        ).resolves.toMatchObject({
          kind: 'graph-command-capabilities-result',
          capabilities: {
            relationshipCommandAffordances: [
              {
                relationKind: 'many-to-many',
                relation: { relationName: 'tags', targetEntityName: 'Tag' },
                actions: ['link', 'unlink'],
              },
            ],
          },
        });
        await expect(
          exchange({
            family: 'graph.command',
            body: {
              version: 1,
              kind: 'graph-command-capabilities',
              entityName: 'TodoList',
            },
          }),
        ).resolves.toMatchObject({
          kind: 'graph-command-capabilities-result',
          capabilities: {
            relationshipCommandAffordances: [
              {
                relationKind: 'ordered',
                relation: { relationName: 'items', targetEntityName: 'TodoItem' },
                actions: ['move'],
                placements: ['before', 'after', 'start', 'end'],
              },
            ],
          },
        });
      }
    } finally {
      websocket.close();
    }
  });

  const todoListRef = (id: string) => ({
    kind: 'entity-ref',
    entityName: 'TodoList',
    locator: { id },
  });

  const entityRef = (entityName: 'TodoItem' | 'TodoList' | 'Tag', id: string) => ({
    kind: 'entity-ref' as const,
    entityName,
    locator: { id },
  });

  const runtimeExchange = (authenticated = false) =>
    createRuntimeProtocolExchange({
      transport: createFetchRuntimeTransport({
        endpoint: `${origin}/runtime`,
        ...(authenticated
          ? { requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }) }
          : {}),
      }),
    });

  it('runs one caller-authored projected Query directly and through Express HTTP', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-2', list: 'list-1', title: 'Write bridge', completed: false },
      { id: 'todo-1', list: 'list-1', title: 'Read plan', completed: false },
      { id: 'todo-done', list: 'list-1', title: 'Done', completed: true },
      { id: 'todo-other', list: 'list-2', title: 'Other list', completed: false },
    ];
    const TodoListItem = ClientTodoItem.view('TodoListItem', { id: true, title: true });
    const visibleTodos = query(ClientTodoItemSchema)
      .where(todo => todo.list.eq(ClientTodoList.refById('list-1')))
      .where(todo => todo.completed.eq(false))
      .as(TodoListItem)
      .orderBy(todo => todo.title);
    const directRuntime = createTodoDataGraphRuntime();
    const remoteClient = createFetchGraphClient({
      runtimeTransport: { endpoint: `${origin}/runtime` },
    });

    const direct = await Effect.runPromise(directRuntime.run(visibleTodos, undefined));
    const remote = await remoteClient.graphExecutor.run(visibleTodos, undefined);

    expect(remote).toEqual(direct);
    expect(remote).toEqual([
      { id: 'todo-1', title: 'Read plan' },
      { id: 'todo-2', title: 'Write bridge' },
    ]);
  });

  it('runs generated contextual Selections over HTTP without fetching List or Item populations first', async () => {
    getTodoDataset().TodoItem = [
      { id: 'open', list: 'list-1', title: 'Open', completed: false },
      { id: 'closed', list: 'list-1', title: 'Closed', completed: true },
      { id: 'outside', list: 'list-2', title: 'Outside', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Important', color: '#dd6658' }];
    const source = createEntityRef(TodoItem, { id: 'open' });
    const target = createEntityRef(Tag, { id: 'tag-1' });
    getTodoRelationships().push({
      relation: relationshipSet(TodoItem, 'tags', source).add(target).relation,
      source,
      target,
    });
    const client = createFetchGraphClient({ runtimeTransport: { endpoint: `${origin}/runtime` } });
    const selected = Selection.all(ClientTodoListSchema).openItems;
    expect(await client.graphExecutor.run(selected.toQuery(), undefined)).toEqual([
      { ...getTodoDataset().TodoItem[0], list: createEntityRef(TodoList, { id: 'list-1' }) },
    ]);
    expect(await client.graphExecutor.run(selected.labels.toQuery(), undefined)).toEqual(
      getTodoDataset().Tag,
    );
  });

  it('allows the Selection language string operators on public TodoList fields', async () => {
    getTodoDataset().TodoList = [
      { id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' },
      { id: 'list-later', name: 'Later', color: '#dbe8f4' },
    ];
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    const matchingLists = query(ClientTodoListSchema)
      .where(list => list.name.in(['Inbox', 'Archive']))
      .where(list => list.color.in(['#f5ddd5']));

    await expect(remoteExecutor.run(matchingLists, undefined)).resolves.toEqual([
      { id: 'list-inbox', name: 'Inbox', color: '#f5ddd5' },
    ]);
  });

  it('preserves an exact-one read cardinality mismatch across Express HTTP', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];
    const exactTodo = query(ClientTodoItemSchema)
      .where(todo => todo.completed.eq(false))
      .one().read;
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });

    await expect(remoteExecutor.get(exactTodo, undefined)).rejects.toMatchObject({
      code: 'cardinality_mismatch',
      message:
        'Expected exactly one TodoItem, but the Selection resolved to zero or multiple results.',
    });
  });

  it('reads direct tags without exposing the physical join row', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Read relation', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Core', color: '#527d8c' }];
    const relation = relationshipSet(
      TodoItem,
      'tags',
      createEntityRef(TodoItem, { id: 'todo-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' })).relation;
    getTodoRelationships().push({
      relation,
      source: createEntityRef(TodoItem, { id: 'todo-1' }),
      target: createEntityRef(Tag, { id: 'tag-1' }),
    });
    const TodoWithTags = ClientTodoItem.view('TodoWithTags', {
      id: true,
      tags: { id: true, name: true, color: true },
    });
    const read = query(ClientTodoItemSchema).as(TodoWithTags);
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });

    await expect(remoteExecutor.run(read, undefined)).resolves.toEqual([
      { id: 'todo-1', tags: [{ id: 'tag-1', name: 'Core', color: '#527d8c' }] },
    ]);
  });

  it('emits the TodoList creation Reaction after a generic remote mutation', async () => {
    const notified = vi
      .spyOn(todoNotifications, 'todoListCreated')
      .mockImplementation(() => Effect.succeed(undefined));
    const remoteClient = createFetchGraphClient({
      runtimeTransport: { endpoint: `${origin}/runtime` },
    });

    await remoteClient.graphExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoListSchema).create({ name: 'Reading queue', color: '#dcebdc' }),
    );
    const created = getTodoDataset().TodoList?.find(list => list.name === 'Reading queue');
    expect(created).toMatchObject({ name: 'Reading queue', color: '#dcebdc' });
    expect(notified).toHaveBeenCalledWith({
      listId: created?.id,
      name: 'Reading queue',
    });
  });

  it('renames one TodoList through the generic remote Entity mutation capability', async () => {
    const remoteClient = createFetchGraphClient({
      runtimeTransport: { endpoint: `${origin}/runtime` },
    });
    await remoteClient.graphExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoListSchema).update(
        createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
        { name: 'Reading' },
      ),
    );

    expect(getTodoDataset().TodoList).toEqual([
      { id: 'list-1', name: 'Reading', color: '#f5ddd5' },
    ]);
  });

  it('creates a TodoItem through the generic mutation capability with its model default', async () => {
    const remoteClient = createFetchGraphClient({
      runtimeTransport: { endpoint: `${origin}/runtime` },
    });

    await remoteClient.graphExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoItemSchema).create({
        list: createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
        title: 'Use entity defaults',
      }),
    );

    expect(getTodoDataset().TodoItem).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        list: 'list-1',
        title: 'Use entity defaults',
        completed: false,
      }),
    ]);
  });

  it('rejects a generic TodoItem creation whose declared existing list is missing', async () => {
    const remoteClient = createFetchGraphClient({
      runtimeTransport: { endpoint: `${origin}/runtime` },
    });

    await expect(
      remoteClient.graphExecutor.runEntityMutationCommand!(
        mutateEntity(ClientTodoItemSchema).create({
          list: createEntityRef(ClientTodoListSchema, { id: 'missing-list' }),
          title: 'Must not be stored',
        }),
      ),
    ).rejects.toMatchObject({ code: 'entity_mutation_reference_not_found' });
    expect(getTodoDataset().TodoItem).toEqual([]);
  });

  it('atomically deletes a TodoList with its items and tag associations', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: true },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Shared', color: '#dd6658' }];
    const relation = relationshipSet(
      TodoItem,
      'tags',
      createEntityRef(TodoItem, { id: 'todo-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' })).relation;
    getTodoRelationships().push({
      relation,
      source: createEntityRef(TodoItem, { id: 'todo-1' }),
      target: createEntityRef(Tag, { id: 'tag-1' }),
    });

    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    await remoteExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoListSchema).delete(
        createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
      ),
    );
    expect(getTodoDataset().TodoList).toEqual([]);
    expect(getTodoDataset().TodoItem).toEqual([]);
    expect(getTodoDataset().Tag).toEqual([{ id: 'tag-1', name: 'Shared', color: '#dd6658' }]);
    expect(getTodoRelationships()).toEqual([]);
  });

  it('assigns a persisted pastel color through the generic remote Entity mutation capability', async () => {
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    await remoteExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoListSchema).update(
        createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
        { color: '#dbe8f4' },
      ),
    );

    expect(getTodoDataset().TodoList).toEqual([{ id: 'list-1', name: 'Inbox', color: '#dbe8f4' }]);
  });

  it('deletes one TodoItem by identity', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Remove me', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Keep me', completed: false },
    ];
    getTodoDataset().Tag = [
      { id: 'tag-1', name: 'Attached', color: '#dd6658' },
      { id: 'tag-2', name: 'Keep attached', color: '#6f8d72' },
    ];
    const relation = relationshipSet(
      TodoItem,
      'tags',
      createEntityRef(TodoItem, { id: 'todo-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' })).relation;
    getTodoRelationships().push(
      {
        relation,
        source: createEntityRef(TodoItem, { id: 'todo-1' }),
        target: createEntityRef(Tag, { id: 'tag-1' }),
      },
      {
        relation,
        source: createEntityRef(TodoItem, { id: 'todo-2' }),
        target: createEntityRef(Tag, { id: 'tag-2' }),
      },
    );

    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    await remoteExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoItemSchema).delete(
        createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
      ),
    );
    expect(getTodoDataset().TodoItem).toEqual([
      { id: 'todo-2', list: 'list-1', title: 'Keep me', completed: false },
    ]);
    expect(getTodoRelationships()).toEqual([
      {
        relation,
        source: createEntityRef(TodoItem, { id: 'todo-2' }),
        target: createEntityRef(Tag, { id: 'tag-2' }),
      },
    ]);
  });

  it('deletes a Tag and unlinks it from every TodoItem', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Tagged', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Keep tagged', completed: false },
    ];
    getTodoDataset().Tag = [
      { id: 'tag-1', name: 'Temporary', color: '#dd6658' },
      { id: 'tag-2', name: 'Persistent', color: '#6f8d72' },
    ];
    const relation = relationshipSet(
      TodoItem,
      'tags',
      createEntityRef(TodoItem, { id: 'todo-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' })).relation;
    getTodoRelationships().push(
      {
        relation,
        source: createEntityRef(TodoItem, { id: 'todo-1' }),
        target: createEntityRef(Tag, { id: 'tag-1' }),
      },
      {
        relation,
        source: createEntityRef(TodoItem, { id: 'todo-2' }),
        target: createEntityRef(Tag, { id: 'tag-2' }),
      },
    );

    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    await remoteExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTagSchema).delete(createEntityRef(ClientTagSchema, { id: 'tag-1' })),
    );
    expect(getTodoDataset().Tag).toEqual([{ id: 'tag-2', name: 'Persistent', color: '#6f8d72' }]);
    expect(getTodoRelationships()).toEqual([
      {
        relation,
        source: createEntityRef(TodoItem, { id: 'todo-2' }),
        target: createEntityRef(Tag, { id: 'tag-2' }),
      },
    ]);
  });

  it('requires one explicit Principal for a protected mutation from Node', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Authenticate the runtime', completed: false },
    ];

    const dispatch = TodoApplication.createGraphCommandDispatcher(todoGraphCommandPolicies);
    const complete = (completed: boolean) =>
      toGraphCommandRequest(
        mutateEntity(TodoItem).update(createEntityRef(TodoItem, { id: 'todo-1' }), { completed }),
      );

    await expect(
      dispatch(complete(true), { authority: { principal: null } }),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    await expect(
      dispatch(complete(true), { authority: { principal: testPrincipal } }),
    ).resolves.toMatchObject({ kind: 'graph-command-result' });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(true);

    await expect(
      dispatch(complete(false), { authority: { principal: testPrincipal } }),
    ).resolves.toMatchObject({ kind: 'graph-command-result' });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(false);
  });

  it('requires one explicit Principal to create an already-completed TodoItem', async () => {
    const dispatch = TodoApplication.createGraphCommandDispatcher(todoGraphCommandPolicies);
    const create = (completed: boolean) =>
      toGraphCommandRequest(
        mutateEntity(TodoItem).create({
          list: TodoList.refById('list-1'),
          title: completed ? 'Already done' : 'Still open',
          completed,
        }),
      );

    await expect(dispatch(create(true), { authority: { principal: null } })).resolves.toMatchObject(
      { kind: 'protocol-error', error: { code: 'access_denied' } },
    );
    await expect(
      dispatch(create(false), { authority: { principal: null } }),
    ).resolves.toMatchObject({ kind: 'graph-command-result' });
    await expect(
      dispatch(create(true), { authority: { principal: testPrincipal } }),
    ).resolves.toMatchObject({ kind: 'graph-command-result' });
    expect(getTodoDataset().TodoItem).toEqual([
      expect.objectContaining({ title: 'Still open', completed: false }),
      expect.objectContaining({ title: 'Already done', completed: true }),
    ]);
  });

  it('derives protected mutation authority on the Express Runtime Protocol receiver', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Authenticate the runtime', completed: false },
    ];

    const command = mutateEntity(ClientTodoItemSchema).update(
      createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
      { completed: true },
    );
    const anonymousClient = createFetchGraphClient({
      runtimeTransport: { endpoint: `${origin}/runtime` },
    });

    await expect(
      anonymousClient.graphExecutor.runEntityMutationCommand!(command),
    ).rejects.toMatchObject({ code: 'access_denied' });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(false);

    const authenticatedClient = createFetchGraphClient({
      runtimeTransport: {
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      },
    });
    await expect(
      authenticatedClient.graphExecutor.runEntityMutationCommand!(command),
    ).resolves.toMatchObject({ updated: [expect.objectContaining({ entityName: 'TodoItem' })] });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(true);
  });

  it('derives protected mutation authority from the WebSocket upgrade session', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Authenticate the socket', completed: false },
    ];
    const command = mutateEntity(ClientTodoItemSchema).update(
      createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
      { completed: true },
    );
    const createClient = (authenticated: boolean) => {
      const runtimeTransport = createWebSocketRuntimeTransport({
        url: `${origin.replace(/^http/, 'ws')}/runtime`,
        createWebSocket: url =>
          new WebSocket(url, {
            origin,
            ...(authenticated ? { headers: { 'x-test-principal': testPrincipal.subject } } : {}),
          }) as unknown as RuntimeWebSocket,
      });
      return { runtimeTransport, client: createRuntimeGraphClient({ runtimeTransport }) };
    };
    const anonymous = createClient(false);

    await expect(
      anonymous.client.graphExecutor.runEntityMutationCommand!(command),
    ).rejects.toMatchObject({ code: 'access_denied' });
    anonymous.runtimeTransport.close();
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(false);

    const authenticated = createClient(true);
    await expect(
      authenticated.client.graphExecutor.runEntityMutationCommand!(command),
    ).resolves.toMatchObject({ updated: [expect.objectContaining({ entityName: 'TodoItem' })] });
    authenticated.runtimeTransport.close();
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(true);
  });

  it('rejects cross-origin and wrong-scheme browser WebSockets before creating a Runtime session', async () => {
    for (const rejectedOrigin of ['https://attacker.example', origin.replace(/^http:/, 'https:')]) {
      const webSocket = new WebSocket(`${origin.replace(/^http/, 'ws')}/runtime`, {
        origin: rejectedOrigin,
      });
      const status = await new Promise<number | undefined>((resolve, reject) => {
        webSocket.once('unexpected-response', (_request, response) => {
          response.resume();
          resolve(response.statusCode);
        });
        webSocket.once('open', () => reject(new Error('Expected the WebSocket upgrade to fail.')));
        webSocket.once('error', error => {
          if (webSocket.readyState !== WebSocket.CLOSED) reject(error);
        });
      });

      expect(status).toBe(403);
    }
  });

  it('deletes every TodoItem through a Selection mutation', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: true },
    ];

    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    await remoteExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoItemSchema).deleteSelection(
        Selection.all(ClientTodoItemSchema).toJSON(),
      ),
    );
    expect(getTodoDataset().TodoItem).toEqual([]);
  });

  it('serves the embedded Explorer snapshot and active runtime metadata', async () => {
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Framework', color: '#6f8d72' }];
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Visible in Explorer', completed: false },
    ];
    getTodoRelationships().push({
      relation: {
        sourceEntityName: 'TodoItem',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
      source: entityRef('TodoItem', 'todo-1'),
      target: entityRef('Tag', 'tag-1'),
    });

    await expect(fetch(`${origin}/runtime`).then(response => response.json())).resolves.toEqual({
      storage: 'in-memory',
      taskRuntime: todoTaskRuntime,
      commandChat: false,
    });
    await expect(
      fetch(`${origin}/explorer/snapshot`).then(response => response.json()),
    ).resolves.toMatchObject({
      snapshot: {
        entities: expect.arrayContaining([
          expect.objectContaining({ name: 'TodoList' }),
          expect.objectContaining({ name: 'TodoItem' }),
          expect.objectContaining({ name: 'Tag' }),
        ]),
        operations: expect.arrayContaining([
          expect.objectContaining({ id: 'TodoList.completeAll', receiverPath: 'list' }),
          expect.objectContaining({ id: 'TodoItem.deleteFromNamedList' }),
        ]),
      },
      entityDetails: expect.arrayContaining([
        expect.objectContaining({
          name: 'TodoItem',
          mutations: {
            create: { fields: ['list', 'title', 'completed'] },
            update: { fields: ['list', 'title', 'completed'] },
            delete: true,
          },
        }),
        expect.objectContaining({
          name: 'TodoList',
          mutations: {
            create: { fields: ['name', 'color'] },
            update: { fields: ['name', 'color'] },
            delete: true,
          },
        }),
        expect.objectContaining({
          name: 'Tag',
          mutations: {
            create: { fields: ['id', 'name', 'color'] },
            update: { fields: ['name', 'color'] },
            delete: true,
          },
        }),
      ]),
    });
    await expect(
      fetch(`${origin}/explorer/entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityName: 'TodoItem' }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      entityName: 'TodoItem',
      rows: [{ id: 'todo-1', list: 'list-1', title: 'Visible in Explorer', completed: false }],
      totalCount: 1,
    });
    await expect(
      fetch(`${origin}/explorer/related-entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: entityRef('Tag', 'tag-1'),
          relationName: 'TodoItem.tags',
          sourceEntityName: 'Tag',
          targetEntityName: 'TodoItem',
          page: 1,
          pageSize: 25,
        }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      entityName: 'TodoItem',
      rows: [{ id: 'todo-1', title: 'Visible in Explorer' }],
      totalCount: 1,
    });
  });

  it('exposes execution only through the unified Runtime Protocol endpoint', async () => {
    for (const path of ['/operations', '/graph/reads', '/graph/commands', '/model/commands']) {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(response.status, path).toBe(404);
    }
  });

  it.each([
    {
      name: 'reference-defined membership',
      expression: {
        kind: 'references',
        refs: [{ kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-1' } }],
      },
      completedIds: ['todo-1'],
    },
    {
      name: 'predicate-defined membership',
      expression: {
        kind: 'predicate',
        operator: 'eq',
        fieldName: 'title',
        value: 'Second',
      },
      completedIds: ['todo-2'],
    },
  ])('targets $name with a transported Selection', async ({ expression, completedIds }) => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];

    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      }),
    });
    await remoteExecutor.runEntityMutationCommand!(
      mutateEntity(ClientTodoItemSchema).updateSelection(
        { kind: 'selection', entityName: 'TodoItem', expression } as never,
        { completed: true },
      ),
    );
    expect(
      getTodoDataset()
        .TodoItem?.filter(todo => todo.completed)
        .map(todo => todo.id),
    ).toEqual(completedIds);
  });

  it('assigns tags through one Selection-valued Relationship Command', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];

    const command = relationshipSet(
      TodoItem,
      'tags',
      Selection.references(TodoItem, [
        createEntityRef(TodoItem, { id: 'todo-1' }),
        createEntityRef(TodoItem, { id: 'todo-2' }),
      ]),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));
    await expect(
      runtimeExchange()({ family: 'graph.command', body: toGraphCommandRequest(command) }),
    ).resolves.toMatchObject({
      kind: 'graph-command-result',
      value: {
        status: 'applied',
        delta: { added: expect.any(Array), removed: [] },
      },
    });
    expect(getTodoRelationships()).toHaveLength(2);
  });

  it('persists TodoList.items order through the Fetch graph Command transport', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
      { id: 'todo-3', list: 'list-1', title: 'Third', completed: false },
    ];
    const command = relationship(
      ClientTodoListSchema,
      'items',
      createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
    ).before(
      createEntityRef(ClientTodoItemSchema, { id: 'todo-3' }),
      createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
    );
    const client = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });

    await expect(client.runOrderedRelationshipCommand!(command)).resolves.toMatchObject({
      status: 'applied',
      delta: { moved: [{ member: { locator: { id: 'todo-3' } } }] },
    });
    expect(getTodoDataset().TodoItem?.map(todo => todo.id)).toEqual(['todo-3', 'todo-1', 'todo-2']);
  });

  it('persists TodoList.items order through the WebSocket Runtime Protocol', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];
    const runtimeTransport = createWebSocketRuntimeTransport({
      url: `${origin.replace(/^http/, 'ws')}/runtime`,
      createWebSocket: url => new WebSocket(url, { origin }) as unknown as RuntimeWebSocket,
    });
    const client = createRuntimeGraphClient({ runtimeTransport });
    const command = relationship(
      ClientTodoListSchema,
      'items',
      createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
    ).prepend(createEntityRef(ClientTodoItemSchema, { id: 'todo-2' }));

    await expect(
      client.graphExecutor.runOrderedRelationshipCommand!(command),
    ).resolves.toMatchObject({ status: 'applied', delta: { moved: [expect.any(Object)] } });
    expect(getTodoDataset().TodoItem?.map(todo => todo.id)).toEqual(['todo-2', 'todo-1']);
    runtimeTransport.close();
  });

  it('creates a Tag through the generic remote Entity mutation capability', async () => {
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    const command = mutateEntity(ClientTagSchema).create({
      id: 'tag-remote',
      name: '  Remote  ',
      color: '  #4263eb  ',
    });

    await expect(remoteExecutor.runEntityMutationCommand!(command)).resolves.toEqual({
      created: [
        {
          entityName: 'Tag',
          ref: createEntityRef(ClientTagSchema, { id: 'tag-remote' }),
          values: { id: 'tag-remote', name: 'Remote', color: '#4263eb' },
        },
      ],
      updated: [],
      deleted: [],
    });
    expect(getTodoDataset().Tag).toContainEqual({
      id: 'tag-remote',
      name: 'Remote',
      color: '#4263eb',
    });
  });

  it('renames a TodoItem remotely only while its observed title is current', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Original title', completed: false },
    ];
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    const command = mutateEntity(ClientTodoItemSchema).update(
      createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
      { title: '  Renamed todo  ' },
      { if: { title: 'Original title' } },
    );

    await expect(remoteExecutor.runEntityMutationCommand!(command)).resolves.toEqual({
      created: [],
      updated: [
        {
          entityName: 'TodoItem',
          ref: createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
          values: {
            id: 'todo-1',
            list: ClientTodoList.refById('list-1'),
            title: 'Renamed todo',
            completed: false,
          },
        },
      ],
      deleted: [],
    });
    expect(getTodoDataset().TodoItem).toEqual([
      { id: 'todo-1', list: 'list-1', title: 'Renamed todo', completed: false },
    ]);

    await expect(remoteExecutor.runEntityMutationCommand!(command)).rejects.toMatchObject({
      code: 'entity_mutation_condition_not_met',
    });
    expect(getTodoDataset().TodoItem).toEqual([
      { id: 'todo-1', list: 'list-1', title: 'Renamed todo', completed: false },
    ]);
  });

  it('updates TodoItem boolean and Reference Fields through the generic remote Entity mutation capability', async () => {
    getTodoDataset().TodoList = [
      { id: 'list-1', name: 'Inbox', color: '#f5ddd5' },
      { id: 'list-2', name: 'Later', color: '#dce8f5' },
    ];
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Ship it', completed: false },
    ];
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      }),
    });
    const command = mutateEntity(ClientTodoItemSchema).update(
      createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
      { list: ClientTodoList.refById('list-2'), completed: true },
    );

    await expect(remoteExecutor.runEntityMutationCommand!(command)).resolves.toEqual({
      created: [],
      updated: [
        {
          entityName: 'TodoItem',
          ref: createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
          values: {
            id: 'todo-1',
            list: ClientTodoList.refById('list-2'),
            title: 'Ship it',
            completed: true,
          },
        },
      ],
      deleted: [],
    });
    expect(getTodoDataset().TodoItem).toEqual([
      { id: 'todo-1', list: 'list-2', title: 'Ship it', completed: true },
    ]);
  });

  it('denies a remotely mutable Tag Field that is absent from policy', async () => {
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];
    const remoteExecutor = createFetchGraphReadExecutor({
      runtimeTransport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    const command = mutateEntity(ClientTagSchema).update(
      createEntityRef(ClientTagSchema, { id: 'tag-1' }),
      { id: 'tag-replaced' },
    );

    await expect(remoteExecutor.runEntityMutationCommand!(command)).rejects.toMatchObject({
      code: 'access_denied',
    });
    expect(getTodoDataset().Tag).toEqual([{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }]);
  });

  it('rejects unknown explicit tag Refs without creating partial associations', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];

    const command = relationshipSet(
      TodoItem,
      'tags',
      createEntityRef(TodoItem, { id: 'todo-1' }),
    ).add(
      Selection.references(Tag, [
        createEntityRef(Tag, { id: 'tag-1' }),
        createEntityRef(Tag, { id: 'missing-tag' }),
      ]),
    );
    await expect(
      runtimeExchange()({ family: 'graph.command', body: toGraphCommandRequest(command) }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'execution_unavailable' },
    });
    expect(getTodoRelationships()).toEqual([]);
  });

  it('rejects tagging a mixed batch containing a completed todo without partial associations', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Open', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Completed', completed: true },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];
    const command = relationshipSet(
      TodoItem,
      'tags',
      Selection.references(TodoItem, [
        createEntityRef(TodoItem, { id: 'todo-1' }),
        createEntityRef(TodoItem, { id: 'todo-2' }),
      ]),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));

    await expect(
      runtimeExchange()({ family: 'graph.command', body: toGraphCommandRequest(command) }),
    ).resolves.toMatchObject({
      kind: 'graph-command-rejection',
      diagnostic: {
        reason: 'relation_constraint_rejected',
        rejection: {
          version: 1,
          code: 'completed_todo_cannot_be_tagged',
          message: 'Completed todos cannot be tagged.',
        },
      },
    });
    expect(getTodoRelationships()).toEqual([]);
  });

  it('observes authorized Graph Query snapshots through WebSocket and releases the subscription', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];

    const runtimeTransport = createWebSocketRuntimeTransport({
      url: `${origin.replace(/^http/, 'ws')}/runtime`,
      createWebSocket: url =>
        new WebSocket(url, {
          origin,
          headers: { 'x-test-principal': testPrincipal.subject },
        }) as unknown as RuntimeWebSocket,
    });
    const client = createRuntimeGraphClient({ runtimeTransport });
    const TodoObservationRow = ClientTodoItem.view('TodoObservationRow', {
      id: true,
      completed: true,
    });
    const incompleteTodos = query(ClientTodoItemSchema)
      .where(todo => todo.completed.eq(false))
      .as(TodoObservationRow);
    let mutated = false;
    const observation = client.graph
      .bindGraphRead(incompleteTodos)
      .observe()
      .pipe(
        Stream.tap(() => {
          if (mutated) return Effect.void;
          mutated = true;
          return Effect.promise(async () => {
            const result = await client.graphExecutor.runEntityMutationCommand!(
              mutateEntity(ClientTodoItemSchema).update(
                createEntityRef(ClientTodoItemSchema, { id: 'todo-1' }),
                { completed: true },
              ),
            );
            expect(result).toMatchObject({
              updated: [expect.objectContaining({ entityName: 'TodoItem' })],
            });
          });
        }),
        Stream.take(2),
        Stream.runCollect,
        Effect.map(values => Array.from(values)),
      );

    await expect(Effect.runPromise(observation)).resolves.toEqual([
      [
        { id: 'todo-1', completed: false },
        { id: 'todo-2', completed: false },
      ],
      [{ id: 'todo-2', completed: false }],
    ]);
    runtimeTransport.close();
  });

  it('starts and observes TodoList.completeAll progress through one WebSocket without browser polling', async () => {
    getTodoDataset().TodoList = [
      { id: 'list-1', name: 'Inbox', color: '#f5ddd5' },
      { id: 'list-2', name: 'Later', color: '#dbe8f4' },
    ];
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
      { id: 'todo-3', list: 'list-2', title: 'Other list', completed: false },
    ];
    const snapshotInspection = vi.spyOn(TodoApplication, 'getTaskSnapshot');

    let socketCount = 0;
    const runtimeTransport = createWebSocketRuntimeTransport({
      url: `${origin.replace(/^http/, 'ws')}/runtime`,
      createWebSocket: url => {
        socketCount += 1;
        return new WebSocket(url, { origin }) as unknown as RuntimeWebSocket;
      },
    });
    const client = createRuntimeGraphClient({ runtimeTransport });
    const TodoSocketRow = ClientTodoItem.view('TodoSocketRow', {
      id: true,
      title: true,
      completed: true,
    });
    await expect(
      client.graphExecutor.run(query(ClientTodoItemSchema).as(TodoSocketRow), undefined),
    ).resolves.toHaveLength(3);
    await expect(
      client.graphExecutor.runEntityMutationCommand!(
        mutateEntity(ClientTodoListSchema).update(
          createEntityRef(ClientTodoListSchema, { id: 'list-1' }),
          { name: 'WebSocket inbox' },
        ),
      ),
    ).resolves.toMatchObject({
      updated: [
        {
          entityName: 'TodoList',
          values: { id: 'list-1', name: 'WebSocket inbox' },
        },
      ],
    });
    const start = await client.reflectedOperationInvoker!.invokeOperation({
      operationId: 'TodoList.completeAll',
      input: { list: createEntityRef(ClientTodoListSchema, { id: 'list-1' }) },
    });
    expect(start).toMatchObject({
      ok: true,
      kind: 'success',
      value: { taskId: 'TodoList.completeAll' },
    });
    if (!start.ok) throw new Error('Expected the durable Operation to start.');

    const snapshots = [];
    for await (const snapshot of client.runtimeTransport!.durableOperation!.observe(
      start.value as TaskRunIdentity,
    )) {
      snapshots.push(snapshot);
    }
    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'running',
          progress: { phase: 'updating' },
        }),
      ]),
    );
    expect(snapshots.at(-1)).toMatchObject({
      status: 'completed',
      progress: { phase: 'updating' },
      result: { completed: 2 },
    });
    expect(getTodoDataset().TodoItem?.find(todo => todo.id === 'todo-3')?.completed).toBe(false);
    expect(socketCount).toBe(1);
    expect(snapshotInspection).not.toHaveBeenCalled();
    snapshotInspection.mockRestore();
    runtimeTransport.close();
  });

  it('responds to choice and approval interactions through Runtime Protocol', async () => {
    const task = defineTask({
      id: 'TodoList.chooseForProtocolTest',
      run: (_input: {}, context) =>
        Effect.gen(function* () {
          const selected = yield* context.interact.choice({
            id: 'choose-list',
            prompt: 'Which list?',
            options: [{ id: 'list-1', label: 'Inbox', value: { listId: 'list-1' } }],
          });
          const approval = yield* context.interact.approval({
            id: 'approve-list',
            prompt: 'Apply the proposed list change?',
            proposal: {
              id: 'update-list-1',
              summary: 'Update Inbox.',
              requests: [{ version: 1, kind: 'graph-command', command: { action: 'update' } }],
            },
          });
          return { ...selected, approved: approval.decision === 'approve' };
        }),
    });
    const run = await Effect.runPromise(
      TodoApplication.app.task.start(
        task,
        {},
        {
          runId: 'protocol-interaction-run',
          trigger: createUserTaskTrigger({ userId: testPrincipal.subject }),
        },
      ),
    );
    const anonymousExchange = createRuntimeProtocolExchange({
      transport: createFetchRuntimeTransport({ endpoint: `${origin}/runtime` }),
    });
    const authenticatedExchange = createRuntimeProtocolExchange({
      transport: createFetchRuntimeTransport({
        endpoint: `${origin}/runtime`,
        requestInit: () => ({
          headers: { 'x-test-principal': testPrincipal.subject },
        }),
      }),
    });

    await vi.waitFor(async () => {
      await expect(
        anonymousExchange({
          family: 'durable.operation',
          body: toDurableOperationProtocolRequest(run),
        }),
      ).resolves.toMatchObject({
        kind: 'snapshot',
        snapshot: {
          status: 'running',
          interaction: { id: 'choose-list', kind: 'choice' },
        },
      });
    });

    await expect(
      anonymousExchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(run, {
          interactionId: 'choose-list',
          optionId: 'list-1',
        }),
      }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
      status: 'running',
      interaction: { id: 'choose-list' },
    });

    await expect(
      authenticatedExchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(run, {
          interactionId: 'choose-list',
          optionId: 'list-1',
        }),
      }),
    ).resolves.toMatchObject({
      kind: 'snapshot',
      snapshot: { status: 'running' },
    });

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-list',
          kind: 'approval',
          proposal: { id: 'update-list-1' },
        },
      });
    });

    await expect(
      authenticatedExchange({
        family: 'durable.operation',
        body: toDurableOperationInteractionResponseRequest(run, {
          interactionId: 'approve-list',
          decision: 'approve',
        }),
      }),
    ).resolves.toMatchObject({
      kind: 'snapshot',
      snapshot: { status: 'running' },
    });

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        status: 'completed',
        result: { listId: 'list-1', approved: true },
      });
    });
  });

  it('resolves and approves exact item deletions in a durable Todo Operation', async () => {
    getTodoDataset().TodoList = [
      { id: 'shopping-home', name: 'Shopping', color: '#f5ddd5' },
      { id: 'shopping-work', name: 'Shopping', color: '#dbe8f4' },
    ];
    getTodoDataset().TodoItem = [
      {
        id: 'keep-home-item',
        list: 'shopping-home',
        title: 'Keep this item',
        completed: false,
      },
      {
        id: 'delete-work-item-1',
        list: 'shopping-work',
        title: 'Delete this item',
        completed: false,
      },
      {
        id: 'delete-work-item-2',
        list: 'shopping-work',
        title: 'Delete this too',
        completed: true,
      },
    ];
    getTodoDataset().Tag = [{ id: 'tag-work', name: 'Work', color: '#527d8c' }];
    const relation = relationshipSet(
      TodoItem,
      'tags',
      createEntityRef(TodoItem, { id: 'delete-work-item-1' }),
    ).add(createEntityRef(Tag, { id: 'tag-work' })).relation;
    getTodoRelationships().push({
      relation,
      source: createEntityRef(TodoItem, { id: 'delete-work-item-1' }),
      target: createEntityRef(Tag, { id: 'tag-work' }),
    });
    const client = createFetchGraphClient({
      runtimeTransport: {
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      },
    });
    const start = await client.reflectedOperationInvoker!.invokeOperation({
      operationId: 'TodoItem.deleteFromNamedList',
      input: { listName: 'Shopping' },
    });
    expect(start).toMatchObject({ ok: true, kind: 'success' });
    if (!start.ok) throw new Error('Expected the interactive delete Operation to start.');
    const run = start.value as TaskRunIdentity;
    const exchange = createRuntimeProtocolExchange({
      transport: createFetchRuntimeTransport({
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      }),
    });

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'choose-list',
          kind: 'choice',
          options: [
            { id: 'shopping-home', label: 'Shopping (shopping-home)' },
            { id: 'shopping-work', label: 'Shopping (shopping-work)' },
          ],
        },
      });
    });
    await exchange({
      family: 'durable.operation',
      body: toDurableOperationInteractionResponseRequest(run, {
        interactionId: 'choose-list',
        optionId: 'shopping-work',
      }),
    });

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        status: 'running',
        interaction: {
          id: 'approve-delete-items',
          kind: 'approval',
          proposal: {
            summary: 'Delete 2 items from “Shopping”.',
            requests: [
              {
                version: 3,
                kind: 'graph-command',
                command: { action: 'delete', entityName: 'TodoItem' },
              },
              {
                version: 3,
                kind: 'graph-command',
                command: { action: 'delete', entityName: 'TodoItem' },
              },
            ],
          },
        },
      });
    });
    await exchange({
      family: 'durable.operation',
      body: toDurableOperationInteractionResponseRequest(run, {
        interactionId: 'approve-delete-items',
        decision: 'approve',
      }),
    });

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        status: 'completed',
        result: { deleted: 2, rejected: false },
      });
    });
    expect(getTodoDataset().TodoItem).toEqual([
      {
        id: 'keep-home-item',
        list: 'shopping-home',
        title: 'Keep this item',
        completed: false,
      },
    ]);
    expect(getTodoRelationships()).toEqual([]);
  });

  it('does not execute an approved Todo proposal after its items change', async () => {
    getTodoDataset().TodoList = [{ id: 'shopping-home', name: 'Shopping', color: '#f5ddd5' }];
    getTodoDataset().TodoItem = [
      {
        id: 'shopping-item',
        list: 'shopping-home',
        title: 'Original title',
        completed: false,
      },
    ];
    const client = createFetchGraphClient({
      runtimeTransport: {
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      },
    });
    const start = await client.reflectedOperationInvoker!.invokeOperation({
      operationId: 'TodoItem.deleteFromNamedList',
      input: { listName: 'Shopping' },
    });
    expect(start).toMatchObject({ ok: true, kind: 'success' });
    if (!start.ok) throw new Error('Expected the interactive delete Operation to start.');
    const run = start.value as TaskRunIdentity;

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        interaction: { id: 'approve-delete-items', kind: 'approval' },
      });
    });
    getTodoDataset().TodoItem![0]!.title = 'Changed after proposal';
    const exchange = createRuntimeProtocolExchange({
      transport: createFetchRuntimeTransport({
        endpoint: `${origin}/runtime`,
        requestInit: () => ({ headers: { 'x-test-principal': testPrincipal.subject } }),
      }),
    });
    await exchange({
      family: 'durable.operation',
      body: toDurableOperationInteractionResponseRequest(run, {
        interactionId: 'approve-delete-items',
        decision: 'approve',
      }),
    });

    await vi.waitFor(async () => {
      await expect(TodoApplication.getTaskSnapshot(run)).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'todo_delete_proposal_stale' },
      });
    });
    expect(getTodoDataset().TodoItem).toEqual([
      {
        id: 'shopping-item',
        list: 'shopping-home',
        title: 'Changed after proposal',
        completed: false,
      },
    ]);
  });
});
