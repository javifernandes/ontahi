import path from 'node:path';

import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import express, { type Express } from 'express';

import { TodoApplication } from './graph.js';

export const createTodoExpressApp = (): Express => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');

  server.use(express.static(clientDirectory));

  // Setup Express for Ontahi App
  server.use(
    ontahiExpress(TodoApplication, {
      explorer: createOntahiExpressExplorer({
        indexFile: path.join(clientDirectory, 'index.html'),
      }),
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
