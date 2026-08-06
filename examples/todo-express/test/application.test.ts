import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTodoExpressApp } from '../src/application.js';
import { TodoApplication } from '../src/graph.js';

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
    getTodoDataset().Todo = [];
    const server = await new Promise<Server>(resolve => {
      const started = createTodoExpressApp().listen(0, '127.0.0.1', () => resolve(started));
    });
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/operations`;
    closeServer = async () => {
      server.closeAllConnections();
      server.close();
    };
  });

  afterEach(async () => closeServer?.());

  const invoke = (operationId: string, input: unknown) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'invoke', operationId, input }),
    });

  it('invokes a successful operation over Express end to end', async () => {
    const response = await invoke('Todo.create', {
      id: 'todo-1',
      listId: 'list-1',
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
          listId: 'list-1',
          title: 'Read Ontahi guide',
          completed: false,
        },
      },
    });
    expect(getTodoDataset().Todo).toEqual([
      { id: 'todo-1', listId: 'list-1', title: 'Read Ontahi guide', completed: false },
    ]);
  });

  it('returns the canonical validation result for invalid input', async () => {
    const response = await invoke('Todo.create', { id: 'todo-1', listId: 'list-1', title: '' });

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
    expect(getTodoDataset().Todo).toEqual([]);
  });

  it('rejects creating a Todo in an unknown list', async () => {
    const response = await invoke('Todo.create', {
      id: 'todo-1',
      listId: 'missing-list',
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
          listId: 'missing-list',
        },
      },
    });
    expect(getTodoDataset().Todo).toEqual([]);
  });

  it('invokes a void-input operation when the transport omits input', async () => {
    getTodoDataset().Todo = [
      { id: 'todo-1', listId: 'list-1', title: 'Persisted', completed: false },
    ];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'invoke', operationId: 'Todo.list' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: [{ id: 'todo-1', listId: 'list-1', title: 'Persisted', completed: false }],
      },
    });
  });

  it('deletes every Todo through a void-input operation', async () => {
    getTodoDataset().Todo = [
      { id: 'todo-1', listId: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', listId: 'list-1', title: 'Second', completed: true },
    ];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'invoke', operationId: 'Todo.deleteAll' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
    expect(getTodoDataset().Todo).toEqual([]);
  });

  it('serves the embedded Explorer snapshot and active runtime metadata', async () => {
    const origin = endpoint.replace(/\/operations$/, '');
    getTodoDataset().Todo = [
      { id: 'todo-1', listId: 'list-1', title: 'Visible in Explorer', completed: false },
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
          expect.objectContaining({ name: 'Todo' }),
          expect.objectContaining({ name: 'Tag' }),
          expect.objectContaining({ name: 'TodoTag' }),
        ]),
        operations: expect.arrayContaining([expect.objectContaining({ id: 'Todo.deleteAll' })]),
      },
      entityDetails: expect.arrayContaining([expect.objectContaining({ name: 'Todo' })]),
    });
    await expect(
      fetch(`${origin}/explorer/entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityName: 'Todo' }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      entityName: 'Todo',
      rows: [{ id: 'todo-1', listId: 'list-1', title: 'Visible in Explorer', completed: false }],
      totalCount: 1,
    });
  });

  it.each([
    {
      name: 'reference-defined membership',
      expression: {
        kind: 'references',
        refs: [{ kind: 'entity-ref', entityName: 'Todo', locator: { id: 'todo-1' } }],
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
    getTodoDataset().Todo = [
      { id: 'todo-1', listId: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', listId: 'list-1', title: 'Second', completed: false },
    ];

    const response = await invoke('Todo.complete', {
      todos: { kind: 'selection', entityName: 'Todo', expression },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
    expect(
      getTodoDataset()
        .Todo?.filter(todo => todo.completed)
        .map(todo => todo.id),
    ).toEqual(completedIds);
  });

  it('assigns tags to an explicit Todo selection through the associative entity', async () => {
    getTodoDataset().Todo = [
      { id: 'todo-1', listId: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', listId: 'list-1', title: 'Second', completed: false },
    ];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];

    const response = await invoke('Todo.assignTags', {
      todos: {
        kind: 'selection',
        entityName: 'Todo',
        expression: {
          kind: 'references',
          refs: [
            { kind: 'entity-ref', entityName: 'Todo', locator: { id: 'todo-1' } },
            { kind: 'entity-ref', entityName: 'Todo', locator: { id: 'todo-2' } },
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
    getTodoDataset().Todo = [{ id: 'todo-1', listId: 'list-1', title: 'First', completed: false }];
    getTodoDataset().Tag = [{ id: 'tag-1', name: 'Urgent', color: '#d95d4f' }];

    const response = await invoke('Todo.assignTags', {
      todos: {
        kind: 'selection',
        entityName: 'Todo',
        expression: {
          kind: 'references',
          refs: [{ kind: 'entity-ref', entityName: 'Todo', locator: { id: 'todo-1' } }],
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
    getTodoDataset().Todo = [
      { id: 'todo-1', listId: 'list-1', title: 'First', completed: false },
      { id: 'todo-2', listId: 'list-1', title: 'Second', completed: false },
    ];

    const response = await invoke('Todo.completeAll', {});

    expect(response.status).toBe(200);
    const start = (await response.json()) as {
      result: { value: { taskId: string; runId: string } };
    };
    expect(start).toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: { taskId: 'Todo.completeAll' },
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
