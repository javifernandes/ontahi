import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createInMemoryDataGraphStorage,
  entity as defineEntitySchema,
  field,
  value,
} from '@ontahi/core/data-graph';
import { entity as defineOntahiEntity } from '@ontahi/core/entity';
import {
  configureServerRuntime,
  ontahi,
  resetServerRuntimeForTests,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ontahiExpress } from '../src/application.js';
import { createOntahiExpressExplorer } from '../src/explorer/index.js';

const TodoEntity = defineEntitySchema('Todo', {
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
    resetServerRuntimeForTests();
  });

  it('transports opted-in internal error causes as JSON-safe diagnostics', async () => {
    const Driver = defineOntahiEntity({
      name: 'DiagnosticDriver',
      fields: {
        name: field.string(),
      },
    });
    const Trip = defineOntahiEntity({
      name: 'DiagnosticTrip',
      fields: {
        id: field.id(),
        driver: field.ref(Driver),
      },
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'bridge',
        layer: 'trips',
      },
      operations: ({ self, commands, operation }) => ({
        list: operation({
          output: self.array(),
          run: () =>
            commands.all().include(trip => ({
              driver: trip.driver.select(driver => ({ name: driver.name })),
            })),
        }),
      }),
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: {
          DiagnosticDriver: [{ name: 'Ada' }],
          DiagnosticTrip: [{ id: 'trip-1', driver: 'driver-1' }],
        },
      }),
      entities: [Driver, Trip],
    });
    configureServerRuntime({
      diagnostics: {
        exposeInternalErrorCauses: true,
      },
    });
    const expressApp = express();
    expressApp.use(ontahiExpress(application));
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await expect(
      fetch(`${origin}/operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'invoke', operationId: 'DiagnosticTrip.list' }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: false,
        kind: 'failed',
        failure: {
          reason: 'internal_error',
          cause: {
            name: 'InMemoryDataGraphError',
            message: 'Failed to execute in-memory read.',
            cause: {
              name: 'Error',
              message:
                'Cannot store a reference to DiagnosticDriver: the target must have a single-field identity.',
            },
          },
        },
      },
    });
  });

  it('mounts invocation, tasks, metadata, and Explorer endpoints with defaults', async () => {
    const application = createApplication();
    const expressApp = express();
    expressApp.use(
      ontahiExpress(application, {
        explorer: createOntahiExpressExplorer(),
      }),
    );
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

  it('mounts every Ontahi route below a custom root path', async () => {
    const application = createApplication();
    const expressApp = express();
    expressApp.use(
      ontahiExpress(application, {
        mountPath: '/internal/ontahi',
        explorer: createOntahiExpressExplorer(),
      }),
    );
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await expect(
      fetch(`${origin}/internal/ontahi/application`).then(response => response.json()),
    ).resolves.toEqual(graphSummary);
    await expect(
      fetch(`${origin}/internal/ontahi/operations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'invoke', operationId: 'Todo.list' }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      kind: 'invocation-result',
      result: { ok: true },
    });
    await expect(
      fetch(`${origin}/internal/ontahi/operations/tasks/Todo.completeAll/run-1`).then(response =>
        response.json(),
      ),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      fetch(`${origin}/internal/ontahi/explorer/snapshot`).then(response => response.json()),
    ).resolves.toMatchObject({ snapshot: { entities: [{ name: 'Todo' }] } });
    await expect(fetch(`${origin}/application`).then(response => response.status)).resolves.toBe(
      404,
    );
  });

  it('mounts reflected HTTP ingress from a provider registry', async () => {
    const application = createApplication();
    application.graph.listHttpIngress = () => [
      {
        operationId: 'Todo.list',
        entityName: 'Todo',
        operationName: 'list',
        kind: 'http',
        method: 'POST',
        route: '/webhooks/github',
        provider: 'github-webhook',
        channel: 'source-control.push',
      },
    ];
    let receivedRequest: { body: string; event: string | null; path: string } | undefined;
    const expressApp = express();
    expressApp.use(
      ontahiExpress(application, {
        mountPath: '/internal/ontahi',
        ingress: {
          providers: {
            'github-webhook': {
              receive: async request => {
                receivedRequest = {
                  body: await request.text(),
                  event: request.headers.get('x-github-event'),
                  path: new URL(request.url).pathname,
                };

                return {
                  kind: 'accepted',
                  provider: 'github',
                  providerKey: 'github-webhook',
                  channel: 'source-control.push',
                  event: 'push',
                  deliveryId: 'delivery-123',
                  payload: {},
                  status: 202,
                };
              },
            },
          },
        },
      }),
    );
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const body = JSON.stringify({ repository: 'acme/docs' });

    await expect(
      fetch(`${origin}/internal/ontahi/webhooks/github`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'push',
        },
        body,
      }).then(async response => ({ body: await response.json(), status: response.status })),
    ).resolves.toEqual({
      body: {
        ok: true,
        provider: 'github',
        event: 'push',
        deliveryId: 'delivery-123',
      },
      status: 202,
    });
    expect(receivedRequest).toEqual({
      body,
      event: 'push',
      path: '/webhooks/github',
    });
    expect(application.invokeOperation).toHaveBeenCalledWith(listOperation, {});
  });
});
