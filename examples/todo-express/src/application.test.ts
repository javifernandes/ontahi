import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createEntityRef,
  mutateEntity,
  query,
  relationshipSet,
  Selection,
  toGraphCommandRequest,
} from '@ontahi/core/data-graph';
import { createFetchGraphReadExecutor } from '@ontahi/react/graph';
import { Effect } from 'effect';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTodoExpressApp } from './application.js';
import type { TodoAuthenticationAdapter } from './authentication.js';
import {
  TodoItem as ClientTodoItem,
  TodoItemSchema as ClientTodoItemSchema,
  TodoList as ClientTodoList,
  TagSchema as ClientTagSchema,
} from './generated/client-entities.js';
import { Tag, TodoItem, TodoApplication, TodoList, todoNotifications } from './graph.js';
import { createTodoDataGraphRuntime } from './storage.js';

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
  let endpoint = '';
  let origin = '';

  beforeEach(async () => {
    getTodoDataset().TodoList = [{ id: 'list-1', name: 'Inbox' }];
    getTodoDataset().Tag = [];
    getTodoRelationships().length = 0;
    getTodoDataset().TodoItem = [];
    const server = await new Promise<Server>(resolve => {
      const started = createTodoExpressApp({ authentication: testAuthentication }).listen(
        0,
        '127.0.0.1',
        () => resolve(started),
      );
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    endpoint = `${origin}/operations`;
    closeServer = async () => {
      server.closeAllConnections();
      server.close();
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeServer?.();
  });

  const invoke = (operationId: string, input: unknown, authenticated = false) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authenticated ? { 'x-test-principal': testPrincipal.subject } : {}),
      },
      body: JSON.stringify({ kind: 'invoke', operationId, input }),
    });

  const selectTodoList = (id: string) => ({
    kind: 'selection',
    entityName: 'TodoList',
    expression: {
      kind: 'references',
      refs: [{ kind: 'entity-ref', entityName: 'TodoList', locator: { id } }],
    },
  });

  const todoListRef = (id: string) => ({
    kind: 'entity-ref',
    entityName: 'TodoList',
    locator: { id },
  });

  it('uses the bound TodoList command directly from Node', async () => {
    const list = TodoList.refById('list-1');
    await expect(TodoList.rename({ list, name: 'Research backlog' })).resolves.toMatchObject({
      ok: true,
      value: { id: 'list-1', name: 'Research backlog' },
    });
    expect(getTodoDataset().TodoList).toEqual([{ id: 'list-1', name: 'Research backlog' }]);
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
    const remoteExecutor = createFetchGraphReadExecutor({ endpoint: `${origin}/graph/reads` });

    const direct = await Effect.runPromise(directRuntime.run(visibleTodos, undefined));
    const remote = await remoteExecutor.run(visibleTodos, undefined);

    expect(remote).toEqual(direct);
    expect(remote).toEqual([
      { id: 'todo-1', title: 'Read plan' },
      { id: 'todo-2', title: 'Write bridge' },
    ]);
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
    const remoteExecutor = createFetchGraphReadExecutor({ endpoint: `${origin}/graph/reads` });

    await expect(remoteExecutor.run(read, undefined)).resolves.toEqual([
      { id: 'todo-1', tags: [{ id: 'tag-1', name: 'Core', color: '#527d8c' }] },
    ]);
  });

  it('runs a TodoList operation with the capability supplied by its application', async () => {
    const notified = vi
      .spyOn(todoNotifications, 'todoListCreated')
      .mockImplementation(() => Effect.succeed(undefined));

    await expect(TodoList.create({ id: 'list-2', name: 'Reading queue' })).resolves.toMatchObject({
      ok: true,
      value: { id: 'list-2', name: 'Reading queue' },
    });
    expect(notified).toHaveBeenCalledWith({
      listId: 'list-2',
      name: 'Reading queue',
    });
  });

  it('invokes a successful operation over Express end to end', async () => {
    const response = await invoke('TodoItem.create', {
      id: 'todo-1',
      list: todoListRef('list-1'),
      title: 'Read Ontahi guide',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: {
          id: 'todo-1',
          list: todoListRef('list-1'),
          title: 'Read Ontahi guide',
          completed: false,
        },
      },
    });
    expect(getTodoDataset().TodoItem).toEqual([
      { id: 'todo-1', list: 'list-1', title: 'Read Ontahi guide', completed: false },
    ]);
  });

  it('renames one TodoList by identity', async () => {
    const response = await invoke('TodoList.rename', {
      list: selectTodoList('list-1'),
      name: 'Reading',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: { id: 'list-1', name: 'Reading' },
      },
    });
    expect(getTodoDataset().TodoList).toEqual([{ id: 'list-1', name: 'Reading' }]);
  });

  it('deletes an empty TodoList by identity', async () => {
    const response = await invoke('TodoList.delete', { list: selectTodoList('list-1') });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
    expect(getTodoDataset().TodoList).toEqual([]);
  });

  it('returns the canonical validation result for invalid input', async () => {
    const response = await invoke('TodoItem.create', {
      id: 'todo-1',
      list: todoListRef('list-1'),
      title: '',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'input_invalid',
        executed: false,
        issues: [{ path: 'title' }],
      },
    });
    expect(getTodoDataset().TodoItem).toEqual([]);
  });

  it('rejects a statically excluded TodoList name before execution', async () => {
    const response = await invoke('TodoList.rename', {
      list: selectTodoList('list-1'),
      name: '  ARCHIVE  ',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'input_invalid',
        executed: false,
        issues: [{ path: 'name', message: 'Archive is reserved for system use.' }],
      },
    });
    expect(getTodoDataset().TodoList).toEqual([{ id: 'list-1', name: 'Inbox' }]);
  });

  it('rejects creating a TodoItem in an unknown list', async () => {
    const response = await invoke('TodoItem.create', {
      id: 'todo-1',
      list: todoListRef('missing-list'),
      title: 'Orphaned todo',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'failed',
        executed: true,
        failure: {
          reason: 'todo_list_not_found',
          list: todoListRef('missing-list'),
        },
      },
    });
    expect(getTodoDataset().TodoItem).toEqual([]);
  });

  it('requires one explicit Principal for a protected operation from Node', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Authenticate the runtime', completed: false },
    ];

    await expect(TodoItem.complete({ todos: ['todo-1'] })).resolves.toMatchObject({
      ok: false,
      kind: 'failed',
      failure: { reason: 'not_authenticated' },
    });
    await expect(
      TodoApplication.app.runtime.withInvocationContext({ principal: testPrincipal }, () =>
        TodoItem.complete({ todos: ['todo-1'] }),
      ),
    ).resolves.toMatchObject({ ok: true, kind: 'success' });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(true);
  });

  it('rejects a protected operation over Express without a Principal', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Authenticate the runtime', completed: false },
    ];

    const response = await invoke('TodoItem.complete', {
      todos: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'references',
          refs: [{ kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-1' } }],
        },
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'failed',
        failure: { reason: 'not_authenticated' },
      },
    });
    expect(getTodoDataset().TodoItem?.[0]?.completed).toBe(false);
  });

  it('deletes every TodoItem through a void-input operation', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: true },
    ];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'invoke', operationId: 'TodoItem.deleteAll' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
    expect(getTodoDataset().TodoItem).toEqual([]);
  });

  it('serves the embedded Explorer snapshot and active runtime metadata', async () => {
    const origin = endpoint.replace(/\/operations$/, '');
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Visible in Explorer', completed: false },
    ];

    await expect(fetch(`${origin}/runtime`).then(response => response.json())).resolves.toEqual({
      storage: 'in-memory',
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
        operations: expect.arrayContaining([expect.objectContaining({ id: 'TodoItem.deleteAll' })]),
      },
      entityDetails: expect.arrayContaining([expect.objectContaining({ name: 'TodoItem' })]),
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

    const response = await invoke(
      'TodoItem.complete',
      {
        todos: { kind: 'selection', entityName: 'TodoItem', expression },
      },
      true,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
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
    const response = await fetch(`${origin}/graph/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toGraphCommandRequest(command)),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'graph-command-result',
      value: {
        status: 'applied',
        delta: { added: expect.any(Array), removed: [] },
      },
    });
    expect(getTodoRelationships()).toHaveLength(2);
  });

  it('creates a Tag through the generic remote Entity mutation capability', async () => {
    const remoteExecutor = createFetchGraphReadExecutor({
      endpoint: `${origin}/graph/reads`,
      commandEndpoint: `${origin}/graph/commands`,
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

  it('denies a remotely mutable Tag Field that is absent from policy', async () => {
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];
    const remoteExecutor = createFetchGraphReadExecutor({
      endpoint: `${origin}/graph/reads`,
      commandEndpoint: `${origin}/graph/commands`,
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
    const response = await fetch(`${origin}/graph/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toGraphCommandRequest(command)),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
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

    const response = await fetch(`${origin}/graph/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toGraphCommandRequest(command)),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
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

  it('starts and completes the durable operation through the same transport', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];

    const response = await invoke('TodoItem.completeAll', {});

    expect(response.status).toBe(200);
    const start = (await response.json()) as {
      result: { value: { taskId: string; runId: string } };
    };
    expect(start).toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: { taskId: 'TodoItem.completeAll' },
      },
    });
    const snapshotUrl = `${endpoint}/tasks/${encodeURIComponent(start.result.value.taskId)}/${encodeURIComponent(start.result.value.runId)}`;

    await expect
      .poll(
        async () => {
          const snapshot = await fetch(snapshotUrl).then(result => result.json());
          return snapshot;
        },
        { timeout: 3_000 },
      )
      .toMatchObject({
        status: 'completed',
        progress: { phase: 'updating' },
        result: { completed: 2 },
      });
  });
});
