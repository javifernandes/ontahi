import path from 'node:path';

import {
  createRuntimeProtocolDispatcher,
  toDurableOperationSnapshotResponse,
} from '@ontahi/core/runtime/protocol';
import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import express, { type Express } from 'express';

import { createTodoAuthentication, type TodoAuthenticationAdapter } from './authentication.js';
import { TodoApplication } from './graph.js';
import { todoGraphReadPolicies } from './todo-read-policies.js';
import { Tag, TodoItem, TodoList } from './todo.js';

export type CreateTodoExpressAppOptions = {
  authentication?: TodoAuthenticationAdapter;
};

export const createTodoExpressApp = (options: CreateTodoExpressAppOptions = {}): Express => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  const authentication = options.authentication ?? createTodoAuthentication();
  const runtimeProtocolDispatcher = createRuntimeProtocolDispatcher({
    handlers: {
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
        policies: [
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
        ],
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

  return server;
};
