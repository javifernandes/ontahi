import {
  createOperationInvocationDispatcher,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';
import express, { type Request, type Router } from 'express';

import {
  createExpressGraphReadHandler,
  type ExpressGraphReadContextFactory,
} from './graph-read/handler.js';
import { mountExpressHttpIngress, type OntahiExpressIngressOptions } from './http-ingress.js';
import { createExpressOperationInvocationHandler } from './operation-invocation/handler.js';
import type { ExpressInvocationContextFactory } from './operation-invocation/handler.js';
import { createExpressTaskSnapshotHandler } from './task-snapshot/handler.js';

export type OntahiExpressExplorerOptions = {
  buildSnapshot(application: OntahiApplication): unknown;
  path?: string;
  indexFile?: string;
};

export type OntahiExpressGraphReadOptions<TAuthority> = {
  dispatcher: import('@ontahi/core/data-graph').GraphReadDispatcher<TAuthority>;
  context: ExpressGraphReadContextFactory<TAuthority>;
  path?: string;
};

export type OntahiExpressOptions<TGraphReadAuthority = unknown> = {
  mountPath?: string;
  operationsPath?: string;
  graphRead?: OntahiExpressGraphReadOptions<TGraphReadAuthority>;
  applicationPath?: string | false;
  explorer?: OntahiExpressExplorerOptions;
  ingress?: OntahiExpressIngressOptions;
  invocationContext?: ExpressInvocationContextFactory;
  reportError?: (error: unknown, request: Request) => void;
};

const routePath = (value: string) => (value.startsWith('/') ? value : `/${value}`);
const mountPath = (value: string) => {
  const path = routePath(value);
  return path === '/' ? path : path.replace(/\/+$/, '');
};

export const ontahiExpress = <TGraphReadAuthority = unknown>(
  application: OntahiApplication,
  options: OntahiExpressOptions<TGraphReadAuthority> = {},
): Router => {
  const router = express.Router();
  const operationsPath = routePath(options.operationsPath ?? '/operations');
  const applicationPath =
    options.applicationPath === false
      ? undefined
      : routePath(options.applicationPath ?? '/application');
  const explorer = options.explorer;
  const dispatcher = createOperationInvocationDispatcher({
    resolveOperation: application.resolveOperation,
    invokeOperation: application.invokeOperation,
    checkPermission: application.checkPermission,
  });

  router.post(
    operationsPath,
    express.json(),
    createExpressOperationInvocationHandler({
      dispatcher,
      invocationContext: options.invocationContext,
      reportError: options.reportError,
    }),
  );

  if (options.graphRead) {
    router.post(
      routePath(options.graphRead.path ?? '/graph/reads'),
      express.json(),
      createExpressGraphReadHandler({
        dispatcher: options.graphRead.dispatcher,
        context: options.graphRead.context,
        reportError: options.reportError,
      }),
    );
  }

  if (options.ingress) {
    mountExpressHttpIngress({
      router,
      routes: application.graph.listHttpIngress(),
      ingress: options.ingress,
      dispatcher,
      reportError: options.reportError,
    });
  }

  router.get(
    `${operationsPath}/tasks/:taskId/:runId`,
    createExpressTaskSnapshotHandler({
      getSnapshot: application.getTaskSnapshot,
      reportError: options.reportError,
    }),
  );

  if (applicationPath) {
    router.get(applicationPath, (_request, response) =>
      response.json(application.graph.describe()),
    );
  }

  if (explorer) {
    const explorerPath = routePath(explorer.path ?? '/explorer');

    router.get(`${explorerPath}/snapshot`, (_request, response) =>
      response.json(explorer.buildSnapshot(application)),
    );
    router.post(`${explorerPath}/entities`, express.json(), (request, response, next) => {
      if (!application.reflectedEntityDataReader) {
        response.status(404).json({
          error: 'Reflected entity data is not configured for this application.',
        });
        return;
      }

      void application.reflectedEntityDataReader
        .readEntityData(request.body)
        .then(result => response.json(result))
        .catch(next);
    });

    const explorerIndexFile = explorer.indexFile;
    if (explorerIndexFile) {
      router.get([explorerPath, `${explorerPath}/*`], (_request, response) =>
        response.sendFile(explorerIndexFile),
      );
    }
  }

  const root = mountPath(options.mountPath ?? '/');

  if (root === '/') return router;

  const mountedRouter = express.Router();
  mountedRouter.use(root, router);
  return mountedRouter;
};

export const createOntahiExpressRouter = ontahiExpress;
