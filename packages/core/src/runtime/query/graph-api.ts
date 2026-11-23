import type { InferGraphSchemaClientInput } from '../../computation/schema/client-input.js';
import {
  attachOperationInputSchema,
  type OperationInputSchema,
} from '../../computation/schema/operation-input.js';
import type { PortableOperationConditions } from '../../data-graph/model-expression/index.js';
import {
  isGraphSchemaDefinition,
  toGraphSchemaDescriptor,
  type GraphSchemaDescriptor,
} from '../../data-graph/schema-descriptor.js';
import type { AnyEntityDefinition, EntityRefLocators } from '../../model/entity/definition.js';
import {
  createEntityRef,
  type AnyEntityRef,
  type EntityName,
  type EntityRef,
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
} from '../../model/entity/ref/model.js';
import type {
  DomainOperationBridgeMetadata,
  DomainOperationClientCacheMetadata,
  OperationBridgeBinding,
} from '../../model/operation/client-metadata.js';
import { defineOperationBridgeBinding as definePortableOperationBridgeBinding } from '../../model/operation/client-metadata.js';
import type {
  DomainOperationAuthority,
  DomainOperationGraphOpsMetadata,
  DomainOperationIngressMetadata,
  DomainOperationReceiverDescriptor,
  DurableOperationIdempotencyPolicy,
  DurableOperationMetadata,
  DurableOperationRuntime,
  GraphEntityExposure,
  GraphOperationAuthority,
  HttpIngressMethod,
} from '../../model/operation/definition.js';
import { type DomainOperationExecutionMetadata } from '../../model/operation/execution-policy.js';
import type {
  DomainOperationImplementationMetadata,
  PortableDomainOperationDeclarationMetadata,
  PortableDomainOperationDefaults,
  PortableDomainOperationMetadata,
} from '../../model/operation/metadata.js';
import { definePortableDomainOperationMetadata } from '../../model/operation/metadata.js';
import type { GraphOutputDescriptor } from '../../model/operation/output.js';
import { query } from '../../model/query/query.js';
import { reflectContextualSelections } from '../../model/query/selection/entity-selections.js';
import {
  selection,
  type EntitySelectionFactory,
  type Selection,
  type SelectionBuilder,
} from '../../model/query/selection/selection.js';
import type { SemanticSelection } from '../../model/query/selection-ast.js';
import {
  createRecursiveEntityView,
  type EntityViewShape,
  type InferEntityViewResult,
  type RecursiveEntityViewDefinition,
} from '../../model/query/view.js';
import type { RelationKind } from '../../model/relation/definition.js';
import type { GraphSelectionDefinition } from '../../model/schema/definition.js';
import { hasOwn } from '../../value/object.js';
import type { GraphSchemaLike } from '../../value/schema/definition.js';
import {
  bindEntityRefMutationAuthoring,
  createEntityMutationAuthoring,
  type EntityMutationAuthoring,
  type EntityRefMutationAuthoring,
} from '../data/entity-mutation-authoring.js';
import { resolveDomainOperations, resolveGraphOperations } from '../operation/resolution.js';
import {
  bindEntityRefRelationshipCommands,
  type RelationshipCommandExecutor,
} from '../relation/command.js';

import {
  bindEntityRefOperationProxy,
  bindEntityRefRelationOperations,
  type BoundEntityRefLocators,
} from './entity-ref-binding.js';
import {
  reflectSelectionFactories,
  type SelectionFactoryDescriptor,
} from './selection-factories.js';

export * from '../../model/operation/client-metadata.js';
export * from '../../model/operation/definition.js';
export {
  assertRegisteredDomainOperationReceivers,
  resolveDomainOperations,
  resolveGraphOperations,
  resolveOperationId,
} from '../operation/resolution.js';

export type DomainOperationMetadata<
  TInput = unknown,
  TCache = unknown,
  TResult = unknown,
> = PortableDomainOperationMetadata<TInput, TCache, TResult, PortableOperationConditions>;

export type { DomainOperationImplementationMetadata } from '../../model/operation/metadata.js';

export type DomainOperationDefaults<
  TInput = unknown,
  TCache = unknown,
> = PortableDomainOperationDefaults<TInput, TCache>;

export type DomainOperationDeclarationMetadata<
  TInput = unknown,
  TCache = unknown,
  TResult = unknown,
> = PortableDomainOperationDeclarationMetadata<
  TInput,
  TCache,
  TResult,
  PortableOperationConditions
>;

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

export type { OperationBridgeBinding } from '../../model/operation/client-metadata.js';

export type GraphOperationDeclarations = Record<string, GraphOperationDeclaration<any, any>>;
export type DomainOperationDeclarations = Record<
  string,
  DomainOperationDeclarationMetadata<any, any, any>
>;
export type ClientDomainOperationDeclarations = Record<
  string,
  ClientDomainOperationDeclaration<any, any>
>;

export type { EntityName } from '../../model/entity/ref/model.js';

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
    ? Omit<TOperation, 'receiver'> & {
        entityName: TEntityName;
        name: TName;
        id: `${TEntityName}.${TName}`;
        authority: DomainOperationAuthority;
        exposure: Exclude<GraphEntityExposure, 'browser-direct'>;
        layer: string;
        conditions?: PortableOperationConditions;
        receiver?: DomainOperationReceiverDescriptor;
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
  ? EntityMutationAuthoring<TEntity> &
      EntitySelectionFactory<TEntity> & {
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

type WithClientEntityMutationRefs<TSurface, TEntity> = TEntity extends AnyEntityDefinition
  ? {
      [TKey in keyof TSurface]: TSurface[TKey] extends (...args: infer TArgs) => infer TResult
        ? TResult extends AnyEntityRef
          ? (...args: TArgs) => TResult & EntityRefMutationAuthoring<TEntity>
          : TSurface[TKey]
        : TSurface[TKey];
    }
  : TSurface;

type ClientEntityRefLocatorSurface<
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends ClientDomainOperationDeclarations,
  TRelations extends ClientEntityRelationDeclarations,
> = WithClientEntityMutationRefs<
  BoundEntityRefLocators<
    TEntity,
    ResolveDomainOperations<EntityName<TEntity>, TOperations>,
    TEntity extends AnyEntityDefinition ? EntityRefLocators<TEntity> : {},
    typeof createDomainOperationInvocationFromRef,
    ClientEntityRelationOperations<TRelations>
  >,
  TEntity
>;

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
  graphOps?: DomainOperationGraphOpsMetadata;
  receiver?: DomainOperationReceiverDescriptor;
  execution?: DomainOperationExecutionMetadata;
  conditions?: PortableOperationConditions;
  durable?: DurableOperationMetadata<any, any>;
  implementation?: DomainOperationImplementationMetadata;
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
  selectionFactories?: Readonly<Record<string, SelectionFactoryDescriptor>>;
  contextualSelections?: Readonly<
    Record<
      string,
      import('../../model/query/selection/contextual-factories.js').ContextualSelectionDescriptor
    >
  >;
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
    execution?: DomainOperationExecutionMetadata;
    conditions?: PortableOperationConditions;
    implementation?: DomainOperationImplementationMetadata;
    receiver?: DomainOperationReceiverDescriptor;
    hasBridgeQuery: boolean;
    input?: GraphSchemaDescriptor;
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
): DomainOperationDeclarationMetadata<TInput, TCache> =>
  ({
    ...definePortableDomainOperationMetadata(operation),
  }) as DomainOperationDeclarationMetadata<TInput, TCache>;

export const defineOperationBridgeBinding = <TBinding, TAdapter extends string = string>(
  adapter: TAdapter,
  callable: TBinding,
): OperationBridgeBinding<TBinding, TAdapter> => ({
  ...definePortableOperationBridgeBinding(adapter, callable),
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

type ClientSelectionFactorySurface<TEntity> = TEntity extends { readonly by: infer TBy }
  ? { readonly by: TBy }
  : {};

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
  ClientEntityRefLocatorSurface<TEntity, TOperations, TRelations> &
  ClientSelectionFactorySurface<TEntity> => {
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
          ...('by' in entityOrName && typeof entityOrName.by === 'function'
            ? { by: entityOrName.by }
            : {}),
          ...createEntityMutationAuthoring(entityOrName as AnyEntityDefinition),
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
  const bindMutationCommands = <TRef extends AnyEntityRef>(ref: TRef) =>
    typeof entityOrName === 'object'
      ? bindEntityRefMutationAuthoring(
          ref as unknown as EntityRef<EntityName<TEntity>>,
          entityOrName as AnyEntityDefinition,
        )
      : ref;
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
      bindEntityRefOperationProxy(bindRelationshipCommands(bindMutationCommands(ref)), domain, {
        run: ({ operation, input }) => createDomainOperationInvocationFromRef(operation, input),
      }),
    );
  const bindLocators = <TLocators extends EntityRefLocatorDeclarations>(locators: TLocators) => {
    if (typeof entityOrName === 'object' && 'by' in entityOrName && hasOwn(locators, 'by'))
      throw new TypeError(
        `Legacy locator by on ${entityName} conflicts with Selection factory authoring.`,
      );
    return Object.assign(
      clientEntity,
      Object.fromEntries(
        Object.entries(locators).map(([name, toLocator]) => [
          name,
          (...args: readonly unknown[]) =>
            bindRefRelations(createEntityRef(entityOrName, toLocator(...args))),
        ]),
      ),
    );
  };
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
    ClientEntityRefLocatorSurface<TEntity, TOperations, TRelations> &
    ClientSelectionFactorySurface<TEntity>;
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
        ...(reflectSelectionFactories(entity)
          ? { selectionFactories: reflectSelectionFactories(entity) }
          : {}),
        ...(reflectContextualSelections(entity)
          ? { contextualSelections: reflectContextualSelections(entity) }
          : {}),
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
        ...(operation.execution ? { execution: operation.execution } : {}),
        ...(operation.conditions ? { conditions: operation.conditions } : {}),
        ...(operation.implementation ? { implementation: operation.implementation } : {}),
        ...(operation.receiver ? { receiver: operation.receiver } : {}),
        hasBridgeQuery: Boolean(operation.bridge?.query?.length),
        ...(isGraphSchemaDefinition(operation.input)
          ? { input: toGraphSchemaDescriptor(operation.input) }
          : {}),
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
