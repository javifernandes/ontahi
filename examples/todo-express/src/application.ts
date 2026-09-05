import { createServer, type Server } from 'node:http';
import path from 'node:path';

import {
  createPollingDurableOperationObserver,
  createRuntimeProtocolDispatcher,
  toDurableOperationSnapshotResponse,
} from '@ontahi/core/runtime/protocol';
import {
  createOperationInvocationDispatcher,
  type GraphCommandableOntahiApplication,
} from '@ontahi/core/runtime/server';
import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import {
  createExpressRuntimeProtocolWebSocketServer,
  type ExpressRuntimeProtocolWebSocketServer,
} from '@ontahi/runtime-express/runtime-protocol';
import express, { type Express } from 'express';

import { createTodoAuthentication, type TodoAuthenticationAdapter } from './authentication.js';
import { TodoApplication } from './graph.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from './todo-read-policies.js';
import { Tag, TodoItem, TodoList } from './todo.js';

export type CreateTodoExpressAppOptions = {
  authentication?: TodoAuthenticationAdapter;
  publicOrigin?: string;
};

const todoGraphCommandPolicies = [
  { entity: TodoItem, relationName: 'tags', actions: ['link', 'unlink'] },
  {
    entity: TodoItem,
    scope: 'all',
    actions: {
      update: {
        fields: ['list', 'title', 'completed'],
        if: ['title'],
        result: ['id', 'list', 'title', 'completed'],
      },
    },
  },
  {
    entity: TodoList,
    scope: 'all',
    actions: {
      update: {
        fields: ['name', 'color'],
        result: ['id', 'name', 'color'],
      },
    },
  },
  {
    entity: Tag,
    scope: 'all',
    actions: {
      create: {
        fields: ['id', 'name', 'color'],
        result: ['id', 'name', 'color'],
      },
      update: {
        fields: ['name', 'color'],
        result: ['id', 'name', 'color'],
      },
      delete: { result: ['id', 'name', 'color'] },
    },
  },
] as const;

const createTodoExpressRuntime = (options: CreateTodoExpressAppOptions = {}) => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  const authentication = options.authentication ?? createTodoAuthentication();
  const operationDispatcher = createOperationInvocationDispatcher(TodoApplication);
  const graphReadDispatcher =
    TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>(todoGraphReadPolicies);
  const graphReadObserver =
    TodoApplication.createGraphReadObserver<TodoGraphReadAuthority>(todoGraphReadPolicies);
  const graphCommandDispatcher = (
    TodoApplication as unknown as GraphCommandableOntahiApplication
  ).createGraphCommandDispatcher<TodoGraphReadAuthority>(todoGraphCommandPolicies);
  const runtimeProtocolDispatcher = createRuntimeProtocolDispatcher<TodoGraphReadAuthority>({
    handlers: {
      operation: (request, context) =>
        TodoApplication.app.runtime.withInvocationContext(context, () =>
          operationDispatcher(request),
        ),
      'graph.read': (request, authority) => graphReadDispatcher(request, { authority }),
      'graph.command': (request, authority) => graphCommandDispatcher(request, { authority }),
      'durable.operation': async request =>
        toDurableOperationSnapshotResponse(await TodoApplication.getTaskSnapshot(request.run)),
    },
  });

  authentication.mount(server);

  server.use(express.static(clientDirectory));

  // Setup Express for Ontahi App
  server.use(
    ontahiExpress(TodoApplication, {
      explorer: createOntahiExpressExplorer({
        indexFile: path.join(clientDirectory, 'index.html'),
      }),
      invocationContext: request => ({
        principal: authentication.principal(request),
      }),
      runtimeProtocol: {
        dispatcher: runtimeProtocolDispatcher,
        context: request => ({
          principal: authentication.principal(request),
        }),
      },
      graphRead: {
        policies: todoGraphReadPolicies,
      },
      graphCommand: {
        policies: todoGraphCommandPolicies,
      },
    }),
  );

  // custom app routes
  server.get('/runtime', (_request, response) =>
    response.json({ storage: TodoApplication.storage.kind }),
  );
  server.get('/', (_request, response) =>
    response.sendFile(path.join(clientDirectory, 'index.html')),
  );

  return { application: server, authentication, graphReadObserver, runtimeProtocolDispatcher };
};

export const createTodoExpressApp = (options: CreateTodoExpressAppOptions = {}): Express =>
  createTodoExpressRuntime(options).application;

export type TodoExpressServer = Server & {
  readonly runtimeProtocolWebSocket: ExpressRuntimeProtocolWebSocketServer;
};

const isSameOriginBrowserUpgrade = (
  request: Parameters<TodoAuthenticationAdapter['webSocketPrincipal']>[0],
  configuredPublicOrigin?: string,
) => {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    const publicOrigin =
      configuredPublicOrigin ??
      new URL(
        `${(request.socket as { encrypted?: boolean }).encrypted ? 'https:' : 'http:'}//${host}`,
      ).origin;
    return (
      (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') &&
      parsedOrigin.origin === publicOrigin
    );
  } catch {
    return false;
  }
};

const normalizePublicOrigin = (value: string) => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('Todo public origin must use http or https.');
  }
  return parsed.origin;
};

export const createTodoExpressServer = (
  options: CreateTodoExpressAppOptions = {},
): TodoExpressServer => {
  const runtime = createTodoExpressRuntime(options);
  const server = createServer(runtime.application);
  const publicOrigin =
    options.publicOrigin === undefined ? undefined : normalizePublicOrigin(options.publicOrigin);
  const runtimeProtocolWebSocket = createExpressRuntimeProtocolWebSocketServer({
    server,
    path: '/runtime',
    ownsUpgradeBoundary: true,
    dispatcher: runtime.runtimeProtocolDispatcher,
    authorizeUpgrade: request => isSameOriginBrowserUpgrade(request, publicOrigin),
    context: async request => ({
      principal: await runtime.authentication.webSocketPrincipal(request),
    }),
    observeDurableOperation: createPollingDurableOperationObserver<TodoGraphReadAuthority>({
      inspect: run => TodoApplication.getTaskSnapshot(run),
      pollIntervalMs: 100,
    }),
    observeGraph: (request, { context, signal }) =>
      runtime.graphReadObserver(request, { authority: context, signal }),
  });

  return Object.assign(server, { runtimeProtocolWebSocket });
};
