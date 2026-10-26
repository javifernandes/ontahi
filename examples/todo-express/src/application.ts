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
import { todoEventRuntime } from './storage.js';
import { todoRuntimePolicies, type TodoRuntimeAuthority } from './todo-runtime-policies.js';
import { TodoListExportReady } from './todo.js';

export type CreateTodoExpressAppOptions = {
  authentication?: TodoAuthenticationAdapter;
  publicOrigin?: string;
};

const clientInstanceOrigin = (request: { get(name: string): string | undefined }) => {
  const claimed = request.get('x-ontahi-client-instance');
  const admitted =
    claimed !== undefined && claimed.length <= 256 && /^[A-Za-z0-9._:-]+$/.test(claimed);
  return {
    channel: 'web' as const,
    ...(admitted ? { clientInstanceId: claimed } : {}),
  };
};

const createTodoExpressRuntime = (options: CreateTodoExpressAppOptions = {}) => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  const authentication = options.authentication ?? createTodoAuthentication();
  const modelCommandRuntime = todoModelRuntime;
  const eventWaitFixtureEnabled = process.env.NODE_ENV !== 'production';
  const runtimeProtocol = createApplicationRuntimeProtocol<TodoRuntimeAuthority>({
    application: TodoApplication,
    policies: todoRuntimePolicies,
    // This example exposes one shared Todo graph, so authorized callers may receive the same
    // bounded semantic mutations that their invocation committed.
    projectCommittedMutations: mutations => mutations,
    // Event delivery is an explicit authority boundary even though this payload is entirely public.
    projectEventDelivery: delivery => delivery,
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
      ...(eventWaitFixtureEnabled
        ? {
            ingress: {
              providers: {
                'todo-export-fixture': {
                  receive: async (request: globalThis.Request) => {
                    if (request.headers.get('x-todo-export-fixture') !== 'ready') {
                      return { kind: 'rejected', status: 401, error: 'Invalid fixture header.' };
                    }
                    const payload = (await request.json()) as unknown;
                    if (
                      typeof payload !== 'object' ||
                      payload === null ||
                      typeof (payload as Record<string, unknown>).requestId !== 'string'
                    ) {
                      return { kind: 'rejected', status: 400, error: 'requestId is required.' };
                    }
                    const requestId = (payload as { requestId: string }).requestId;
                    return {
                      kind: 'accepted',
                      provider: 'todo-export-fixture',
                      providerKey: 'todo-export-fixture',
                      channel: 'todo.export-ready',
                      event: 'export.ready',
                      deliveryId: request.headers.get('x-todo-delivery') ?? crypto.randomUUID(),
                      correlation: { requestId },
                      payload,
                      status: 202,
                    };
                  },
                },
              },
              eventRoutes: [
                {
                  eventId: TodoListExportReady.id,
                  eventVersion: TodoListExportReady.version,
                  method: 'POST' as const,
                  route: '/fixtures/todo-list-export-ready',
                  provider: 'todo-export-fixture',
                  channel: 'todo.export-ready',
                },
              ],
            },
          }
        : {}),
      explorer: createOntahiExpressExplorer({
        indexFile: path.join(clientDirectory, 'index.html'),
      }),
      runtimeProtocol: {
        receiver: runtimeProtocol,
        context: request => ({
          principal: authentication.principal(request),
          origin: clientInstanceOrigin(request),
          modelResourceLimits: { maxAttempts: 3, maxOutputTokens: 1_024 },
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
      eventWaitDemo: Boolean(todoEventRuntime) && eventWaitFixtureEnabled,
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
      origin: { channel: 'web', clientInstanceId: crypto.randomUUID() },
      modelResourceLimits: { maxAttempts: 3, maxOutputTokens: 1_024 },
    }),
  });
};
