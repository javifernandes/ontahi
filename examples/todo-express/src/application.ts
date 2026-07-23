import path from 'node:path';

import {
  createOperationInvocationDispatcher,
  type OperationInvocationOperation,
} from '@ontahi/core/runtime/server/operation-invocation';
import {
  createExpressOperationInvocationHandler,
  createExpressTaskSnapshotHandler,
} from '@ontahi/runtime-express';
import { Effect } from 'effect';
import express, { type Express } from 'express';

import { app } from './architecture.js';
import { TodoGraphApi } from './graph.js';

export const operationDispatcher = createOperationInvocationDispatcher({
  resolveOperation: operationId =>
    TodoGraphApi.getDomainOperation(operationId) as OperationInvocationOperation | undefined,
  invokeOperation: (operation, input) => app.operation.invoke(operation, input),
  checkPermission: (operation, input) => app.operation.checkPermission(operation, input),
});

export const createTodoExpressApp = (): Express => {
  const server = express();
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');

  server.use(express.json());
  server.post(
    '/operations',
    createExpressOperationInvocationHandler({ dispatcher: operationDispatcher }),
  );
  server.get(
    '/operations/tasks/:taskId/:runId',
    createExpressTaskSnapshotHandler({
      getSnapshot: ref => Effect.runPromise(app.task.getSnapshot(ref)),
    }),
  );
  server.get('/application', (_request, response) => response.json(TodoGraphApi.describe()));
  server.use(express.static(clientDirectory));
  server.get('/', (_request, response) =>
    response.sendFile(path.join(clientDirectory, 'index.html')),
  );

  return server;
};
