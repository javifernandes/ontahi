import type { InferGraphSchemaClientInput } from './client-input.js';
import type {
  AnyEntityDefinition,
  EntityRefLocators,
  GraphSelectionDefinition,
  GraphSchemaLike,
  RelationKind,
} from './definitions.js';
import { attachOperationInputSchema, type OperationInputSchema } from './operation-input.js';
import { getGraphOutputDescriptor, type GraphOutputDescriptor } from './output/index.js';
import { query } from './query.js';
import {
  bindEntityRefOperationProxy,
  bindEntityRefRelationOperations,
  createEntityRef,
  deriveEntityRefInputRefs,
  isEntityRef,
  type AnyEntityRef,
  type BoundEntityRefLocators,
  type EntityRefInputDeclarations,
  readEntityRefQueryInputValue,
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
} from './ref/index.js';
import type { EntityName } from './ref/model.js';
import {
  bindEntityRefRelationshipCommands,
  type RelationshipCommandExecutor,
} from './relationship-command.js';
import { isGraphSchemaDefinition } from './schema-descriptor.js';
import type { SemanticSelection } from './selection-ast.js';
import {
  selection,
  type EntitySelectionFactory,
  type Selection,
  type SelectionBuilder,
} from './selection-value.js';
import {
  createRecursiveEntityView,
  type EntityViewShape,
  type InferEntityViewResult,
  type RecursiveEntityViewDefinition,
} from './view.js';

export type GraphEntityExposure = 'browser-direct' | 'bridge' | 'server-only';
export type GraphOperationAuthority = 'client-safe' | 'server-required';
export type DomainOperationAuthority = 'server';
export type DurableOperationRuntime = string;
export type DurableOperationIdempotencyPolicy =
  | 'allow-concurrent'
  | 'reuse-running'
  | 'skip-if-completed'
  | 'replace-running'
  | 'queue-after-current';

export type QueryKeySegmentContext<TInput> = {
  input: TInput;
  operation: {
    inputRefs?: EntityRefInputDeclarations;
  };
};

export type QueryKeySegment<TInput> =
  | unknown
  | ((input: TInput, context: QueryKeySegmentContext<TInput>) => unknown);

export const queryRef =
  <TInput = Record<string, unknown>>(inputRefName: string): QueryKeySegment<TInput> =>
  (input: TInput, context: QueryKeySegmentContext<TInput>) =>
    readEntityRefQueryInputValue(
      input,
      inputRefName,
      context.operation.inputRefs?.[inputRefName],
    ) ?? null;

export type DomainOperationBridgeMetadata<TInput> = {
  query?: readonly QueryKeySegment<TInput>[];
  invalidate?: readonly (readonly QueryKeySegment<TInput>[])[];
};

export type DomainOperationClientCacheInvalidationContext<TInput, TResult> = {
  input: TInput;
  value: TResult;
  operation: {
    inputRefs?: EntityRefInputDeclarations;
  };
};

export type DomainOperationClientCacheInvalidation<TInput = unknown, TResult = unknown> = (
  context: DomainOperationClientCacheInvalidationContext<TInput, TResult>,
) => AnyEntityRef | readonly AnyEntityRef[] | null | undefined;

export type ClientCacheKeySegmentContext<TInput> = {
  input: TInput;
  operation: {
    inputRefs?: EntityRefInputDeclarations;
  };
  resolveRef?: (ref: AnyEntityRef) => AnyEntityRef;
};

export type ClientCacheKeySegment<TInput> =
  | unknown
  | ((input: TInput, context: ClientCacheKeySegmentContext<TInput>) => unknown);

export const cacheRef =
  <TInput = Record<string, unknown>>(inputRefName: string): ClientCacheKeySegment<TInput> =>
  (input: TInput, context: ClientCacheKeySegmentContext<TInput>) => {
    if (typeof input !== 'object' || input === null) {
      return null;
    }

    const inputRecord = input as Record<string, unknown>;
    const refs = deriveEntityRefInputRefs(input, context.operation.inputRefs) as Record<
      string,
      AnyEntityRef
    >;
    const ref = refs[inputRefName];

    if (ref) {
      return context.resolveRef?.(ref) ?? ref;
    }

    const directRef = inputRecord[inputRefName];

    if (isEntityRef(directRef)) {
      return context.resolveRef?.(directRef) ?? directRef;
    }

    return readEntityRefQueryInputValue(input, inputRefName) ?? null;
  };

export type DomainOperationClientCacheMetadata<TInput = unknown, TResult = unknown> = {
  query?: readonly ClientCacheKeySegment<TInput>[];
  invalidate?: readonly DomainOperationClientCacheInvalidation<TInput, TResult>[];
};

export type OperationInputRefPathStepMetadata = {
  name: string;
  entityName: string;
  sourceField: string;
  locator?: string;
  relation?: string;
  role?: string;
  cardinality?: RelationKind;
  optional?: boolean;
};

export type OperationInputRefPathMetadata = {
  kind: 'relation-path';
  steps: readonly OperationInputRefPathStepMetadata[];
};

export type OperationInputRefLocatorGraphOpsMetadata = {
  path?: OperationInputRefPathMetadata;
};

export type OperationInputRefGraphOpsMetadata = {
  locators?: Record<string, OperationInputRefLocatorGraphOpsMetadata>;
};

export type DomainOperationGraphOpsMetadata = {
  inputRefs?: Record<string, OperationInputRefGraphOpsMetadata>;
};

export type HttpIngressMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpIngressMetadata<TPayload = unknown, TInput = unknown> = {
  kind: 'http';
  method: HttpIngressMethod;
  route: string;
  provider?: string;
  channel?: string;
  body?: TPayload;
  map?: (payload: TPayload) => TInput;
};

export type DomainOperationIngressMetadata<TInput = unknown> = HttpIngressMetadata<any, TInput>;

export type DurableOperationSubject = {
  type: string;
  id: string;
};

export type DurableOperationTrigger = {
  cause: 'user_request' | 'schedule' | 'external_event' | 'internal_task' | 'system';
  actor?: {
    kind: 'user' | 'integration' | 'service' | 'system';
    id?: string;
  };
  ingress?: {
    kind: 'server_action' | 'http' | 'websocket' | 'cron' | 'queue' | 'workflow' | 'cli';
    requestId?: string;
    deliveryId?: string;
    connectionId?: string;
    scheduleId?: string;
    parentRunId?: string;
  };
  source?: {
    provider?: string;
    event?: string;
  };
};

export type DurableOperationStepDefinitionLike<TInput = unknown, TResult = unknown> = {
  id: string;
  input?: GraphSchemaLike<TInput>;
  output?: GraphSchemaLike<TResult>;
};

export type DurableOperationIdempotencyMetadata<TInput = unknown> = {
  policy: DurableOperationIdempotencyPolicy;
  key?: (input: TInput) => string | readonly unknown[];
};

export type DurableOperationMetadata<TInput = unknown, TResult = unknown> = {
  runtime: DurableOperationRuntime;
  taskId?: string;
  progress?: GraphSchemaLike<any>;
  finalOutput?: GraphSchemaLike<TResult>;
  subject?: (input: TInput) => DurableOperationSubject;
  trigger?: DurableOperationTrigger | ((input: TInput) => DurableOperationTrigger);
  source?: DurableOperationTrigger['source'];
  steps?: ReadonlyArray<DurableOperationStepDefinitionLike<any, any>>;
  idempotency?: DurableOperationIdempotencyMetadata<TInput>;
};

export type DurableOperationDefaults = Partial<Pick<DurableOperationMetadata<any, any>, 'runtime'>>;

export type DurableOperationDeclarationMetadata<TInput = unknown, TResult = unknown> = Omit<
  DurableOperationMetadata<TInput, TResult>,
  'runtime'
> &
  Partial<Pick<DurableOperationMetadata<TInput, TResult>, 'runtime'>>;

export type DomainOperationMetadata<TInput = unknown, TCache = unknown, TResult = unknown> = {
  kind: 'domain-operation';
  authority: DomainOperationAuthority;
  exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
  description?: string;
  input?: GraphSchemaLike<TInput>;
  output?: GraphSchemaLike<TResult>;
  graphOutput?: GraphOutputDescriptor;
  bridge?: DomainOperationBridgeMetadata<TInput>;
  clientCache?: DomainOperationClientCacheMetadata<TInput, TResult>;
  ingress?: ReadonlyArray<DomainOperationIngressMetadata<TInput>>;
  inputRefs?: EntityRefInputDeclarations;
  graphOps?: DomainOperationGraphOpsMetadata;
  cache?: TCache;
  durable?: DurableOperationMetadata<TInput, TResult>;
};

export type DomainOperationDefaults<TInput = unknown, TCache = unknown> = Partial<
  Pick<DomainOperationMetadata<TInput, TCache>, 'authority' | 'exposure' | 'bridge'>
> & {
  layer?: string;
  durable?: DurableOperationDefaults;
};

export type DomainOperationDeclarationMetadata<
  TInput = unknown,
  TCache = unknown,
  TResult = unknown,
> = Omit<
  DomainOperationMetadata<TInput, TCache, TResult>,
  'authority' | 'exposure' | 'bridge' | 'durable'
> &
  Partial<
    Pick<DomainOperationMetadata<TInput, TCache, TResult>, 'authority' | 'exposure' | 'bridge'>
  > & {
    ingress?: ReadonlyArray<DomainOperationIngressMetadata<TInput>>;
    durable?: DurableOperationDeclarationMetadata<TInput, TResult>;
  };

export type HydratedGraphOperationInput<TInput> =
  TInput extends SemanticSelection<any, infer TEntity>
    ? TEntity extends AnyEntityDefinition
      ? Selection<TEntity>
      : TInput
    : TInput extends Date
      ? TInput
      : TInput extends (infer TItem)[]
        ? HydratedGraphOperationInput<TItem>[]
        : TInput extends readonly (infer TItem)[]
          ? readonly HydratedGraphOperationInput<TItem>[]
          : TInput extends object
            ? { [TKey in keyof TInput]: HydratedGraphOperationInput<TInput[TKey]> }
            : TInput;

export type GraphOperationDeclaration<TInput, TResult> = {
  kind: 'graph-operation';
  authority: GraphOperationAuthority;
  exposure: GraphEntityExposure;
  input?: GraphSchemaLike<TInput>;
  output?: GraphSchemaLike;
  run: (input: HydratedGraphOperationInput<TInput>) => TResult;
};

export type ClientDomainOperationDeclaration<TInput, TData> = DomainOperationMetadata<
  TInput,
  unknown,
  TData
> & {
  bridge: DomainOperationBridgeMetadata<TInput>;
};

export type DomainOperationInvocation<TInput = unknown, TData = unknown> = {
  kind: 'domain-operation-invocation';
  operation: ResolvedDomainOperationLike;
  operationId: string;
  input: TInput;
  _data?: TData;
};

export type OperationBridgeBinding<TBinding = unknown, TAdapter extends string = string> = {
  adapter: TAdapter;
  callable: TBinding;
};

export type GraphOperationDeclarations = Record<string, GraphOperationDeclaration<any, any>>;
export type DomainOperationDeclarations = Record<
  string,
  DomainOperationDeclarationMetadata<any, any, any>
>;
export type ClientDomainOperationDeclarations = Record<
  string,
  ClientDomainOperationDeclaration<any, any>
>;

export type { EntityName } from './ref/model.js';

export type ResolveGraphOperation<TEntityName extends string, TName extends string, TOperation> =
  TOperation extends GraphOperationDeclaration<infer TInput, infer TResult>
    ? GraphOperationDeclaration<TInput, TResult> & {
        entityName: TEntityName;
        name: TName;
        id: `${TEntityName}.${TName}`;
      }
    : never;

export type ResolveDomainOperation<TEntityName extends string, TName extends string, TOperation> =
  TOperation extends DomainOperationDeclarationMetadata<any, any, any>
    ? TOperation & {
        entityName: TEntityName;
        name: TName;
        id: `${TEntityName}.${TName}`;
        authority: DomainOperationAuthority;
        exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
        layer: string;
      } & ((
          input: InferResolvedOperationInput<TOperation>,
        ) => DomainOperationInvocation<
          InferResolvedOperationInput<TOperation>,
          InferClientOperationOutput<TOperation>
        >)
    : never;

export type ResolveGraphOperations<
  TEntityName extends string,
  TOperations extends GraphOperationDeclarations,
> = {
  [TName in keyof TOperations]: ResolveGraphOperation<
    TEntityName,
    TName & string,
    TOperations[TName]
  >;
};

export type ResolveDomainOperations<
  TEntityName extends string,
  TOperations extends DomainOperationDeclarations,
> = {
  [TName in keyof TOperations]: ResolveDomainOperation<
    TEntityName,
    TName & string,
    TOperations[TName]
  >;
};

export type GraphEntityWithOperations<
  TEntity extends AnyEntityDefinition,
  TBoundEntity,
  TOperations extends GraphOperationDeclarations = {},
  TDomainOperations extends DomainOperationDeclarations = {},
> = GraphEntityWithRefLocators<
  TBoundEntity & {
    entityName: TEntity['name'];
    graph: {
      exposure?: GraphEntityExposure;
    };
    operations: ResolveGraphOperations<TEntity['name'], TOperations>;
    domain: ResolveDomainOperations<TEntity['name'], TDomainOperations>;
  },
  TEntity,
  ResolveDomainOperations<TEntity['name'], TDomainOperations>
>;

export type GraphEntityWithRefLocators<
  TSelf,
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends Record<string, unknown>,
  TResult = unknown,
> = TSelf & {
  locators: <TLocators extends EntityRefLocatorDeclarations>(
    locators: TLocators,
  ) => GraphEntityWithRefLocators<TSelf, TEntity, TOperations, TResult> &
    BoundEntityRefLocators<TEntity, TOperations, TLocators, TResult>;
};

export type ClientEntityWithDomainOperations<
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends ClientDomainOperationDeclarations = {},
> = {
  entityName: EntityName<TEntity>;
  graph: {
    exposure?: GraphEntityExposure;
  };
  domain: ResolveDomainOperations<EntityName<TEntity>, TOperations>;
} & (TEntity extends AnyEntityDefinition
  ? EntitySelectionFactory<TEntity> & {
      definition: TEntity;
      view: <TViewName extends string, const TShape extends EntityViewShape<TEntity>>(
        viewName: TViewName,
        shape: TShape,
      ) => RecursiveEntityViewDefinition<TEntity, TShape>;
    }
  : {});

export type ClientEntityRelationDeclaration<
  TOperations extends Record<string, unknown> = Record<string, unknown>,
> = {
  domain: TOperations;
  receiver?: string;
  sourceName?: string;
};

export type ClientEntityRelationDeclarations = Record<string, ClientEntityRelationDeclaration>;

type ClientEntityRelationOperations<TRelations extends ClientEntityRelationDeclarations> = {
  [TName in keyof TRelations]: TRelations[TName] extends ClientEntityRelationDeclaration<
    infer TOperations
  >
    ? TOperations
    : never;
};

export type GraphRelationWithOperations<
  TSource extends Pick<AnyEntityDefinition, 'name'>,
  TRelationName extends string,
  TTargetName extends string = string,
  TDomainOperations extends DomainOperationDeclarations = {},
> = {
  kind: 'graph-relation';
  name: string;
  entityName: string;
  fields: {};
  relations: {};
  graph: {
    exposure?: GraphEntityExposure;
  };
  relation: {
    source: TSource['name'];
    name: TRelationName;
    cardinality: RelationKind;
    target: TTargetName;
  };
  domain: ResolveDomainOperations<string, TDomainOperations>;
};

type AnyGraphApiEntity = object;

export type GraphApiDefinition<TEntities extends Record<string, AnyGraphApiEntity>> = {
  entities: TEntities;
};

type GraphOperationsOf<TEntity> = TEntity extends {
  operations: infer TOperations extends Record<string, unknown>;
}
  ? TOperations[keyof TOperations]
  : never;

type DomainOperationsOf<TEntity> = TEntity extends {
  domain: infer TOperations extends Record<string, unknown>;
}
  ? TOperations[keyof TOperations]
  : never;

type ResolvedGraphOperationLike = {
  id: string;
  entityName: string;
  name: string;
  authority: GraphOperationAuthority;
  exposure: GraphEntityExposure;
};

type ResolvedDomainOperationLike = {
  id: string;
  entityName: string;
  name: string;
  authority: DomainOperationAuthority;
  exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
  description?: string;
  input?: GraphSchemaLike<any>;
  output?: GraphSchemaLike<any>;
  graphOutput?: GraphOutputDescriptor;
  bridge?: DomainOperationBridgeMetadata<any>;
  clientCache?: DomainOperationClientCacheMetadata<any, any>;
  ingress?: ReadonlyArray<DomainOperationIngressMetadata<any>>;
  inputRefs?: EntityRefInputDeclarations;
  graphOps?: DomainOperationGraphOpsMetadata;
  durable?: DurableOperationMetadata<any, any>;
};

type GraphApiGraphOperation<TEntities extends Record<string, AnyGraphApiEntity>> = {
  [TName in keyof TEntities]: GraphOperationsOf<TEntities[TName]>;
}[keyof TEntities] &
  ResolvedGraphOperationLike;

type GraphApiDomainOperation<TEntities extends Record<string, AnyGraphApiEntity>> = {
  [TName in keyof TEntities]: DomainOperationsOf<TEntities[TName]>;
}[keyof TEntities] &
  ResolvedDomainOperationLike;

type GraphApiEntitySummary = {
  name: string;
  graphExposure?: GraphEntityExposure;
  graphOperationNames: string[];
  domainOperationNames: string[];
  durableOperationNames: string[];
  taskNames: string[];
};

type GraphTaskDefinitionLike = {
  id: string;
};

type GraphTaskDefinitionSummary = {
  id: string;
  entityName: string;
  name: string;
};

type GraphApiDurableOperationSummary = {
  id: string;
  entityName: string;
  name: string;
  runtime: DurableOperationRuntime;
  hasProgress: boolean;
  hasFinalOutput: boolean;
  hasSubject: boolean;
  idempotencyPolicy?: DurableOperationIdempotencyPolicy;
};

type GraphApiIngressSummary = {
  operationId: string;
  entityName: string;
  operationName: string;
  kind: DomainOperationIngressMetadata['kind'];
  method: HttpIngressMethod;
  route: string;
  provider?: string;
  channel?: string;
};

type GraphApiSummary = {
  entities: GraphApiEntitySummary[];
  graphOperations: Array<{
    id: string;
    entityName: string;
    name: string;
    authority: GraphOperationAuthority;
    exposure: GraphEntityExposure;
  }>;
  domainOperations: Array<{
    id: string;
    entityName: string;
    name: string;
    description?: string;
    authority: DomainOperationAuthority;
    exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
    hasBridgeQuery: boolean;
  }>;
  durableOperations: GraphApiDurableOperationSummary[];
  ingress: GraphApiIngressSummary[];
  taskDefinitions: GraphTaskDefinitionSummary[];
};

export type GraphApi<TEntities extends Record<string, AnyGraphApiEntity>> =
  GraphApiDefinition<TEntities> & {
    entityNames: Array<keyof TEntities & string>;
    listEntities: () => Array<TEntities[keyof TEntities]>;
    listDomainEntities: () => Array<TEntities[keyof TEntities]>;
    listGraphOperationEntities: () => Array<TEntities[keyof TEntities]>;
    getEntity: <TName extends keyof TEntities & string>(
      name: TName,
    ) => TEntities[TName] | undefined;
    listGraphOperations: () => Array<GraphApiGraphOperation<TEntities>>;
    listDomainOperations: () => Array<GraphApiDomainOperation<TEntities>>;
    listBridgeDomainOperations: () => Array<GraphApiDomainOperation<TEntities>>;
    listDurableDomainOperations: () => Array<GraphApiDomainOperation<TEntities>>;
    listIngressDomainOperations: () => Array<GraphApiDomainOperation<TEntities>>;
    listHttpIngress: () => GraphApiIngressSummary[];
    listTaskEntities: () => Array<TEntities[keyof TEntities]>;
    listTaskDefinitions: () => GraphTaskDefinitionSummary[];
    getDomainOperation: (operationId: string) => GraphApiDomainOperation<TEntities> | undefined;
    getOperation: (
      operationId: string,
    ) => GraphApiGraphOperation<TEntities> | GraphApiDomainOperation<TEntities> | undefined;
    getTaskDefinition: (taskId: string) => GraphTaskDefinitionSummary | undefined;
    describe: () => GraphApiSummary;
  };

export const resolveOperationId = (entityName: string, operationName: string) =>
  `${entityName}.${operationName}`;

export const resolveGraphOperations = <
  TEntityName extends string,
  TOperations extends GraphOperationDeclarations,
>(
  entityName: TEntityName,
  operations: TOperations,
): ResolveGraphOperations<TEntityName, TOperations> =>
  Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => {
      const operationId = resolveOperationId(entityName, name);

      if (operation.input !== undefined && !isGraphSchemaDefinition(operation.input)) {
        throw new Error(`Graph operation "${operationId}" input must be an Ontahi schema.`);
      }

      if (operation.output !== undefined && !isGraphSchemaDefinition(operation.output)) {
        throw new Error(`Graph operation "${operationId}" output must be an Ontahi schema.`);
      }

      return [
        name,
        {
          ...operation,
          entityName,
          name,
          id: operationId,
        },
      ];
    }),
  ) as ResolveGraphOperations<TEntityName, TOperations>;

export const resolveDomainOperations = <
  TEntityName extends string,
  TOperations extends DomainOperationDeclarations,
>(
  entityName: TEntityName,
  operations: TOperations,
  defaults?: DomainOperationDefaults,
): ResolveDomainOperations<TEntityName, TOperations> =>
  Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => {
      const operationId = resolveOperationId(entityName, name);

      if (operation.input !== undefined && !isGraphSchemaDefinition(operation.input)) {
        throw new Error(`Domain operation "${operationId}" input must be an Ontahi schema.`);
      }

      if (operation.output !== undefined && !isGraphSchemaDefinition(operation.output)) {
        throw new Error(`Domain operation "${operationId}" output must be an Ontahi schema.`);
      }

      const authority = operation.authority ?? defaults?.authority ?? 'server';
      const exposure = operation.exposure ?? defaults?.exposure ?? 'server-only';
      const operationLayer =
        'layer' in operation && typeof operation.layer === 'string'
          ? operation.layer
          : (defaults?.layer ?? entityName);

      const bridge =
        operation.bridge ??
        defaults?.bridge ??
        (exposure === 'bridge' ? ({} satisfies DomainOperationBridgeMetadata<unknown>) : undefined);
      const durable = operation.durable
        ? {
            ...defaults?.durable,
            ...operation.durable,
            ...(operation.durable.finalOutput === undefined && operation.output !== undefined
              ? { finalOutput: operation.output }
              : {}),
          }
        : undefined;

      if (durable && !durable.runtime) {
        throw new Error(
          `Durable domain operation "${operationId}" must declare durable.runtime or inherit it from domainOperationDefaults.durable.runtime.`,
        );
      }

      let resolvedOperation: ResolvedDomainOperationLike &
        ((input: unknown) => DomainOperationInvocation<unknown>);
      const invoke = (input: unknown): DomainOperationInvocation<unknown> => ({
        kind: 'domain-operation-invocation' as const,
        operation: resolvedOperation,
        operationId: resolvedOperation.id,
        input,
      });
      resolvedOperation = invoke as typeof resolvedOperation;
      Object.assign(resolvedOperation, operation, {
        authority,
        exposure,
        layer: operationLayer,
        graphOutput: operation.graphOutput ?? getGraphOutputDescriptor(operation.output),
        ...(bridge ? { bridge } : {}),
        ...(durable ? { durable } : {}),
        entityName,
        id: operationId,
      });
      Object.defineProperty(resolvedOperation, 'name', {
        value: name,
        enumerable: true,
        configurable: true,
      });

      return [name, resolvedOperation];
    }),
  ) as unknown as ResolveDomainOperations<TEntityName, TOperations>;

const hasGraphMetadata = (
  entity: AnyGraphApiEntity,
): entity is AnyGraphApiEntity & {
  graph: { exposure?: GraphEntityExposure };
} => 'graph' in entity;

const hasGraphOperations = (
  entity: AnyGraphApiEntity,
): entity is AnyGraphApiEntity & {
  operations: Record<string, ResolveGraphOperation<string, string, any>>;
} => 'operations' in entity;

const hasDomainOperations = (
  entity: AnyGraphApiEntity,
): entity is AnyGraphApiEntity & {
  domain: Record<string, ResolveDomainOperation<string, string, any>>;
} => 'domain' in entity;

const isDurableDomainOperation = (
  operation: ResolvedDomainOperationLike,
): operation is ResolvedDomainOperationLike & {
  durable: DurableOperationMetadata<any, any>;
} => Boolean(operation.durable);

const hasTaskDefinitions = (
  entity: AnyGraphApiEntity,
): entity is AnyGraphApiEntity & {
  entityName?: string;
  name?: string;
  taskDefinitions: Record<string, GraphTaskDefinitionLike>;
} => 'taskDefinitions' in entity;

const createDomainOperationInvocationFromRef = <TOperation, TInput>(
  operation: TOperation,
  input: TInput,
): TOperation extends (input: TInput) => infer TResult
  ? TResult
  : {
      operation: TOperation;
      input: TInput;
    } =>
  (typeof operation === 'function'
    ? (operation as (input: TInput) => unknown)(input)
    : { operation, input }) as TOperation extends (input: TInput) => infer TResult
    ? TResult
    : {
        operation: TOperation;
        input: TInput;
      };

const getGraphApiEntityName = (fallbackName: string, entity: AnyGraphApiEntity) => {
  const maybeNamedEntity = entity as { entityName?: unknown; name?: unknown };

  return typeof maybeNamedEntity.entityName === 'string'
    ? maybeNamedEntity.entityName
    : typeof maybeNamedEntity.name === 'string'
      ? maybeNamedEntity.name
      : fallbackName;
};

const hasEntityRefLocators = (
  entityOrName: Pick<AnyEntityDefinition, 'name'> | string,
): entityOrName is Pick<AnyEntityDefinition, 'name' | 'refLocators'> =>
  typeof entityOrName === 'object' &&
  entityOrName !== null &&
  'refLocators' in entityOrName &&
  typeof entityOrName.refLocators === 'object' &&
  entityOrName.refLocators !== null;

const toReceiverName = (entityName: string) =>
  entityName.length > 0 ? `${entityName[0]?.toLowerCase()}${entityName.slice(1)}` : entityName;

export const defineGraphOperation = <TInput, TResult>(
  operation: Omit<GraphOperationDeclaration<TInput, TResult>, 'kind'>,
): GraphOperationDeclaration<TInput, TResult> => ({
  kind: 'graph-operation',
  ...operation,
});

export const defineDomainOperationMetadata = <TInput, TCache = unknown>(
  operation: Omit<DomainOperationDeclarationMetadata<TInput, TCache>, 'kind'>,
): DomainOperationDeclarationMetadata<TInput, TCache> => ({
  kind: 'domain-operation',
  authority: 'server',
  ...operation,
});

export const defineOperationBridgeBinding = <TBinding, TAdapter extends string = string>(
  adapter: TAdapter,
  callable: TBinding,
): OperationBridgeBinding<TBinding, TAdapter> => ({
  adapter,
  callable,
});

type InferClientOperationInput<TOperation> = TOperation extends {
  input: infer TSchema extends GraphSchemaLike;
}
  ? InferGraphSchemaClientInput<TSchema>
  : TOperation extends { durable: { subject: (input: infer TInput, ...args: any[]) => unknown } }
    ? TInput
    : TOperation extends { bridge: { query: readonly (infer TSegment)[] } }
      ? [TSegment] extends [never]
        ? void
        : TSegment extends (input: infer TInput, ...args: any[]) => unknown
          ? TInput
          : void
      : TOperation extends { bridge: DomainOperationBridgeMetadata<infer TInput> }
        ? unknown extends TInput
          ? unknown
          : TInput
        : unknown;

type InferClientOperationOutput<TOperation> = TOperation extends {
  __clientTypes?: { output: infer TOutput };
}
  ? TOutput
  : TOperation extends DomainOperationDeclarationMetadata<any, any, infer TResult>
    ? TResult
    : unknown;

type InferResolvedOperationInput<TOperation> = TOperation extends {
  __clientTypes?: { input: infer TInput };
}
  ? TInput
  : TOperation extends DomainOperationDeclarationMetadata<infer TInput, any, any>
    ? TInput
    : unknown;

type DefinedClientDomainOperation<TOperation> = TOperation & {
  kind: 'domain-operation';
} & (TOperation extends { durable: object }
    ? {}
    : TOperation extends {
          output: GraphSelectionDefinition<infer TEntity, infer TCardinality>;
        }
      ? {
          as: <
            TView extends RecursiveEntityViewDefinition<TEntity, any, any>,
            TResolved extends TOperation & { id: string; entityName: string; name: string },
          >(
            this: TResolved,
            view: TView,
          ) => Omit<TResolved, 'output' | '__clientTypes'> & {
            kind: 'domain-operation';
            view: TView['ast'];
            output: GraphSchemaLike<
              TCardinality extends 'one'
                ? InferEntityViewResult<TView> | null
                : InferEntityViewResult<TView>[]
            >;
            __clientTypes?: {
              input: InferClientOperationInput<TOperation>;
              output: TCardinality extends 'one'
                ? InferEntityViewResult<TView> | null
                : InferEntityViewResult<TView>[];
            };
          };
        }
      : {}) &
  (TOperation extends { input: GraphSchemaLike }
    ? {
        input: OperationInputSchema<TOperation['input'], InferClientOperationInput<TOperation>>;
        __clientTypes?: {
          input: InferClientOperationInput<TOperation>;
          output: TOperation extends { output: GraphSchemaLike<infer TOutput> } ? TOutput : unknown;
        };
      }
    : {});

export const defineClientDomainOperation = <
  TOperation extends Omit<ClientDomainOperationDeclaration<any, any>, 'kind'>,
>(
  operation: TOperation,
): DefinedClientDomainOperation<TOperation> =>
  (operation => {
    const defined = {
      kind: 'domain-operation',
      ...operation,
      ...(operation.input ? { input: attachOperationInputSchema(operation.input) } : {}),
    } as Record<string, unknown>;

    if (operation.output?.kind === 'schema.selection' && !operation.durable) {
      defined.as = function (
        this: Record<string, unknown>,
        view: RecursiveEntityViewDefinition<any, any, any>,
      ) {
        return {
          ...this,
          view: view.toJSON(),
        };
      };
    }

    return defined;
  })(operation) as DefinedClientDomainOperation<TOperation>;

export const defineDomainOperationsForEntity = <
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends DomainOperationDeclarations,
>(
  entityOrName: TEntity,
  operations: TOperations,
  defaults?: DomainOperationDefaults,
): ResolveDomainOperations<EntityName<TEntity>, TOperations> =>
  resolveDomainOperations(
    typeof entityOrName === 'string' ? entityOrName : entityOrName.name,
    operations,
    defaults,
  ) as ResolveDomainOperations<EntityName<TEntity>, TOperations>;

export const defineClientDomainOperationsForEntity = <
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends ClientDomainOperationDeclarations,
>(
  entityOrName: TEntity,
  operations: TOperations,
): ResolveDomainOperations<EntityName<TEntity>, TOperations> =>
  resolveDomainOperations(
    typeof entityOrName === 'string' ? entityOrName : entityOrName.name,
    operations,
  ) as ResolveDomainOperations<EntityName<TEntity>, TOperations>;

export const defineClientEntity = <
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends ClientDomainOperationDeclarations = {},
  TRelations extends ClientEntityRelationDeclarations = {},
>(
  entityOrName: TEntity,
  config?: {
    exposure?: GraphEntityExposure;
    domainOperationDefaults?: DomainOperationDefaults;
    domainOperations?: TOperations;
    relations?: TRelations;
  },
): ClientEntityWithDomainOperations<TEntity, TOperations> &
  BoundEntityRefLocators<
    TEntity,
    ResolveDomainOperations<EntityName<TEntity>, TOperations>,
    TEntity extends AnyEntityDefinition ? EntityRefLocators<TEntity> : {},
    typeof createDomainOperationInvocationFromRef,
    ClientEntityRelationOperations<TRelations>
  > => {
  const entityName = typeof entityOrName === 'string' ? entityOrName : entityOrName.name;
  const domain = resolveDomainOperations(
    entityName,
    config?.domainOperations ?? {},
    config?.domainOperationDefaults,
  ) as ResolveDomainOperations<EntityName<TEntity>, TOperations>;
  const clientEntity = {
    entityName: entityName as EntityName<TEntity>,
    graph: {
      exposure: config?.exposure,
    },
    domain,
    ...(typeof entityOrName === 'object' && 'fields' in entityOrName
      ? {
          definition: entityOrName,
          all: () => query(entityOrName as AnyEntityDefinition),
          where: (build: SelectionBuilder<AnyEntityDefinition>) =>
            query(entityOrName as AnyEntityDefinition).where(build),
          selection: (build: SelectionBuilder<AnyEntityDefinition>) =>
            selection(entityOrName as AnyEntityDefinition, build),
          view: (name: string, shape: EntityViewShape<AnyEntityDefinition>) =>
            createRecursiveEntityView(entityOrName as AnyEntityDefinition, name, shape),
        }
      : {}),
  };
  const entityLocators = hasEntityRefLocators(entityOrName) ? entityOrName.refLocators : {};
  const relations = (config?.relations ?? {}) as TRelations;
  const bindRelationshipCommands = <TRef extends AnyEntityRef>(ref: TRef) =>
    typeof entityOrName === 'object' && 'relations' in entityOrName
      ? bindEntityRefRelationshipCommands(ref, entityOrName as AnyEntityDefinition)
      : ref;
  const bindRefRelations = <TRef extends AnyEntityRef>(ref: TRef) =>
    Object.entries(relations).reduce(
      (boundRef, [relationName, relation]) =>
        bindEntityRefRelationOperations(boundRef, relationName, relation.domain, {
          receiver: relation.receiver ?? toReceiverName(relation.sourceName ?? entityName),
          run: ({ operation, input }) => createDomainOperationInvocationFromRef(operation, input),
        }),
      bindEntityRefOperationProxy(bindRelationshipCommands(ref), domain, {
        run: ({ operation, input }) => createDomainOperationInvocationFromRef(operation, input),
      }),
    );
  const bindLocators = <TLocators extends EntityRefLocatorDeclarations>(locators: TLocators) =>
    Object.assign(
      clientEntity,
      Object.fromEntries(
        Object.entries(locators).map(([name, toLocator]) => [
          name,
          (...args: readonly unknown[]) =>
            bindRefRelations(createEntityRef(entityOrName, toLocator(...args))),
        ]),
      ),
    );
  const clientEntityWithLocatorApi = Object.assign(clientEntity, {
    ref: <TLocator extends EntityRefLocator>(locator: TLocator) =>
      bindRefRelations(createEntityRef(entityOrName, locator)),
    locators: bindLocators,
  });

  return (
    Object.keys(entityLocators).length > 0
      ? clientEntityWithLocatorApi.locators(entityLocators)
      : clientEntityWithLocatorApi
  ) as ClientEntityWithDomainOperations<TEntity, TOperations> &
    BoundEntityRefLocators<
      TEntity,
      ResolveDomainOperations<EntityName<TEntity>, TOperations>,
      TEntity extends AnyEntityDefinition ? EntityRefLocators<TEntity> : {},
      typeof createDomainOperationInvocationFromRef,
      ClientEntityRelationOperations<TRelations>
    >;
};

const toPascalCase = (value: string) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');

export const defineGraphRelation = <
  TSource extends AnyEntityDefinition,
  TRelationName extends string,
  TTarget extends Pick<AnyEntityDefinition, 'name'> = AnyEntityDefinition,
  TDomainOperations extends DomainOperationDeclarations = {},
>(
  source: TSource,
  relationName: TRelationName,
  config: {
    entityName?: string;
    cardinality?: RelationKind;
    target?: TTarget;
    exposure?: GraphEntityExposure;
    domainOperationDefaults?: DomainOperationDefaults;
    domainOperations?: TDomainOperations;
  },
): GraphRelationWithOperations<
  TSource,
  TRelationName,
  TTarget extends Pick<AnyEntityDefinition, 'name'> ? TTarget['name'] : string,
  TDomainOperations
> => {
  const reflectedRelation = source.relations[relationName];
  const cardinality = config.cardinality ?? reflectedRelation?.relationKind;
  const target = config.target ?? reflectedRelation?.target;
  const entityName = config.entityName ?? `${source.name}${toPascalCase(relationName)}`;

  if (!cardinality || !target) {
    throw new Error(
      `Graph relation ${entityName} must declare cardinality and target or reference an existing relation on ${source.name}.${relationName}.`,
    );
  }

  return {
    kind: 'graph-relation',
    name: entityName,
    entityName,
    fields: {},
    relations: {},
    graph: {
      exposure: config.exposure,
    },
    relation: {
      source: source.name,
      name: relationName,
      cardinality,
      target: target.name,
    },
    domain: resolveDomainOperations(
      entityName,
      config.domainOperations ?? {},
      config.domainOperationDefaults,
    ) as ResolveDomainOperations<string, TDomainOperations>,
  };
};

type BindSelectionEntity = <TEntity extends AnyEntityDefinition>(entity: TEntity) => object;

type BoundEntityFor<
  TBindSelectionEntity extends BindSelectionEntity,
  TEntity extends AnyEntityDefinition,
> = TBindSelectionEntity extends (entity: TEntity) => infer TBoundEntity ? TBoundEntity : never;

export const createGraphEntityFactory =
  <TBindSelectionEntity extends BindSelectionEntity>(input: {
    bindSelectionEntity: TBindSelectionEntity;
    relationshipCommandExecutor?: RelationshipCommandExecutor<any, any, any>;
  }) =>
  <
    TEntity extends AnyEntityDefinition,
    TOperations extends GraphOperationDeclarations = {},
    TDomainOperations extends DomainOperationDeclarations = {},
    TLocators extends EntityRefLocatorDeclarations = {},
  >(
    entityDefinition: TEntity,
    config?: {
      exposure?: GraphEntityExposure;
      domainOperationDefaults?: DomainOperationDefaults;
      operations?:
        | TOperations
        | ((entity: BoundEntityFor<TBindSelectionEntity, TEntity>) => TOperations);
      domainOperations?: TDomainOperations;
      locators?: TLocators;
    },
  ): GraphEntityWithOperations<
    TEntity,
    BoundEntityFor<TBindSelectionEntity, TEntity>,
    TOperations,
    TDomainOperations
  > &
    BoundEntityRefLocators<
      TEntity,
      ResolveDomainOperations<TEntity['name'], TDomainOperations>,
      EntityRefLocators<TEntity> & TLocators,
      unknown
    > => {
    const entity = input.bindSelectionEntity(entityDefinition) as BoundEntityFor<
      TBindSelectionEntity,
      TEntity
    >;
    const operationDeclarations =
      typeof config?.operations === 'function'
        ? config.operations(entity)
        : (config?.operations ?? {});
    const domain = resolveDomainOperations(
      entityDefinition.name,
      config?.domainOperations ?? {},
      config?.domainOperationDefaults,
    );
    const graphEntity = Object.assign(entity, {
      entityName: entityDefinition.name,
      graph: {
        exposure: config?.exposure,
      },
      operations: resolveGraphOperations(entityDefinition.name, operationDeclarations),
      domain,
    });
    const bindLocators = <TLocators extends EntityRefLocatorDeclarations>(locators: TLocators) =>
      Object.assign(
        graphEntity,
        Object.fromEntries(
          Object.entries(locators).map(([name, toLocator]) => [
            name,
            (...args: readonly unknown[]) =>
              bindEntityRefOperationProxy(
                bindEntityRefRelationshipCommands(
                  createEntityRef(entityDefinition, toLocator(...args)),
                  entityDefinition,
                  input.relationshipCommandExecutor,
                ),
                graphEntity.domain,
                {
                  run: ({ operation, input: operationInput }) =>
                    createDomainOperationInvocationFromRef(operation, operationInput),
                },
              ),
          ]),
        ),
      );

    const graphEntityWithLocatorApi = Object.assign(graphEntity, {
      ref: <TLocator extends EntityRefLocator>(locator: TLocator) =>
        bindEntityRefOperationProxy(
          bindEntityRefRelationshipCommands(
            createEntityRef(entityDefinition, locator),
            entityDefinition,
            input.relationshipCommandExecutor,
          ),
          graphEntity.domain,
          {
            run: ({ operation, input: operationInput }) =>
              createDomainOperationInvocationFromRef(operation, operationInput),
          },
        ),
      locators: bindLocators,
    });

    const locators = {
      ...entityDefinition.refLocators,
      ...(config?.locators ?? {}),
    } as EntityRefLocators<TEntity> & TLocators;

    return (
      Object.keys(locators).length > 0
        ? graphEntityWithLocatorApi.locators(locators)
        : graphEntityWithLocatorApi
    ) as GraphEntityWithOperations<
      TEntity,
      BoundEntityFor<TBindSelectionEntity, TEntity>,
      TOperations,
      TDomainOperations
    > &
      BoundEntityRefLocators<
        TEntity,
        ResolveDomainOperations<TEntity['name'], TDomainOperations>,
        EntityRefLocators<TEntity> & TLocators,
        unknown
      >;
  };

export const defineGraphApi = <TEntities extends Record<string, AnyGraphApiEntity>>(
  definition: GraphApiDefinition<TEntities>,
): GraphApi<TEntities> => {
  const getEntityEntries = () =>
    Object.entries(definition.entities) as Array<
      [keyof TEntities & string, TEntities[keyof TEntities]]
    >;
  const getEntities = () => getEntityEntries().map(([, entity]) => entity);

  const listGraphOperations = () =>
    getEntities().flatMap(entity =>
      hasGraphOperations(entity)
        ? (Object.values(entity.operations) as unknown as Array<GraphApiGraphOperation<TEntities>>)
        : [],
    );

  const listDomainOperations = () =>
    getEntities().flatMap(entity =>
      hasDomainOperations(entity)
        ? (Object.values(entity.domain) as unknown as Array<GraphApiDomainOperation<TEntities>>)
        : [],
    );

  const listBridgeDomainOperations = () =>
    listDomainOperations().filter(operation => operation.exposure === 'bridge');

  const listDurableDomainOperations = () => listDomainOperations().filter(isDurableDomainOperation);

  const listIngressDomainOperations = () =>
    listDomainOperations().filter(operation => Boolean(operation.ingress?.length));

  const listHttpIngress = (): GraphApiIngressSummary[] =>
    listIngressDomainOperations().flatMap(operation =>
      (operation.ingress ?? []).map(ingress => ({
        operationId: operation.id,
        entityName: operation.entityName,
        operationName: operation.name,
        kind: ingress.kind,
        method: ingress.method,
        route: ingress.route,
        ...(ingress.provider ? { provider: ingress.provider } : {}),
        ...(ingress.channel ? { channel: ingress.channel } : {}),
      })),
    );

  const hasDurableDomainOperations = (entity: AnyGraphApiEntity) =>
    hasDomainOperations(entity) && Object.values(entity.domain).some(isDurableDomainOperation);

  const listTaskEntities = () =>
    getEntities().filter(
      entity => hasTaskDefinitions(entity) || hasDurableDomainOperations(entity),
    );

  const listTaskDefinitions = () => {
    const seen = new Set<string>();

    return getEntityEntries().flatMap(([fallbackName, entity]) => {
      const entityName = getGraphApiEntityName(fallbackName, entity);
      const explicitTasks = hasTaskDefinitions(entity)
        ? Object.entries(entity.taskDefinitions).map(([name, task]) => ({
            id: task.id,
            entityName,
            name,
          }))
        : [];
      const durableTasks = hasDomainOperations(entity)
        ? Object.values(entity.domain)
            .filter(isDurableDomainOperation)
            .map(operation => ({
              id: operation.durable.taskId ?? operation.id,
              entityName,
              name: operation.name,
            }))
        : [];

      return [...explicitTasks, ...durableTasks].filter(task => {
        const key = `${task.entityName}:${task.id}:${task.name}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    });
  };

  const api = {
    ...definition,
    listEntities: () => getEntities(),
    listDomainEntities: () => getEntities().filter(hasDomainOperations),
    listGraphOperationEntities: () => getEntities().filter(hasGraphOperations),
    listTaskEntities,
    getEntity: (name: keyof TEntities & string) => definition.entities[name],
    listGraphOperations,
    listDomainOperations,
    listBridgeDomainOperations,
    listDurableDomainOperations,
    listIngressDomainOperations,
    listHttpIngress,
    listTaskDefinitions,
    getDomainOperation: (operationId: string) =>
      listDomainOperations().find(operation => operation.id === operationId),
    getOperation: (operationId: string) =>
      listGraphOperations().find(operation => operation.id === operationId) ??
      listDomainOperations().find(operation => operation.id === operationId),
    getTaskDefinition: (taskId: string) => listTaskDefinitions().find(task => task.id === taskId),
    describe: () => ({
      entities: getEntityEntries().map(([name, entity]) => ({
        name,
        graphExposure: hasGraphMetadata(entity) ? entity.graph.exposure : undefined,
        graphOperationNames: hasGraphOperations(entity) ? Object.keys(entity.operations) : [],
        domainOperationNames: hasDomainOperations(entity) ? Object.keys(entity.domain) : [],
        durableOperationNames: hasDomainOperations(entity)
          ? Object.values(entity.domain)
              .filter(isDurableDomainOperation)
              .map(operation => operation.name)
          : [],
        taskNames: listTaskDefinitions()
          .filter(task => task.entityName === getGraphApiEntityName(name, entity))
          .map(task => task.name),
      })),
      graphOperations: listGraphOperations().map(operation => ({
        id: operation.id,
        entityName: operation.entityName,
        name: operation.name,
        authority: operation.authority,
        exposure: operation.exposure,
      })),
      domainOperations: listDomainOperations().map(operation => ({
        id: operation.id,
        entityName: operation.entityName,
        name: operation.name,
        description: operation.description,
        authority: operation.authority,
        exposure: operation.exposure,
        hasBridgeQuery: Boolean(operation.bridge?.query?.length),
      })),
      durableOperations: listDurableDomainOperations().map(operation => {
        const durable = operation.durable as DurableOperationMetadata<any, any>;

        return {
          id: operation.id,
          entityName: operation.entityName,
          name: operation.name,
          runtime: durable.runtime,
          hasProgress: 'progress' in durable,
          hasFinalOutput: 'finalOutput' in durable,
          hasSubject: Boolean(durable.subject),
          idempotencyPolicy: durable.idempotency?.policy,
        };
      }),
      ingress: listHttpIngress(),
      taskDefinitions: listTaskDefinitions(),
    }),
  };

  Object.defineProperty(api, 'entityNames', {
    enumerable: true,
    get: () => getEntityEntries().map(([name]) => name),
  });

  return api as GraphApi<TEntities>;
};
