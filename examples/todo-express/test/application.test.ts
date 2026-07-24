import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTodoExpressApp } from '../src/application.js';
import { todoDataset } from '../src/architecture.js';

describe('Ontahi todo portability example', () => {
  let closeServer: (() => Promise<void>) | undefined;
  let endpoint = '';

  beforeEach(async () => {
    todoDataset.Todo = [];
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
    const response = await invoke('Todo.create', { id: 'todo-1', title: 'Read Ontahi guide' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'invocation-result',
      result: {
        ok: true,
        kind: 'success',
        value: { id: 'todo-1', title: 'Read Ontahi guide', completed: false },
      },
    });
    expect(todoDataset.Todo).toEqual([
      { id: 'todo-1', title: 'Read Ontahi guide', completed: false },
    ]);
  });

  it('returns the canonical validation result for invalid input', async () => {
    const response = await invoke('Todo.create', { id: 'todo-1', title: '' });

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
    expect(todoDataset.Todo).toEqual([]);
  });

  it('invokes a void-input operation when the transport omits input', async () => {
    todoDataset.Todo = [{ id: 'todo-1', title: 'Persisted', completed: false }];

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
        value: [{ id: 'todo-1', title: 'Persisted', completed: false }],
      },
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
    todoDataset.Todo = [
      { id: 'todo-1', title: 'First', completed: false },
      { id: 'todo-2', title: 'Second', completed: false },
    ];

    const response = await invoke('Todo.complete', {
      todos: { kind: 'selection', entityName: 'Todo', expression },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success' },
    });
    expect(todoDataset.Todo?.filter(todo => todo.completed).map(todo => todo.id)).toEqual(
      completedIds,
    );
  });

  it('starts and completes the durable operation through the same transport', async () => {
    todoDataset.Todo = [
      { id: 'todo-1', title: 'First', completed: false },
      { id: 'todo-2', title: 'Second', completed: false },
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
