import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { entity, field, value } from '@ontahi/core/data-graph';
import type { OntahiApplication } from '@ontahi/core/runtime/server';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ontahiExpress } from '../src/application.js';

const TodoEntity = entity('Todo', {
  id: field.id(),
  title: field.string(),
});

const listOperation = {
  kind: 'domain-operation' as const,
  id: 'Todo.list',
  entityName: 'Todo',
  name: 'list',
  authority: 'server' as const,
  exposure: 'bridge' as const,
  input: value('ListTodosInput', {}),
  inputRefs: undefined,
  layer: 'todos',
  run: vi.fn(),
};

const graphSummary = {
  entities: [
    {
      name: 'Todo',
      graphOperationNames: [],
      domainOperationNames: ['list'],
      durableOperationNames: [],
      taskNames: [],
    },
  ],
  graphOperations: [],
  domainOperations: [
    {
      id: 'Todo.list',
      entityName: 'Todo',
      name: 'list',
      authority: 'server',
      exposure: 'bridge',
      hasBridgeQuery: false,
    },
  ],
  durableOperations: [],
  ingress: [],
  taskDefinitions: [],
};

const createApplication = (): OntahiApplication =>
  ({
    graph: {
      entities: { Todo: TodoEntity },
      entityNames: ['Todo'],
      listEntities: () => [TodoEntity],
      listGraphOperations: () => [],
      listDomainOperations: () => [listOperation],
      listTaskDefinitions: () => [],
      listHttpIngress: () => [],
      describe: () => graphSummary,
    },
    resolveOperation: (operationId: string) =>
      operationId === listOperation.id ? listOperation : undefined,
    invokeOperation: vi.fn(async () => ({
      ok: true,
      kind: 'success',
      value: [{ id: 'todo-1', title: 'Mounted' }],
    })),
    checkPermission: vi.fn(async () => ({ allowed: true })),
    getTaskSnapshot: vi.fn(async ref => ({
      ...ref,
      status: 'completed',
      updatedAt: '2026-07-25T00:00:00.000Z',
      result: [],
    })),
    reflectedEntityDataReader: {
      readEntityData: vi.fn(async query => ({
        entityName: query.entityName,
        columns: [],
        rows: [{ id: 'todo-1', title: 'Mounted' }],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      })),
    },
  }) as unknown as OntahiApplication;

describe('Ontahi Express application middleware', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = undefined;
  });

  it('mounts invocation, tasks, metadata, and Explorer endpoints with defaults', async () => {
    const application = createApplication();
    const expressApp = express();
    expressApp.use(ontahiExpress(application, { explorer: true }));
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await expect(
      fetch(`${origin}/operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'invoke', operationId: 'Todo.list' }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, value: [{ id: 'todo-1' }] },
    });
    await expect(fetch(`${origin}/application`).then(response => response.json())).resolves.toEqual(
      graphSummary,
    );
    await expect(
      fetch(`${origin}/operations/tasks/Todo.completeAll/run-1`).then(response => response.json()),
    ).resolves.toMatchObject({
      taskId: 'Todo.completeAll',
      runId: 'run-1',
      status: 'completed',
    });
    await expect(
      fetch(`${origin}/explorer/snapshot`).then(response => response.json()),
    ).resolves.toMatchObject({
      snapshot: { entities: [{ name: 'Todo' }], operations: [{ id: 'Todo.list' }] },
      entityDetails: [{ name: 'Todo' }],
    });
    await expect(
      fetch(`${origin}/explorer/entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityName: 'Todo' }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      entityName: 'Todo',
      rows: [{ id: 'todo-1' }],
    });
  });
});
