import { createServer, type Server } from 'node:http';
import path from 'node:path';

import { createApplicationRuntimeProtocol } from '@ontahi/core/runtime/server';
import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import {
  createExpressRuntimeProtocolWebSocketServer,
  type ExpressRuntimeProtocolWebSocketServer,
} from '@ontahi/runtime-express/runtime-protocol';
import express, { type Express } from 'express';

import { todoAuthenticationMode } from './authentication-mode.js';
import { createTodoAuthentication, type TodoAuthenticationAdapter } from './authentication.js';
import {
  TodoApplication,
  todoCommandProvider,
  todoModelRuntime,
  todoTaskRuntime,
} from './graph.js';
import { todoGraphCommandPolicies } from './todo-command-policies.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from './todo-read-policies.js';

export type CreateTodoExpressAppOptions = {
  authentication?: TodoAuthenticationAdapter;
  publicOrigin?: string;
};

const createTodoExpressRuntime = (options: CreateTodoExpressAppOptions = {}) => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  const authentication = options.authentication ?? createTodoAuthentication();
  const modelCommandRuntime = todoModelRuntime;
  const runtimeProtocol = createApplicationRuntimeProtocol<TodoGraphReadAuthority>({
    application: TodoApplication,
    graphRead: { policies: todoGraphReadPolicies },
    graphCommand: { policies: todoGraphCommandPolicies },
    ...(modelCommandRuntime ? { modelCommand: { runtime: modelCommandRuntime } } : {}),
    taskInteractionActor: context =>
      context.principal
        ? { kind: context.principal.kind, id: context.principal.subject }
        : todoAuthenticationMode === 'disabled'
          ? { kind: 'system' }
          : null,
  });

  authentication.mount(server);

  server.use(express.static(clientDirectory));

  // Setup Express for Ontahi App
  server.use(
    ontahiExpress(TodoApplication, {
      legacyRuntimeEndpoints: false,
      explorer: createOntahiExpressExplorer({
        indexFile: path.join(clientDirectory, 'index.html'),
      }),
      invocationContext: request => ({
        principal: authentication.principal(request),
      }),
      runtimeProtocol: {
        receiver: runtimeProtocol,
        context: request => ({
          principal: authentication.principal(request),
        }),
      },
    }),
  );

  // custom app routes
  server.get('/runtime', (_request, response) =>
    response.json({
      storage: TodoApplication.storage.kind,
      taskRuntime: todoTaskRuntime,
      commandChat: Boolean(todoCommandProvider),
    }),
  );
  server.get('/', (_request, response) =>
    response.sendFile(path.join(clientDirectory, 'index.html')),
  );

  return { application: server, authentication, runtimeProtocol };
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
    receiver: runtime.runtimeProtocol,
    authorizeUpgrade: request => isSameOriginBrowserUpgrade(request, publicOrigin),
    context: async request => ({
      principal: await runtime.authentication.webSocketPrincipal(request),
    }),
  });

  return Object.assign(server, { runtimeProtocolWebSocket });
};
