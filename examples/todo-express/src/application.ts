import path from 'node:path';

import { createApplicationRuntimeProtocol } from '@ontahi/core/runtime/server';
import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import {
  createExpressRuntimeProtocolHost,
  type ExpressRuntimeProtocolHost,
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
import { todoRuntimePolicies, type TodoRuntimeAuthority } from './todo-runtime-policies.js';

export type CreateTodoExpressAppOptions = {
  authentication?: TodoAuthenticationAdapter;
  publicOrigin?: string;
};

const createTodoExpressRuntime = (options: CreateTodoExpressAppOptions = {}) => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  const authentication = options.authentication ?? createTodoAuthentication();
  const modelCommandRuntime = todoModelRuntime;
  const runtimeProtocol = createApplicationRuntimeProtocol<TodoRuntimeAuthority>({
    application: TodoApplication,
    policies: todoRuntimePolicies,
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

export type TodoExpressServer = ExpressRuntimeProtocolHost<TodoRuntimeAuthority>;

export const createTodoExpressServer = (
  options: CreateTodoExpressAppOptions = {},
): TodoExpressServer => {
  const runtime = createTodoExpressRuntime(options);
  return createExpressRuntimeProtocolHost({
    application: runtime.application,
    receiver: runtime.runtimeProtocol,
    ...(options.publicOrigin === undefined ? {} : { publicOrigin: options.publicOrigin }),
    context: async request => ({
      principal: await runtime.authentication.webSocketPrincipal(request),
    }),
  });
};
