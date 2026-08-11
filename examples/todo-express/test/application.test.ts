import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTodoExpressApp } from '../src/application.js';
import { TodoItem, TodoApplication, TodoList, TodoTag, todoNotifications } from '../src/graph.js';

const getTodoDataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') {
    throw new Error('Todo application tests require in-memory storage.');
  }

  return TodoApplication.storage.dataset;
};

describe('Ontahi todo portability example', () => {
  let closeServer: (() => Promise<void>) | undefined;
  let endpoint = '';

  beforeEach(async () => {
    getTodoDataset().TodoList = [{ id: 'list-1', name: 'Inbox' }];
    getTodoDataset().Tag = [];
    getTodoDataset().TodoTag = [];
    getTodoDataset().TodoItem = [];
    const server = await new Promise<Server>(resolve => {
      const started = createTodoExpressApp().listen(0, '127.0.0.1', () => resolve(started));
    });
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/operations`;
    closeServer = async () => {
      server.closeAllConnections();
      server.close();
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeServer?.();
  });

  const invoke = (operationId: string, input: unknown) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

  it('uses the bound TodoList directly from Node', async () => {
    await expect(TodoList.list()).resolves.toMatchObject({
      ok: true,
      value: [{ id: 'list-1', name: 'Inbox' }],
    });

    const list = TodoList.refById('list-1');
    await expect(TodoList.rename({ list, name: 'Research backlog' })).resolves.toMatchObject({
      ok: true,
      value: { id: 'list-1', name: 'Research backlog' },
    });
    expect(getTodoDataset().TodoList).toEqual([{ id: 'list-1', name: 'Research backlog' }]);
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

  it('lists the TodoItems related to one TodoList from Node', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-2', list: 'list-2', title: 'Ignore me', completed: false },
      { id: 'todo-1', list: 'list-1', title: 'Read Ontahi guide', completed: false },
    ];

    await expect(
      TodoItem.itemsForList({ list: TodoList.refById('list-1') }),
    ).resolves.toMatchObject({
      ok: true,
      value: [
        {
          id: 'todo-1',
          list: todoListRef('list-1'),
          title: 'Read Ontahi guide',
          completed: false,
        },
      ],
    });
  });

  it('acts on an association through its composite identity from Node', async () => {
    getTodoDataset().TodoTag = [
      { todoId: 'todo-write-guide', tagId: 'tag-urgent' },
      { todoId: 'todo-review-guide', tagId: 'tag-urgent' },
    ];

    const assignment = TodoTag.refByTodoAndTag('todo-write-guide', 'tag-urgent');

    await expect(TodoTag.remove({ assignment })).resolves.toMatchObject({
      ok: true,
      kind: 'success',
    });
    expect(getTodoDataset().TodoTag).toEqual([
      { todoId: 'todo-review-guide', tagId: 'tag-urgent' },
    ]);
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

  it('uses one predicate Selection from Node and Express', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'Open', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Completed', completed: true },
      { id: 'todo-3', list: 'list-2', title: 'Another list', completed: false },
    ];
    const openTodos = TodoItem.selection(todo => todo.list.eq(TodoList.refById('list-1'))).and(
      todo => todo.completed.eq(false),
    );

    await expect(TodoItem.list(openTodos)).resolves.toMatchObject({
      ok: true,
      value: [{ id: 'todo-1', list: todoListRef('list-1'), title: 'Open', completed: false }],
    });

    const response = await invoke('TodoItem.list', openTodos);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: [{ id: 'todo-1', list: todoListRef('list-1'), title: 'Open', completed: false }],
      },
    });
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
          expect.objectContaining({ name: 'TodoTag' }),
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

    const response = await invoke('TodoItem.complete', {
      todos: { kind: 'selection', entityName: 'TodoItem', expression },
    });

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

  it('assigns tags to an explicit TodoItem selection through the associative entity', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', list: 'list-1', title: 'Second', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];

    const response = await invoke('TodoItem.assignTags', {
      todos: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'references',
          refs: [
            { kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-1' } },
            { kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-2' } },
          ],
        },
      },
      tagIds: ['tag-1'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
    expect(getTodoDataset().TodoTag).toEqual([
      { todoId: 'todo-1', tagId: 'tag-1' },
      { todoId: 'todo-2', tagId: 'tag-1' },
    ]);
  });

  it('rejects assigning unknown tags without creating partial associations', async () => {
    getTodoDataset().TodoItem = [
      { id: 'todo-1', list: 'list-1', title: 'First', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];

    const response = await invoke('TodoItem.assignTags', {
      todos: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'references',
          refs: [{ kind: 'entity-ref', entityName: 'TodoItem', locator: { id: 'todo-1' } }],
        },
      },
      tagIds: ['tag-1', 'missing-tag'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'failed',
        executed: true,
        failure: {
          reason: 'tags_not_found',
          tagIds: ['missing-tag'],
        },
      },
    });
    expect(getTodoDataset().TodoTag).toEqual([]);
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
