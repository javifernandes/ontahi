import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createInMemoryDataGraphStorage,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  entity as defineEntitySchema,
  field,
  query,
  selection,
  value,
  type EntityMutationCommandPolicy,
  type GraphReadPolicy,
} from '@ontahi/core/data-graph';
import { entity as defineOntahiEntity } from '@ontahi/core/entity';
import {
  createRuntimeProtocolDispatcher,
  createRuntimeProtocolRequest,
  toDurableOperationProtocolRequest,
  toDurableOperationSnapshotResponse,
} from '@ontahi/core/runtime/protocol';
import {
  configureServerRuntime,
  getCurrentPrincipal,
  ontahi,
  resetServerRuntimeForTests,
  type InvocationContext,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';
import { Effect } from 'effect';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ontahiExpress } from './application.js';
import { createOntahiExpressExplorer } from './explorer/index.js';

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
    reflectedRelatedEntityDataReader: {
      readRelatedEntityData: vi.fn(async query => ({
        entityName: query.targetEntityName,
        columns: [],
        rows: [{ id: 'todo-related' }],
        page: 1,
        pageSize: 25,
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
    await expect(
      fetch(`${origin}/explorer/related-entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: { kind: 'entity-ref', entityName: 'Todo', locator: { id: 'todo-1' } },
          relationName: 'children',
          sourceEntityName: 'Todo',
          targetEntityName: 'Todo',
        }),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      entityName: 'Todo',
      rows: [{ id: 'todo-related' }],
    });
  });

  it('uses one invocation context factory for operations and graph reads', async () => {
    const application = createApplication();
    application.invokeOperation = vi.fn(async () => ({
      ok: true as const,
      kind: 'success' as const,
      value: getCurrentPrincipal(),
    }));
    const invocationContext = vi.fn(request => ({
      principal: {
        subject: request.header('x-subject') ?? 'anonymous',
        kind: 'user' as const,
      },
    }));
    const dispatcher = vi.fn(async (_request, context: { authority: InvocationContext }) => ({
      kind: 'graph-read-result' as const,
      value: [context.authority.principal],
    }));
    const expressApp = express();
    expressApp.use(
      ontahiExpress(application, {
        invocationContext,
        graphRead: { dispatcher },
      }),
    );
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { 'content-type': 'application/json', 'x-subject': 'user-1' };

    const operationResponse = await fetch(`${origin}/operations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'invoke', operationId: 'Todo.list' }),
    });
    const graphResponse = await fetch(`${origin}/graph/reads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        selection: {
          kind: 'selection',
          entityName: 'Todo',
          expression: { kind: 'all' },
        },
        orderBy: [],
      }),
    });

    await expect(operationResponse.json()).resolves.toMatchObject({
      result: { value: { subject: 'user-1' } },
    });
    await expect(graphResponse.json()).resolves.toEqual({
      kind: 'graph-read-result',
      value: [{ subject: 'user-1', kind: 'user' }],
    });
    expect(invocationContext).toHaveBeenCalledTimes(2);
  });

  it('reflects authorized Entity mutation affordances into Explorer details', async () => {
    const policy = {
      entity: TodoEntity,
      scope: 'all',
      actions: {
        update: { fields: ['title'], result: ['id', 'title'] },
        delete: { result: ['id', 'title'] },
      },
    } satisfies EntityMutationCommandPolicy<typeof TodoEntity>;
    const expressApp = express();
    expressApp.use(
      ontahiExpress(createApplication(), {
        explorer: createOntahiExpressExplorer(),
        graphCommand: {
          policies: [policy],
          dispatcher: vi.fn(),
        },
      }),
    );
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await expect(
      fetch(`${origin}/explorer/snapshot`).then(response => response.json()),
    ).resolves.toMatchObject({
      entityDetails: [
        {
          name: 'Todo',
          mutations: {
            update: { fields: ['title'] },
            delete: true,
          },
        },
      ],
    });
  });

  it('rejects policy wiring for applications without a graph storage runtime', () => {
    const policy = {
      entity: TodoEntity,
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 50,
      fields: {
        id: { select: true },
        title: { select: true },
      },
      scope: 'all',
    } satisfies GraphReadPolicy<typeof TodoEntity, InvocationContext>;

    expect(() =>
      ontahiExpress(createApplication(), {
        graphRead: { policies: [policy] },
      }),
    ).toThrow('graph-read policies require an application created with ontahi()');
  });

  it('mounts every Ontahi route below a custom root path', async () => {
    const application = createApplication();
    const runtimeProtocolDispatcher = createRuntimeProtocolDispatcher({
      handlers: {
        'durable.operation': async request =>
          toDurableOperationSnapshotResponse(await application.getTaskSnapshot(request.run)),
      },
    });
    const expressApp = express();
    expressApp.use(
      ontahiExpress(application, {
        mountPath: '/internal/ontahi',
        explorer: createOntahiExpressExplorer(),
        runtimeProtocol: {
          dispatcher: runtimeProtocolDispatcher,
          context: () => undefined,
        },
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
      fetch(`${origin}/internal/ontahi/runtime`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          createRuntimeProtocolRequest({
            id: 'inspect-1',
            family: 'durable.operation',
            body: toDurableOperationProtocolRequest({
              taskId: 'Todo.completeAll',
              runId: 'run-1',
            }),
          }),
        ),
      }).then(response => response.json()),
    ).resolves.toMatchObject({
      kind: 'response',
      family: 'durable.operation',
      body: { kind: 'snapshot', snapshot: { status: 'completed' } },
    });
    await expect(
      fetch(`${origin}/internal/ontahi/explorer/snapshot`).then(response => response.json()),
    ).resolves.toMatchObject({ snapshot: { entities: [{ name: 'Todo' }] } });
    await expect(fetch(`${origin}/application`).then(response => response.status)).resolves.toBe(
      404,
    );
  });

  it('runs one projected Todo Query unchanged through direct and Express HTTP runtimes', async () => {
    const defineTodoGraph = () => {
      const Todo = defineEntitySchema('RemoteTodo', {
        id: field.id(),
        title: field.string(),
        completed: field.boolean(),
        ownerId: field.string(),
      });
      return { Todo };
    };
    const client = defineTodoGraph();
    const serverGraph = defineTodoGraph();
    const dataset = {
      RemoteTodo: [
        {
          id: 'todo-1',
          title: 'Define the protocol',
          completed: false,
          ownerId: 'owner-1',
        },
        {
          id: 'todo-2',
          title: 'Build the HTTP bridge',
          completed: false,
          ownerId: 'owner-1',
        },
        {
          id: 'todo-private',
          title: 'Another owner',
          completed: false,
          ownerId: 'owner-2',
        },
      ],
    };
    type Authority = { ownerId: string };
    const policy: GraphReadPolicy<typeof serverGraph.Todo, Authority> = {
      entity: serverGraph.Todo,
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 50,
      fields: {
        id: { select: true },
        title: { select: true, order: true },
        completed: { filter: ['eq'] },
        ownerId: { filter: ['eq'] },
      },
      scope: ({ authority, entity: ScopedTodo }) =>
        selection(ScopedTodo, todo => todo.ownerId.eq(authority.ownerId)),
    };
    const directRuntime = createInMemoryDataGraphRuntime({
      dataset: {
        RemoteTodo: dataset.RemoteTodo.filter(todo => todo.ownerId === 'owner-1'),
      },
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset }),
      entities: { RemoteTodo: serverGraph.Todo },
    });
    const expressApp = express();
    expressApp.use(
      ontahiExpress(application, {
        graphRead: {
          policies: [policy],
          authority: (_context, request) => {
            const ownerId = request.header('x-owner-id');
            if (!ownerId) throw new Error('Missing graph authority.');
            return { ownerId };
          },
        },
      }),
    );
    server = await new Promise<Server>(resolve => {
      const started = expressApp.listen(0, '127.0.0.1', () => resolve(started));
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const remoteRuntime = createRemoteDataGraphRuntime({
      transport: async (request, options?: { ownerId: string; credential: string }) => {
        const response = await fetch(`${origin}/graph/reads`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-owner-id': options?.ownerId ?? 'missing',
            authorization: `Bearer ${options?.credential ?? 'missing'}`,
          },
          body: JSON.stringify({
            ...request,
            authority: { ownerId: 'owner-2' },
          }),
        });
        return response.json();
      },
    });
    const directGraph = createRuntimeBoundDataGraphApi(() => directRuntime);
    const remoteGraph = createRuntimeBoundDataGraphApi(() => remoteRuntime);
    const TodoListItem = client.Todo.view('RemoteTodoListItem', { id: true, title: true });
    const openTodos = query(client.Todo)
      .where(todo => todo.completed.eq(false))
      .as(TodoListItem)
      .orderBy(todo => todo.title);

    const direct = await Effect.runPromise(directGraph.bindGraphRead(openTodos).run());
    const remote = await Effect.runPromise(
      remoteGraph.bindGraphRead(openTodos).run(undefined, {
        ownerId: 'owner-1',
        credential: 'server-session',
      }),
    );

    expect(remote).toEqual(direct);
    expect(remote).toEqual([
      { id: 'todo-2', title: 'Build the HTTP bridge' },
      { id: 'todo-1', title: 'Define the protocol' },
    ]);
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
