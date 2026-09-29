import type {
  EntityMutationCommandPolicy,
  GraphCommandRequest,
  GraphReadDispatchResponse,
  GraphReadPolicy,
  GraphReadRequest,
  ManyToManyRelationshipCommandPolicy,
  OrderedRelationshipCommandPolicy,
  RelationshipCommandPolicy,
} from '../../data-graph/index.js';
import type { ModelCommandRequest } from '../contracts.js';

import type { OntahiApplication } from './application.js';
import {
  createModelCommandRuntime,
  type CreateModelCommandRuntimeOptions,
  type ModelCommandScope,
  type PreparedModelCommandRuntime,
} from './model-command.js';
import type {
  GraphCommandableOntahiApplication,
  GraphReadableOntahiApplication,
} from './ontahi.js';

type ModelGraphCommandPolicy =
  | RelationshipCommandPolicy
  | ManyToManyRelationshipCommandPolicy
  | OrderedRelationshipCommandPolicy
  | EntityMutationCommandPolicy<any>;

export type ApplicationModelScopeAccess = {
  read?: (request: GraphReadRequest, signal: AbortSignal) => Promise<GraphReadDispatchResponse>;
};

export type CreateApplicationModelCommandRuntimeOptions<TAuthority> = Omit<
  CreateModelCommandRuntimeOptions,
  'application' | 'scope' | 'dispatchRead' | 'dispatchCommand'
> & {
  application: OntahiApplication &
    Partial<GraphReadableOntahiApplication & GraphCommandableOntahiApplication>;
  graph: {
    authority: () => TAuthority;
    readPolicies?: readonly GraphReadPolicy<any, TAuthority>[];
    commandPolicies?: readonly ModelGraphCommandPolicy[];
  };
  scope: (
    request: ModelCommandRequest,
    signal: AbortSignal,
    graph: ApplicationModelScopeAccess,
  ) => Promise<ModelCommandScope>;
};

/** Connects model interpretation to an application's policy-aware graph dispatchers. */
export const createApplicationModelCommandRuntime = <TAuthority>({
  application,
  graph,
  scope,
  ...options
}: CreateApplicationModelCommandRuntimeOptions<TAuthority>): PreparedModelCommandRuntime => {
  if (graph.readPolicies && !application.createGraphReadDispatcher)
    throw new Error('Model graph reads require a graph-readable Ontahi application.');
  if (graph.commandPolicies && !application.createGraphCommandDispatcher)
    throw new Error('Model graph commands require a graph-commandable Ontahi application.');
  const readDispatcher = graph.readPolicies
    ? application.createGraphReadDispatcher!<TAuthority>(graph.readPolicies)
    : undefined;
  const commandDispatcher = graph.commandPolicies
    ? application.createGraphCommandDispatcher!<TAuthority>(graph.commandPolicies)
    : undefined;
  const scopeAccess: ApplicationModelScopeAccess = {
    ...(readDispatcher
      ? {
          read: (request: GraphReadRequest, signal: AbortSignal) => {
            signal.throwIfAborted();
            return readDispatcher(request, { authority: graph.authority() });
          },
        }
      : {}),
  };
  const dispatchCommand = commandDispatcher
    ? (request: GraphCommandRequest, signal: AbortSignal) => {
        signal.throwIfAborted();
        return commandDispatcher(request, { authority: graph.authority() });
      }
    : undefined;
  return createModelCommandRuntime({
    ...options,
    application,
    scope: (request, signal) => scope(request, signal, scopeAccess),
    dispatchRead: scopeAccess.read,
    dispatchCommand,
  });
};
