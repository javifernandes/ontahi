import {
  createOperationInvocationDispatcher,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';
import { buildExplorerSnapshot, getExplorerEntityDetail } from '@ontahi/explorer-react/server';
import express, { type Request, type Router } from 'express';

import { createExpressOperationInvocationHandler } from './operation-invocation/handler.js';
import { createExpressTaskSnapshotHandler } from './task-snapshot/handler.js';

export type OntahiExpressExplorerOptions = {
  path?: string;
  indexFile?: string;
};

export type OntahiExpressOptions = {
  operationsPath?: string;
  applicationPath?: string | false;
  explorer?: boolean | OntahiExpressExplorerOptions;
  reportError?: (error: unknown, request: Request) => void;
};

const routePath = (value: string) => (value.startsWith('/') ? value : `/${value}`);

const getExplorerOptions = (
  explorer: OntahiExpressOptions['explorer'],
): OntahiExpressExplorerOptions | undefined =>
  explorer === true ? {} : explorer === false || explorer === undefined ? undefined : explorer;

const buildApplicationExplorerSnapshot = (application: OntahiApplication) => {
  const { graph } = application;
  const entities = graph.listEntities();
  const graphSummary = graph.describe();

  return {
    snapshot: buildExplorerSnapshot({
      entities,
      graphSummary,
      graphOperations: graph.listGraphOperations(),
      domainOperations: graph.listDomainOperations(),
      tasks: graph.listTaskDefinitions(),
      httpIngress: graph.listHttpIngress(),
    }),
    entityDetails: entities
      .map(entity => getExplorerEntityDetail({ entities, graphSummary }, entity.name))
      .filter(detail => detail !== null),
  };
};

export const ontahiExpress = (
  application: OntahiApplication,
  options: OntahiExpressOptions = {},
): Router => {
  const router = express.Router();
  const operationsPath = routePath(options.operationsPath ?? '/operations');
  const applicationPath =
    options.applicationPath === false
      ? undefined
      : routePath(options.applicationPath ?? '/application');
  const explorer = getExplorerOptions(options.explorer);
  const dispatcher = createOperationInvocationDispatcher({
    resolveOperation: application.resolveOperation,
    invokeOperation: application.invokeOperation,
    checkPermission: application.checkPermission,
  });

  router.use(express.json());
  router.post(
    operationsPath,
    createExpressOperationInvocationHandler({
      dispatcher,
      reportError: options.reportError,
    }),
  );
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
      response.json(buildApplicationExplorerSnapshot(application)),
    );
    router.post(`${explorerPath}/entities`, (request, response, next) => {
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

  return router;
};

export const createOntahiExpressRouter = ontahiExpress;
