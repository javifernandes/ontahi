import type {
  GraphCommandDispatcher,
  GraphReadDispatcher,
  GraphReadPolicy,
  EntityMutationCommandPolicy,
  ManyToManyRelationshipCommandPolicy,
  RelationshipCommandPolicy,
} from '@ontahi/core/data-graph';
import {
  createOperationInvocationDispatcher,
  type GraphCommandableOntahiApplication,
  type GraphReadableOntahiApplication,
  type InvocationContext,
  type OntahiApplication,
} from '@ontahi/core/runtime/server';
import express, { type Request, type Router } from 'express';

import {
  createExpressGraphCommandHandler,
  type ExpressGraphCommandAuthorityFactory,
  type ExpressGraphCommandContextFactory,
} from './graph-command/handler.js';
import {
  createExpressGraphReadHandler,
  type ExpressGraphReadAuthorityFactory,
  type ExpressGraphReadContextFactory,
} from './graph-read/handler.js';
import { mountExpressHttpIngress, type OntahiExpressIngressOptions } from './http-ingress.js';
import { createExpressOperationInvocationHandler } from './operation-invocation/handler.js';
import type { ExpressInvocationContextFactory } from './request-context.js';
import { createExpressTaskSnapshotHandler } from './task-snapshot/handler.js';

export type OntahiExpressExplorerOptions = {
  buildSnapshot(
    application: OntahiApplication,
    context?: {
      graphCommandPolicies: OntahiExpressGraphCommandOptions['policies'];
    },
  ): unknown;
  path?: string;
  indexFile?: string;
};

type OntahiExpressGraphReadCommonOptions = {
  path?: string;
};

export type OntahiExpressGraphReadOptions<TAuthority = InvocationContext> =
  OntahiExpressGraphReadCommonOptions &
    (
      | {
          policies: readonly GraphReadPolicy<any, InvocationContext>[];
          dispatcher?: never;
          context?: never;
          authority?: never;
        }
      | {
          policies: readonly GraphReadPolicy<any, TAuthority>[];
          dispatcher?: never;
          context?: never;
          authority: ExpressGraphReadAuthorityFactory<TAuthority>;
        }
      | {
          dispatcher: GraphReadDispatcher<InvocationContext>;
          context?: never;
          policies?: never;
          authority?: never;
        }
      | {
          dispatcher: GraphReadDispatcher<TAuthority>;
          context: ExpressGraphReadContextFactory<TAuthority>;
          policies?: never;
          authority?: never;
        }
      | {
          dispatcher: GraphReadDispatcher<TAuthority>;
          context?: never;
          policies?: never;
          authority: ExpressGraphReadAuthorityFactory<TAuthority>;
        }
    );

export type OntahiExpressGraphCommandOptions<TAuthority = InvocationContext> = {
  path?: string;
  policies: readonly (
    | RelationshipCommandPolicy
    | ManyToManyRelationshipCommandPolicy
    | EntityMutationCommandPolicy<any>
  )[];
  dispatcher?: GraphCommandDispatcher<TAuthority>;
  context?: ExpressGraphCommandContextFactory<TAuthority>;
  authority?: ExpressGraphCommandAuthorityFactory<TAuthority>;
};

export type OntahiExpressOptions<
  TGraphReadAuthority = InvocationContext,
  TGraphCommandAuthority = InvocationContext,
> = {
  mountPath?: string;
  operationsPath?: string;
  graphRead?: OntahiExpressGraphReadOptions<TGraphReadAuthority>;
  graphCommand?: OntahiExpressGraphCommandOptions<TGraphCommandAuthority>;
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

export const ontahiExpress = <
  TGraphReadAuthority = InvocationContext,
  TGraphCommandAuthority = InvocationContext,
>(
  application: OntahiApplication,
  options: OntahiExpressOptions<TGraphReadAuthority, TGraphCommandAuthority> = {},
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
    const graphReadOptions = options.graphRead;
    const dispatcher = (graphReadOptions.dispatcher ??
      (() => {
        const graphApplication = application as Partial<GraphReadableOntahiApplication>;
        if (!graphApplication.createGraphReadDispatcher) {
          throw new Error(
            'Ontahi Express graph-read policies require an application created with ontahi().',
          );
        }
        return graphApplication.createGraphReadDispatcher(
          graphReadOptions.policies as readonly GraphReadPolicy<any, TGraphReadAuthority>[],
        );
      })()) as GraphReadDispatcher<TGraphReadAuthority>;
    router.post(
      routePath(graphReadOptions.path ?? '/graph/reads'),
      express.json(),
      createExpressGraphReadHandler({
        dispatcher,
        invocationContext: options.invocationContext,
        authority: graphReadOptions.authority,
        context: 'context' in graphReadOptions ? graphReadOptions.context : undefined,
        reportError: options.reportError,
      }),
    );
  }

  if (options.graphCommand) {
    const graphCommandOptions = options.graphCommand;
    const graphApplication = application as Partial<GraphCommandableOntahiApplication>;
    const commandDispatcher =
      graphCommandOptions.dispatcher ??
      graphApplication.createGraphCommandDispatcher?.(graphCommandOptions.policies);
    if (!commandDispatcher) {
      throw new Error(
        'Ontahi Express graph-Command policies require an application created with ontahi().',
      );
    }
    router.post(
      routePath(graphCommandOptions.path ?? '/graph/commands'),
      express.json(),
      createExpressGraphCommandHandler({
        dispatcher: commandDispatcher as GraphCommandDispatcher<TGraphCommandAuthority>,
        invocationContext: options.invocationContext,
        authority: graphCommandOptions.authority,
        context: graphCommandOptions.context,
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
      response.json(
        explorer.buildSnapshot(application, {
          graphCommandPolicies: options.graphCommand?.policies ?? [],
        }),
      ),
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
