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
import { createModelEntityMutationExposure } from './model-entity-mutation.js';
import type { ModelGraphCommandExposure } from './model-graph-command.js';
import { createModelGraphReadExposure } from './model-graph-read-exposure.js';
import type { ModelGraphReadExposure } from './model-graph-read.js';
import type {
  GraphCommandableOntahiApplication,
  GraphReadableOntahiApplication,
} from './ontahi.js';

type ModelGraphCommandPolicy =
  | RelationshipCommandPolicy
  | ManyToManyRelationshipCommandPolicy
  | OrderedRelationshipCommandPolicy
  | EntityMutationCommandPolicy<any>;

type OneOrMany<T> = T | readonly T[];

export type ApplicationModelScope<TData = undefined> = Omit<
  ModelCommandScope,
  'reads' | 'commands'
> & {
  /** Receiver-local data used to build the scoped catalog; it is never sent to the Model. */
  data: TData;
  reads?: readonly ModelGraphReadExposure[];
  commands?: readonly ModelGraphCommandExposure[];
};

export type ApplicationModelGraphAffordanceContext<TData> = {
  request: ModelCommandRequest;
  data: TData;
};

type ApplicationModelGraphReadExposureFactory<TAuthority, TData> = {
  policies: OneOrMany<GraphReadPolicy<any, TAuthority>>;
  expose: (
    context: ApplicationModelGraphAffordanceContext<TData>,
  ) => ModelGraphReadExposure | readonly ModelGraphReadExposure[];
};

type ApplicationModelGraphCommandExposureFactory<TData> = {
  policies: OneOrMany<ModelGraphCommandPolicy>;
  expose: (
    context: ApplicationModelGraphAffordanceContext<TData>,
  ) => ModelGraphCommandExposure | readonly ModelGraphCommandExposure[];
};

export type ApplicationModelGraphReadAffordance<TAuthority, TData> =
  | GraphReadPolicy<any, TAuthority>
  | ApplicationModelGraphReadExposureFactory<TAuthority, TData>;

export type ApplicationModelGraphCommandAffordance<TData> =
  | EntityMutationCommandPolicy<any, any>
  | ApplicationModelGraphCommandExposureFactory<TData>;

export type ApplicationModelScopeAccess = {
  read?: (request: GraphReadRequest, signal: AbortSignal) => Promise<GraphReadDispatchResponse>;
};

export type CreateApplicationModelCommandRuntimeOptions<TAuthority, TData = undefined> = Omit<
  CreateModelCommandRuntimeOptions,
  'application' | 'scope' | 'dispatchRead' | 'dispatchCommand'
> & {
  application: OntahiApplication &
    Partial<GraphReadableOntahiApplication & GraphCommandableOntahiApplication>;
  graph: {
    authority: () => TAuthority;
    reads?: readonly ApplicationModelGraphReadAffordance<TAuthority, TData>[];
    commands?: readonly ApplicationModelGraphCommandAffordance<TData>[];
    /** @deprecated Register policies directly or with a scoped exposure factory in `reads`. */
    readPolicies?: readonly GraphReadPolicy<any, TAuthority>[];
    /** @deprecated Register policies directly or with a scoped exposure factory in `commands`. */
    commandPolicies?: readonly ModelGraphCommandPolicy[];
  };
  scope?: (
    request: ModelCommandRequest,
    signal: AbortSignal,
    graph: ApplicationModelScopeAccess,
  ) => Promise<ModelCommandScope | ApplicationModelScope<TData>>;
};

const many = <T>(value: OneOrMany<T>): readonly T[] =>
  Array.isArray(value) ? (value as readonly T[]) : [value as T];

const exposures = <T>(value: T | readonly T[]): readonly T[] =>
  Array.isArray(value) ? (value as readonly T[]) : [value as T];

const isExposureFactory = <T extends { policies: unknown }>(value: unknown): value is T =>
  typeof value === 'object' && value !== null && 'policies' in value;

const entityLabel = (name: string) => name.replaceAll(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase();

const defaultReadExposures = (
  policy: GraphReadPolicy<any, any>,
): readonly ModelGraphReadExposure[] => {
  const label = entityLabel(policy.entity.name);
  const equals = Object.entries(policy.fields)
    .filter(([, field]) => field?.filter?.includes('eq'))
    .map(([fieldName]) => fieldName);
  const orderBy = Object.entries(policy.fields)
    .filter(([, field]) => field?.order)
    .map(([fieldName]) => fieldName);
  const message = ({ value }: { value: unknown }) => {
    const count = typeof value === 'number' ? value : Array.isArray(value) ? value.length : 0;
    return `${count} ${label} record${count === 1 ? '' : 's'}.`;
  };
  return policy.modes.flatMap(mode => {
    if (mode !== 'run' && mode !== 'count') return [];
    return [
      createModelGraphReadExposure(policy, {
        mode,
        equals,
        orderBy,
        ...(mode === 'run' ? { limit: policy.maxLimit } : {}),
        description: `${mode === 'run' ? 'List' : 'Count'} ${label} records.`,
        message,
      }),
    ];
  });
};

const defaultCommandExposures = (
  policy: EntityMutationCommandPolicy<any, any>,
): readonly ModelGraphCommandExposure[] => {
  const label = entityLabel(policy.entity.name);
  return (['create', 'update', 'delete'] as const).flatMap(action => {
    const actionPolicy = policy.actions[action];
    if (!actionPolicy) return [];
    const description = `${action === 'create' ? 'Create' : action === 'update' ? 'Update' : 'Delete'} a ${label}.`;
    const message = () =>
      `${label.charAt(0).toUpperCase()}${label.slice(1)} ${action === 'create' ? 'created' : action === 'update' ? 'updated' : 'deleted'}.`;
    if (action === 'create') {
      const create = policy.actions.create!;
      return [
        createModelEntityMutationExposure(policy, {
          action,
          values: create.fields,
          description,
          message,
        }),
      ];
    }
    if (action === 'update') {
      const update = policy.actions.update!;
      return [
        createModelEntityMutationExposure(policy, {
          action,
          values: update.fields,
          ...(update.if?.length ? { condition: update.if } : {}),
          description,
          message,
        }),
      ];
    }
    const remove = policy.actions.delete!;
    return [
      createModelEntityMutationExposure(policy, {
        action,
        ...(remove.if?.length ? { condition: remove.if } : {}),
        description,
        message,
      }),
    ];
  });
};

const hasScopeData = <TData>(
  scope: ModelCommandScope | ApplicationModelScope<TData>,
): scope is ApplicationModelScope<TData> => 'data' in scope;

const withoutScopeData = <TData>({
  data: _data,
  ...scope
}: ApplicationModelScope<TData>): ModelCommandScope => scope;

/** Connects model interpretation to an application's policy-aware graph dispatchers. */
export const createApplicationModelCommandRuntime = <TAuthority, TData = undefined>({
  application,
  graph,
  scope,
  ...options
}: CreateApplicationModelCommandRuntimeOptions<TAuthority, TData>): PreparedModelCommandRuntime => {
  const readsConfigured = graph.readPolicies !== undefined || graph.reads !== undefined;
  const commandsConfigured = graph.commandPolicies !== undefined || graph.commands !== undefined;
  const readPolicies = [
    ...(graph.readPolicies ?? []),
    ...(graph.reads?.flatMap(affordance =>
      isExposureFactory<ApplicationModelGraphReadExposureFactory<TAuthority, TData>>(affordance)
        ? many(affordance.policies)
        : [affordance],
    ) ?? []),
  ];
  const commandPolicies = [
    ...(graph.commandPolicies ?? []),
    ...(graph.commands?.flatMap(affordance =>
      isExposureFactory<ApplicationModelGraphCommandExposureFactory<TData>>(affordance)
        ? many(affordance.policies)
        : [affordance],
    ) ?? []),
  ];
  if (readsConfigured && !application.createGraphReadDispatcher)
    throw new Error('Model graph reads require a graph-readable Ontahi application.');
  if (commandsConfigured && !application.createGraphCommandDispatcher)
    throw new Error('Model graph commands require a graph-commandable Ontahi application.');
  const readDispatcher =
    readPolicies.length > 0
      ? application.createGraphReadDispatcher!<TAuthority>(readPolicies)
      : undefined;
  const commandDispatcher =
    commandPolicies.length > 0
      ? application.createGraphCommandDispatcher!<TAuthority>(commandPolicies)
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
    scope: async (request, signal) => {
      const current = scope
        ? await scope(request, signal, scopeAccess)
        : ({ data: undefined as TData } satisfies ApplicationModelScope<TData>);
      if (!graph.reads && !graph.commands) return current;
      const scoped = hasScopeData(current);
      const data = scoped ? (current as ApplicationModelScope<TData>).data : (undefined as TData);
      const modelScope = scoped ? withoutScopeData(current) : current;
      const context = { request, data };
      return {
        ...modelScope,
        reads: [
          ...(modelScope.reads ?? []),
          ...(graph.reads?.flatMap(affordance =>
            isExposureFactory<ApplicationModelGraphReadExposureFactory<TAuthority, TData>>(
              affordance,
            )
              ? exposures(affordance.expose(context))
              : defaultReadExposures(affordance),
          ) ?? []),
        ],
        commands: [
          ...(modelScope.commands ?? []),
          ...(graph.commands?.flatMap(affordance =>
            isExposureFactory<ApplicationModelGraphCommandExposureFactory<TData>>(affordance)
              ? exposures(affordance.expose(context))
              : defaultCommandExposures(affordance),
          ) ?? []),
        ],
      };
    },
    dispatchRead: scopeAccess.read,
    dispatchCommand,
  });
};
