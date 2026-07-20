import type { AnyEntityDefinition, EntityRefLocators, RelationKind } from './definitions.js';
import { getGraphOutputDescriptor, type GraphOutputDescriptor } from './output/index.js';
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
} from './ref.js';

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

export type DurableOperationStepDefinitionLike = {
  id: string;
};

export type DurableOperationIdempotencyMetadata<TInput = unknown> = {
  policy: DurableOperationIdempotencyPolicy;
  key?: (input: TInput) => string | readonly unknown[];
};

export type DurableOperationMetadata<TInput = unknown, TResult = unknown> = {
  runtime: DurableOperationRuntime;
  taskId?: string;
  progress?: unknown;
  finalOutput?: unknown;
  subject?: (input: TInput) => DurableOperationSubject;
  trigger?: DurableOperationTrigger | ((input: TInput) => DurableOperationTrigger);
  source?: DurableOperationTrigger['source'];
  steps?: ReadonlyArray<DurableOperationStepDefinitionLike>;
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
  output?: unknown;
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

export type GraphOperationDeclaration<TInput, TResult> = {
  kind: 'graph-operation';
  authority: GraphOperationAuthority;
  exposure: GraphEntityExposure;
  run: (input: TInput) => TResult;
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

export type EntityName<TEntity extends Pick<AnyEntityDefinition, 'name'> | string> =
  TEntity extends string
    ? TEntity
    : TEntity extends { name: infer TName extends string }
      ? TName
      : never;

export type ResolveGraphOperation<TEntityName extends string, TName extends string, TOperation> =
  TOperation extends GraphOperationDeclaration<infer TInput, infer TResult>
    ? GraphOperationDeclaration<TInput, TResult> & {
        entityName: TEntityName;
        name: TName;
        id: `${TEntityName}.${TName}`;
      }
    : never;

export type ResolveDomainOperation<TEntityName extends string, TName extends string, TOperation> =
  TOperation extends DomainOperationDeclarationMetadata<infer TInput, any, any>
    ? TOperation & {
        entityName: TEntityName;
        name: TName;
        id: `${TEntityName}.${TName}`;
        authority: DomainOperationAuthority;
        exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
        layer: string;
      } & ((input: TInput) => DomainOperationInvocation<TInput>)
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
};

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
  output?: unknown;
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
    Object.entries(operations).map(([name, operation]) => [
      name,
      {
        ...operation,
        entityName,
        name,
        id: resolveOperationId(entityName, name),
      },
    ]),
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
      const authority = operation.authority ?? defaults?.authority ?? 'server';
      const exposure = operation.exposure ?? defaults?.exposure;

      if (!exposure) {
        throw new Error(
          `Domain operation "${resolveOperationId(entityName, name)}" must declare exposure or inherit it from domainOperationDefaults.`,
        );
      }

      const bridge =
        operation.bridge ??
        defaults?.bridge ??
        (exposure === 'bridge' ? ({} satisfies DomainOperationBridgeMetadata<unknown>) : undefined);
      const durable = operation.durable
        ? {
            ...defaults?.durable,
            ...operation.durable,
          }
        : undefined;

      if (durable && !durable.runtime) {
        throw new Error(
          `Durable domain operation "${resolveOperationId(entityName, name)}" must declare durable.runtime or inherit it from domainOperationDefaults.durable.runtime.`,
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
        graphOutput: operation.graphOutput ?? getGraphOutputDescriptor(operation.output),
        ...(defaults?.layer && !('layer' in operation) ? { layer: defaults.layer } : {}),
        ...(bridge ? { bridge } : {}),
        ...(durable ? { durable } : {}),
        entityName,
        id: resolveOperationId(entityName, name),
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

export const defineClientDomainOperation = <
  TOperation extends Omit<ClientDomainOperationDeclaration<any, any>, 'kind'>,
>(
  operation: TOperation,
): TOperation & { kind: 'domain-operation' } => ({
  kind: 'domain-operation',
  ...operation,
});

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
  };
  const entityLocators = hasEntityRefLocators(entityOrName) ? entityOrName.refLocators : {};
  const relations = (config?.relations ?? {}) as TRelations;
  const bindRefRelations = <TRef extends AnyEntityRef>(ref: TRef) =>
    Object.entries(relations).reduce(
      (boundRef, [relationName, relation]) =>
        bindEntityRefRelationOperations(boundRef, relationName, relation.domain, {
          receiver: relation.receiver ?? toReceiverName(relation.sourceName ?? entityName),
          run: ({ operation, input }) => createDomainOperationInvocationFromRef(operation, input),
        }),
      bindEntityRefOperationProxy(ref, domain, {
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
                createEntityRef(entityDefinition, toLocator(...args)),
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
          createEntityRef(entityDefinition, locator),
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
  const entityEntries = Object.entries(definition.entities) as Array<
    [keyof TEntities & string, TEntities[keyof TEntities]]
  >;
  const entityNames = entityEntries.map(([name]) => name);
  const entities = entityEntries.map(([, entity]) => entity);

  const listGraphOperations = () =>
    entities.flatMap(entity =>
      hasGraphOperations(entity)
        ? (Object.values(entity.operations) as unknown as Array<GraphApiGraphOperation<TEntities>>)
        : [],
    );

  const listDomainOperations = () =>
    entities.flatMap(entity =>
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
    entities.filter(entity => hasTaskDefinitions(entity) || hasDurableDomainOperations(entity));

  const listTaskDefinitions = () => {
    const seen = new Set<string>();

    return entityEntries.flatMap(([fallbackName, entity]) => {
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

  return {
    ...definition,
    entityNames,
    listEntities: () => [...entities],
    listDomainEntities: () => entities.filter(hasDomainOperations),
    listGraphOperationEntities: () => entities.filter(hasGraphOperations),
    listTaskEntities,
    getEntity: name => definition.entities[name],
    listGraphOperations,
    listDomainOperations,
    listBridgeDomainOperations,
    listDurableDomainOperations,
    listIngressDomainOperations,
    listHttpIngress,
    listTaskDefinitions,
    getDomainOperation: operationId =>
      listDomainOperations().find(operation => operation.id === operationId),
    getOperation: operationId =>
      listGraphOperations().find(operation => operation.id === operationId) ??
      listDomainOperations().find(operation => operation.id === operationId),
    getTaskDefinition: taskId => listTaskDefinitions().find(task => task.id === taskId),
    describe: () => ({
      entities: entityEntries.map(([name, entity]) => ({
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
};
