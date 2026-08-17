import path from 'node:path';

import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import express, { type Express } from 'express';

import { createTodoAuthentication, type TodoAuthenticationAdapter } from './authentication.js';
import { todoGraphReadDispatcher } from './graph-read.js';
import { TodoApplication } from './graph.js';

export type CreateTodoExpressAppOptions = {
  authentication?: TodoAuthenticationAdapter;
};

export const createTodoExpressApp = (options: CreateTodoExpressAppOptions = {}): Express => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  const authentication = options.authentication ?? createTodoAuthentication();

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
      graphRead: {
        dispatcher: todoGraphReadDispatcher,
        context: request => ({
          authority: { principal: authentication.principal(request) },
        }),
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
