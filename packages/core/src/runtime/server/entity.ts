import {
  entity as defineEntitySchema,
  type AnyEntityDefinition,
  type BoundEntityRefLocators,
  type DomainOperationDefaults,
  type DomainOperationDeclarations,
  type DataGraphExecutionRuntime,
  type AnyFieldDefinition,
  type EffectiveEntityLocatorDeclarations,
  type EntityDisplayMetadata,
  type EntityDefinition,
  type EntityFreshnessMetadata,
  type EntityLocatorDeclarations,
  type RelationDefinition,
  type RelationKind,
  type EntityRefLocatorFactories,
  type EntityRefLocators,
  type EntityRefInputPublicInput,
  type EntitySelectionFactory,
  type GraphEntityWithOperations,
  type GraphEntityExposure,
  type GraphOperationDeclaration,
  type GraphOperationDeclarations,
  type ResolveDomainOperations,
  type RuntimeBoundSelectionEntity,
  selection,
  type SelectionBuilder,
} from '../../data-graph/index.js';

import type {
  DomainOperationDeclaration,
  ResolvedDomainOperationDeclaration,
} from './domain-operations.js';
import type { OntahiApplicationBuilder, OntahiBinderApp, OntahiCapabilities } from './ontahi.js';
import type { BoundRuntimeValueRefs, RuntimeValueRefDeclarations } from './operation/value-ref.js';
import type { OperationInvocationResult } from './operation-result.js';
import type { TaskFailure, TaskRunRef } from './tasks.js';

const ONTAHI_ENTITY_DECLARATION = Symbol('ontahi.entity.declaration');
const ONTAHI_DIRECT_OPERATION_NAMES = Symbol('ontahi.entity.direct-operation-names');
declare const ONTAHI_CUSTOM_ENTITY_TYPE: unique symbol;
declare const ONTAHI_UNIFIED_ENTITY_TYPE: unique symbol;

type FieldDefinitions = Record<string, AnyFieldDefinition>;

export type OntahiRelationDeclaration<
  TKind extends 'belongsTo' | 'hasMany',
  TTarget extends AnyEntityDefinition,
  TTyped extends boolean = boolean,
> = {
  relationKind: TKind;
  target: OntahiSemanticEntityTarget<TTarget>;
  typed: TTyped;
  sourceField?: string;
  targetField?: string;
};

export type OntahiSemanticEntityRef<
  TEntity extends AnyEntityDefinition,
  TTyped extends boolean = false,
> = {
  readonly kind: 'ontahi.entity-ref';
  readonly typed: TTyped;
  readonly name?: string;
  readonly resolve?: () => TEntity;
};

export type OntahiSemanticEntityTarget<TEntity extends AnyEntityDefinition> =
  | TEntity
  | OntahiSemanticEntityRef<TEntity, boolean>;

export type OntahiEntityContract<
  TName extends string,
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields> = {},
> = EntityDefinition<
  TName,
  TFields,
  {},
  EntityRefLocatorFactories<TFields, EffectiveEntityLocatorDeclarations<TFields, TLocators>>
>;

type ResolvedSemanticEntityTarget<TTarget> =
  TTarget extends OntahiSemanticEntityRef<infer TEntity, boolean> ? TEntity : TTarget;

type OntahiRelationDeclarations = Record<
  string,
  OntahiRelationDeclaration<'belongsTo' | 'hasMany', AnyEntityDefinition, boolean>
>;

type EntityRelationsFrom<TDeclarations extends OntahiRelationDeclarations> = {
  [TName in keyof TDeclarations as TDeclarations[TName] extends OntahiRelationDeclaration<
    RelationKind,
    AnyEntityDefinition,
    infer TTyped
  >
    ? TTyped extends true
      ? TName
      : never
    : never]: TDeclarations[TName] extends OntahiRelationDeclaration<infer TKind, infer TTarget>
    ? RelationDefinition<TKind, TTarget>
    : never;
};

type EntityRelationDisplayPaths<TDeclarations extends OntahiRelationDeclarations> = {
  [TName in keyof TDeclarations & string]: TDeclarations[TName] extends OntahiRelationDeclaration<
    'belongsTo',
    infer TTarget
  >
    ? `${TName}.${keyof TTarget['fields'] & string}`
    : never;
}[keyof TDeclarations & string];

export function semanticEntityRef<
  const TName extends string,
  const TFields extends FieldDefinitions,
  const TLocators extends EntityLocatorDeclarations<TFields>,
>(
  target: TName,
  contract: { fields: TFields; locators: TLocators },
): OntahiSemanticEntityRef<OntahiEntityContract<TName, TFields, TLocators>, true>;
export function semanticEntityRef<
  const TName extends string,
  const TFields extends FieldDefinitions,
>(
  target: TName,
  contract: { fields: TFields },
): OntahiSemanticEntityRef<OntahiEntityContract<TName, TFields>, true>;
export function semanticEntityRef<TEntity extends AnyEntityDefinition = AnyEntityDefinition>(
  target: string | (() => unknown),
): OntahiSemanticEntityRef<TEntity, false>;
export function semanticEntityRef(
  target: string | (() => unknown),
  _contract?: { fields: FieldDefinitions; locators?: EntityLocatorDeclarations<FieldDefinitions> },
): OntahiSemanticEntityRef<any, boolean> {
  return typeof target === 'string'
    ? { kind: 'ontahi.entity-ref', typed: Boolean(_contract), name: target }
    : {
        kind: 'ontahi.entity-ref',
        typed: Boolean(_contract),
        resolve: () => target() as AnyEntityDefinition,
      };
}

const isSemanticEntityRef = (
  target: OntahiSemanticEntityTarget<AnyEntityDefinition>,
): target is OntahiSemanticEntityRef<AnyEntityDefinition, boolean> =>
  target.kind === 'ontahi.entity-ref';

const resolveSemanticEntityTarget = <TEntity extends AnyEntityDefinition>(
  target: OntahiSemanticEntityTarget<TEntity>,
  entitiesByName?: ReadonlyMap<string, AnyEntityDefinition>,
): TEntity => {
  if (!isSemanticEntityRef(target)) return target;
  const resolved = target.name ? entitiesByName?.get(target.name) : target.resolve?.();
  if (!resolved) {
    throw new Error(
      target.name
        ? `Entity reference ${target.name} is not registered.`
        : 'Deferred entity reference did not resolve to an entity.',
    );
  }
  return resolved as TEntity;
};

function belongsTo<TTarget extends AnyEntityDefinition, TTyped extends boolean>(
  target: OntahiSemanticEntityRef<TTarget, TTyped>,
  options?: { via?: string },
): OntahiRelationDeclaration<'belongsTo', TTarget, TTyped>;
function belongsTo<TTarget extends AnyEntityDefinition>(
  target: TTarget,
  options?: { via?: string },
): OntahiRelationDeclaration<'belongsTo', TTarget, true>;
function belongsTo(
  target: OntahiSemanticEntityTarget<AnyEntityDefinition>,
  options?: { via?: string },
) {
  return {
    relationKind: 'belongsTo',
    target,
    typed: !isSemanticEntityRef(target) || target.typed,
    ...(options?.via ? { sourceField: options.via } : {}),
  };
}
function hasMany<TTarget extends AnyEntityDefinition, TTyped extends boolean>(
  target: OntahiSemanticEntityRef<TTarget, TTyped>,
  options?: { via?: string },
): OntahiRelationDeclaration<'hasMany', TTarget, TTyped>;
function hasMany<TTarget extends AnyEntityDefinition>(
  target: TTarget,
  options?: { via?: string },
): OntahiRelationDeclaration<'hasMany', TTarget, true>;
function hasMany(
  target: OntahiSemanticEntityTarget<AnyEntityDefinition>,
  options?: { via?: string },
) {
  return {
    relationKind: 'hasMany',
    target,
    typed: !isSemanticEntityRef(target) || target.typed,
    ...(options?.via ? { targetField: options.via } : {}),
  };
}

export const relation = {
  belongsTo,
  hasMany,
};

type RuntimeError<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<infer TError, any, any, any> ? TError : any;
type RuntimeReadOptions<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<any, infer TReadOptions, any, any>
    ? TReadOptions
    : any;
type RuntimeCommandOptions<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<any, any, infer TCommandOptions, any>
    ? TCommandOptions
    : any;
type RuntimeCommandError<TRuntime> =
  TRuntime extends DataGraphExecutionRuntime<any, any, any, infer TCommandError>
    ? TCommandError
    : RuntimeError<TRuntime>;

type OntahiSelectionEntity<
  TEntity extends AnyEntityDefinition,
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = RuntimeBoundSelectionEntity<
  TEntity,
  RuntimeError<TRuntime>,
  RuntimeReadOptions<TRuntime>,
  RuntimeCommandOptions<TRuntime>,
  RuntimeCommandError<TRuntime>
>;

export type OntahiEntityCommands<TEntity extends AnyEntityDefinition> = GraphEntityWithOperations<
  TEntity,
  OntahiSelectionEntity<TEntity>
>;

export type OntahiEntityCommandCatalog = Record<string, OntahiEntityCommands<AnyEntityDefinition>>;

export type OntahiEntityBindingContext<TEntities extends object = OntahiEntityCommandCatalog> = {
  entities: TEntities;
};

export type OntahiEntityOperationContext<TEntity extends AnyEntityDefinition> = {
  self: TEntity;
  commands: OntahiEntityCommands<TEntity>;
  operation: OntahiApplicationBuilder['operation']['define'];
  ingress: OntahiApplicationBuilder['ingress'];
  app: OntahiApplicationBuilder;
};

type OntahiEntityDependencies = Record<string, OntahiSemanticEntityTarget<AnyEntityDefinition>>;
type OntahiOperationDeclaration =
  | GraphOperationDeclaration<any, any>
  | DomainOperationDeclarations[string];
type OntahiOperationDeclarations = Record<string, OntahiOperationDeclaration>;

export type OntahiOperationGroupDeclaration = DomainOperationDeclaration<
  any,
  any,
  any,
  any,
  any
> & {
  kind: 'domain-operation';
  authority: 'server';
  input: NonNullable<DomainOperationDeclaration<any, any, any, any, any>['input']>;
};

export type OntahiOperationGroupContext = {
  app: OntahiBinderApp;
  self: AnyEntityDefinition & Pick<EntityDefinition<any, any, any, any>, 'one' | 'many' | 'array'>;
};

export type OntahiOperationGroup<TName extends string> = (
  context: OntahiOperationGroupContext,
) => Record<TName, OntahiOperationGroupDeclaration>;

export const operationGroup = <const TName extends string>(
  names: readonly TName[],
  define: unknown,
): OntahiOperationGroup<TName> => {
  if (typeof define !== 'function') {
    throw new TypeError('An Ontahi operation group requires a factory function.');
  }

  return context => {
    const declarations = define(context) as Record<string, OntahiOperationGroupDeclaration>;
    if (!declarations || typeof declarations !== 'object') {
      throw new TypeError('An Ontahi operation group factory must return an operation record.');
    }

    const expectedNames = new Set<string>(names);
    const missingNames = names.filter(name => !(name in declarations));
    const unexpectedNames = Object.keys(declarations).filter(name => !expectedNames.has(name));
    if (missingNames.length > 0 || unexpectedNames.length > 0) {
      const details = [
        missingNames.length > 0 ? `missing: ${missingNames.join(', ')}` : undefined,
        unexpectedNames.length > 0 ? `unexpected: ${unexpectedNames.join(', ')}` : undefined,
      ]
        .filter(Boolean)
        .join('; ');
      throw new Error(
        `Ontahi operation group declaration does not match its public names (${details}).`,
      );
    }

    return declarations as Record<TName, OntahiOperationGroupDeclaration>;
  };
};
type GraphOperationsFrom<TOperations extends OntahiOperationDeclarations> = {
  [TName in keyof TOperations as TOperations[TName] extends GraphOperationDeclaration<any, any>
    ? TName
    : never]: Extract<TOperations[TName], GraphOperationDeclaration<any, any>>;
};
type DomainOperationsFrom<TOperations extends OntahiOperationDeclarations> = {
  [TName in keyof TOperations as TOperations[TName] extends GraphOperationDeclaration<any, any>
    ? never
    : TName]: Extract<TOperations[TName], DomainOperationDeclarations[string]>;
};

type DirectDomainOperationMethod<TOperation> =
  TOperation extends DomainOperationDeclaration<
    infer TInput,
    infer TResult,
    infer TFailure,
    any,
    infer TInputRefs
  >
    ? (
        ...args: object extends TInput
          ? []
          : keyof TInput extends never
            ? []
            : [input: EntityRefInputPublicInput<TInput, TInputRefs>]
      ) => Promise<
        OperationInvocationResult<
          TOperation extends { durable: object } ? TaskRunRef : TResult,
          TOperation extends { durable: object } ? TFailure | TaskFailure : TFailure
        >
      >
    : never;

type DirectDomainOperationMethods<
  TOperations extends Record<string, unknown>,
  TReservedNames extends PropertyKey = never,
> = {
  [TName in keyof TOperations as TName extends TReservedNames
    ? never
    : TName]: DirectDomainOperationMethod<TOperations[TName]>;
};

type OntahiEntityDependencyCommands<TDependencies extends OntahiEntityDependencies> = {
  [TName in keyof TDependencies]: BoundOntahiEntityCommands<
    Extract<ResolvedSemanticEntityTarget<TDependencies[TName]>, AnyEntityDefinition>
  >;
};

export type OntahiEntityUses<
  TCapabilities extends OntahiCapabilities = {},
  TEntities extends OntahiEntityDependencies = {},
> = {
  capabilities?: TCapabilities;
  entities?: TEntities | (() => TEntities);
};

export type OntahiEntityOperationContextWithUses<
  TEntity extends AnyEntityDefinition,
  TCapabilities extends OntahiCapabilities,
  TEntities extends OntahiEntityDependencies,
  TValues extends RuntimeValueRefDeclarations,
> = Omit<OntahiEntityOperationContext<TEntity>, 'app'> & {
  app: OntahiApplicationBuilder<TCapabilities>;
  entities: OntahiEntityDependencyCommands<TEntities>;
  commandsFor: <TEntity extends AnyEntityDefinition>(
    entity: OntahiSemanticEntityTarget<TEntity>,
  ) => BoundOntahiEntityCommands<TEntity>;
  values: BoundRuntimeValueRefs<TValues>;
  operations: Record<string, ResolvedDomainOperationDeclaration<any, any, any, any>>;
};

export type OntahiEntityConfig<
  TName extends string,
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
  TRelations extends OntahiRelationDeclarations,
  TOperations extends OntahiOperationDeclarations,
  TValues extends RuntimeValueRefDeclarations,
  TCapabilities extends OntahiCapabilities = {},
  TEntities extends OntahiEntityDependencies = {},
> = {
  name: TName;
  fields: TFields;
  display?: EntityDisplayMetadata<TFields, EntityRelationDisplayPaths<TRelations>>;
  freshness?: EntityFreshnessMetadata<TFields>;
  locators?: TLocators;
  identity?: keyof EffectiveEntityLocatorDeclarations<TFields, TLocators> & string;
  exposure?: GraphEntityExposure;
  relations?: TRelations | (() => TRelations);
  domainOperationDefaults?: DomainOperationDefaults;
  values?: TValues;
  uses?: OntahiEntityUses<TCapabilities, TEntities>;
  operations?: (
    context: OntahiEntityOperationContextWithUses<
      EntityDefinition<
        TName,
        TFields,
        EntityRelationsFrom<TRelations>,
        EntityRefLocatorsFrom<TFields, TLocators>
      >,
      TCapabilities,
      TEntities,
      TValues
    >,
  ) => TOperations;
};

type EntityRefLocatorsFrom<
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
> = EntityRefLocatorFactories<TFields, EffectiveEntityLocatorDeclarations<TFields, TLocators>>;

type EntitySchemaFromConfig<
  TName extends string,
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
  TRelations extends OntahiRelationDeclarations,
> = EntityDefinition<
  TName,
  TFields,
  EntityRelationsFrom<TRelations>,
  EntityRefLocatorsFrom<TFields, TLocators>
>;

type BoundOntahiEntityBase<
  TEntity extends AnyEntityDefinition,
  TOperations extends OntahiOperationDeclarations,
  TValues extends RuntimeValueRefDeclarations = {},
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = GraphEntityWithOperations<
  TEntity,
  OntahiSelectionEntity<TEntity, TRuntime>,
  GraphOperationsFrom<TOperations>,
  DomainOperationsFrom<TOperations>
> &
  EntitySelectionFactory<TEntity> &
  BoundEntityRefLocators<
    TEntity,
    ResolveDomainOperations<TEntity['name'], DomainOperationsFrom<TOperations>>,
    EntityRefLocators<TEntity>,
    unknown
  > & { values: BoundRuntimeValueRefs<TValues> };

export type BoundOntahiEntity<
  TEntity extends AnyEntityDefinition,
  TOperations extends OntahiOperationDeclarations,
  TValues extends RuntimeValueRefDeclarations = {},
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = BoundOntahiEntityBase<TEntity, TOperations, TValues, TRuntime> &
  DirectDomainOperationMethods<
    DomainOperationsFrom<TOperations>,
    keyof BoundOntahiEntityBase<TEntity, TOperations, TValues, TRuntime>
  >;

export type OntahiEntityDeclaration<
  TEntity extends AnyEntityDefinition,
  TOperations extends OntahiOperationDeclarations,
  TValues extends RuntimeValueRefDeclarations = {},
> = OntahiBindableEntity<TEntity> &
  EntitySelectionFactory<TEntity> &
  BoundEntityRefLocators<
    TEntity,
    ResolveDomainOperations<TEntity['name'], DomainOperationsFrom<TOperations>>,
    EntityRefLocators<TEntity>,
    unknown
  > &
  DirectDomainOperationMethods<DomainOperationsFrom<TOperations>, keyof TEntity> & {
    readonly [ONTAHI_UNIFIED_ENTITY_TYPE]: {
      entity: TEntity;
      operations: TOperations;
      values: TValues;
    };
  };

const attachDirectDomainOperationMethods = (
  entity: object,
  operations: Record<string, ResolvedDomainOperationDeclaration<any, any, any, any>>,
  invoke: OntahiApplicationBuilder['operation']['invoke'],
) => {
  const boundNames =
    (entity as { [ONTAHI_DIRECT_OPERATION_NAMES]?: Set<string> })[ONTAHI_DIRECT_OPERATION_NAMES] ??
    new Set<string>();

  for (const [name, operation] of Object.entries(operations)) {
    if (name in entity && !boundNames.has(name)) continue;

    Object.defineProperty(entity, name, {
      configurable: true,
      enumerable: false,
      value: (...args: readonly unknown[]) => invoke(operation, args[0] as never),
    });
    boundNames.add(name);
  }

  Object.defineProperty(entity, ONTAHI_DIRECT_OPERATION_NAMES, {
    configurable: true,
    value: boundNames,
  });

  return entity;
};

type OntahiBindableDeclaration<
  TDeclaration extends { name: string },
  TCapabilities extends OntahiCapabilities = OntahiCapabilities,
> = TDeclaration & {
  readonly [ONTAHI_ENTITY_DECLARATION]: {
    prepare(): void;
    semanticEntities(): readonly AnyEntityDefinition[];
    resolveReferences(entities: ReadonlyMap<string, AnyEntityDefinition>): void;
    bind(app: OntahiApplicationBuilder<TCapabilities>, context: OntahiEntityBindingContext): object;
  };
};

type OntahiBindableEntity<
  TEntity extends AnyEntityDefinition,
  TCapabilities extends OntahiCapabilities = OntahiCapabilities,
> = OntahiBindableDeclaration<TEntity, TCapabilities>;

export type OntahiEntityModule<
  TEntity extends AnyEntityDefinition,
  TBoundEntity extends object,
  TCapabilities extends OntahiCapabilities = {},
> = TEntity & {
  readonly [ONTAHI_ENTITY_DECLARATION]: {
    prepare(): void;
    semanticEntities(): readonly AnyEntityDefinition[];
    resolveReferences(entities: ReadonlyMap<string, AnyEntityDefinition>): void;
    bind(
      app: OntahiApplicationBuilder<TCapabilities>,
      context: OntahiEntityBindingContext,
    ): TBoundEntity;
  };
  readonly [ONTAHI_CUSTOM_ENTITY_TYPE]: TBoundEntity;
};

export type OntahiRelationModule<
  TName extends string,
  TBoundRelation extends object,
> = OntahiBindableDeclaration<{ name: TName }> & {
  readonly [ONTAHI_CUSTOM_ENTITY_TYPE]: TBoundRelation;
};

export type AnyOntahiEntityDeclaration = OntahiBindableDeclaration<{ name: string }>;

export type BoundOntahiEntityDeclaration<
  TDeclaration extends AnyOntahiEntityDeclaration,
  TRuntime extends DataGraphExecutionRuntime<any, any, any, any> = DataGraphExecutionRuntime<
    any,
    any,
    any,
    any
  >,
> = TDeclaration extends {
  readonly [ONTAHI_CUSTOM_ENTITY_TYPE]: infer TBoundEntity extends object;
}
  ? TBoundEntity
  : TDeclaration extends AnyEntityDefinition & {
        readonly [ONTAHI_UNIFIED_ENTITY_TYPE]: {
          entity: infer TEntity extends AnyEntityDefinition;
          operations: infer TOperations extends OntahiOperationDeclarations;
          values: infer TValues extends RuntimeValueRefDeclarations;
        };
      }
    ? BoundOntahiEntity<TEntity, TOperations, TValues, TRuntime>
    : never;

type BoundOntahiEntityCommands<TEntity extends AnyEntityDefinition> = TEntity extends {
  readonly [ONTAHI_UNIFIED_ENTITY_TYPE]: {
    entity: infer TSchema extends AnyEntityDefinition;
  };
}
  ? OntahiEntityCommands<TSchema>
  : TEntity extends AnyOntahiEntityDeclaration
    ? BoundOntahiEntityDeclaration<TEntity>
    : OntahiEntityCommands<TEntity>;

export const isOntahiEntityDeclaration = (value: unknown): value is AnyOntahiEntityDeclaration =>
  Boolean(
    value &&
    typeof value === 'object' &&
    ONTAHI_ENTITY_DECLARATION in value &&
    typeof (value as AnyOntahiEntityDeclaration)[ONTAHI_ENTITY_DECLARATION].bind === 'function',
  );

export const bindOntahiEntity = <TDeclaration extends AnyOntahiEntityDeclaration>(
  declaration: TDeclaration,
  app: OntahiApplicationBuilder,
  context: OntahiEntityBindingContext,
): BoundOntahiEntityDeclaration<TDeclaration> =>
  declaration[ONTAHI_ENTITY_DECLARATION].bind(
    app,
    context,
  ) as BoundOntahiEntityDeclaration<TDeclaration>;

export const prepareOntahiEntity = (declaration: AnyOntahiEntityDeclaration) =>
  declaration[ONTAHI_ENTITY_DECLARATION].prepare();

export const resolveOntahiEntityReferences = (
  declaration: AnyOntahiEntityDeclaration,
  entities: ReadonlyMap<string, AnyEntityDefinition>,
) => declaration[ONTAHI_ENTITY_DECLARATION].resolveReferences(entities);

export const getOntahiSemanticEntities = (declaration: AnyOntahiEntityDeclaration) =>
  declaration[ONTAHI_ENTITY_DECLARATION].semanticEntities();

export const entityModule = <
  TEntity extends AnyEntityDefinition,
  TBoundEntity extends object,
  TCapabilities extends OntahiCapabilities = {},
  TBinderEntities extends object = OntahiEntityCommandCatalog,
>(options: {
  entity: TEntity;
  prepare?: () => void;
  bind: (
    app: OntahiApplicationBuilder<TCapabilities>,
    context: OntahiEntityBindingContext<TBinderEntities>,
  ) => TBoundEntity;
}): OntahiEntityModule<TEntity, TBoundEntity, TCapabilities> => {
  const existingDeclaration = isOntahiEntityDeclaration(options.entity)
    ? options.entity[ONTAHI_ENTITY_DECLARATION]
    : undefined;
  Object.defineProperty(options.entity, ONTAHI_ENTITY_DECLARATION, {
    configurable: true,
    enumerable: false,
    value: {
      prepare: () => {
        existingDeclaration?.prepare();
        options.prepare?.();
      },
      semanticEntities: () => [options.entity],
      resolveReferences: (entities: ReadonlyMap<string, AnyEntityDefinition>) =>
        existingDeclaration?.resolveReferences(entities),
      bind: options.bind as (
        app: OntahiApplicationBuilder<TCapabilities>,
        context: OntahiEntityBindingContext,
      ) => TBoundEntity,
    },
  });
  return options.entity as OntahiEntityModule<TEntity, TBoundEntity, TCapabilities>;
};

export const entityModuleWithCapabilities = <
  TEntity extends AnyEntityDefinition,
  TBoundEntity extends object,
  TAppCapabilities extends OntahiCapabilities,
  TBinderCapabilities extends object,
  TBinderEntities extends object = OntahiEntityCommandCatalog,
>(options: {
  entity: TEntity;
  prepare?: () => void;
  capabilities: (app: OntahiApplicationBuilder<TAppCapabilities>) => TBinderCapabilities;
  bind: (
    app: OntahiApplicationBuilder<TAppCapabilities>,
    capabilities: TBinderCapabilities,
    context: OntahiEntityBindingContext<TBinderEntities>,
  ) => TBoundEntity;
}): OntahiEntityModule<TEntity, TBoundEntity> =>
  entityModule({
    entity: options.entity,
    prepare: options.prepare,
    bind: (app, context) =>
      options.bind(
        app as unknown as OntahiApplicationBuilder<TAppCapabilities>,
        options.capabilities(app as unknown as OntahiApplicationBuilder<TAppCapabilities>),
        context as OntahiEntityBindingContext<TBinderEntities>,
      ),
  });

export const relationModule = <
  const TName extends string,
  TBoundRelation extends object,
  TBinderEntities extends object = OntahiEntityCommandCatalog,
>(options: {
  name: TName;
  prepare?: () => void;
  bind: (
    app: OntahiApplicationBuilder,
    context: OntahiEntityBindingContext<TBinderEntities>,
  ) => TBoundRelation;
}): OntahiRelationModule<TName, TBoundRelation> => {
  const declaration = { name: options.name };
  Object.defineProperty(declaration, ONTAHI_ENTITY_DECLARATION, {
    enumerable: false,
    value: {
      prepare: options.prepare ?? (() => undefined),
      semanticEntities: () => [],
      resolveReferences: () => undefined,
      bind: options.bind as (
        app: OntahiApplicationBuilder,
        context: OntahiEntityBindingContext,
      ) => TBoundRelation,
    },
  });
  return declaration as OntahiRelationModule<TName, TBoundRelation>;
};

export const relationModuleWithCapabilities = <
  const TName extends string,
  TBoundRelation extends object,
  TAppCapabilities extends OntahiCapabilities,
  TBinderCapabilities extends object,
  TBinderEntities extends object = OntahiEntityCommandCatalog,
>(options: {
  name: TName;
  prepare?: () => void;
  capabilities: (app: OntahiApplicationBuilder<TAppCapabilities>) => TBinderCapabilities;
  bind: (
    app: OntahiApplicationBuilder<TAppCapabilities>,
    capabilities: TBinderCapabilities,
    context: OntahiEntityBindingContext<TBinderEntities>,
  ) => TBoundRelation;
}): OntahiRelationModule<TName, TBoundRelation> =>
  relationModule({
    name: options.name,
    prepare: options.prepare,
    bind: (app, context) =>
      options.bind(
        app as unknown as OntahiApplicationBuilder<TAppCapabilities>,
        options.capabilities(app as unknown as OntahiApplicationBuilder<TAppCapabilities>),
        context as OntahiEntityBindingContext<TBinderEntities>,
      ),
  });

const defineOntahiEntity = <
  const TName extends string,
  const TFields extends FieldDefinitions,
  const TRelations extends OntahiRelationDeclarations,
  TOperations extends OntahiOperationDeclarations,
  const TValues extends RuntimeValueRefDeclarations,
  const TLocators extends EntityLocatorDeclarations<TFields> = {},
  const TCapabilities extends OntahiCapabilities = {},
  const TEntities extends OntahiEntityDependencies = {},
>(
  config: OntahiEntityConfig<
    TName,
    TFields,
    TLocators,
    TRelations,
    TOperations,
    TValues,
    TCapabilities,
    TEntities
  >,
): OntahiEntityDeclaration<
  EntitySchemaFromConfig<TName, TFields, TLocators, TRelations>,
  TOperations,
  TValues
> => {
  const base = defineEntitySchema(config.name, config.fields);
  const withDisplay = config.display ? base.display(config.display) : base;
  const withFreshness = config.freshness ? withDisplay.freshness(config.freshness) : withDisplay;
  const withLocators = config.locators ? withFreshness.locators(config.locators) : withFreshness;
  const schema = (
    config.identity
      ? (withLocators.identity as (name: string) => typeof withLocators)(config.identity)
      : withLocators
  ) as EntitySchemaFromConfig<TName, TFields, TLocators, TRelations>;
  Object.defineProperty(schema, 'selection', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: (build: SelectionBuilder<typeof schema>) => selection(schema, build),
  });
  let referencesResolved = false;
  let entityDependencyNames: Record<string, string> | undefined;
  const materializeRelations = (
    declarations: OntahiRelationDeclarations,
    entitiesByName: ReadonlyMap<string, AnyEntityDefinition>,
    skipSemanticRefs = false,
  ) => {
    const relations = schema.relations as Record<
      string,
      RelationDefinition<'belongsTo' | 'hasMany', AnyEntityDefinition>
    >;
    Object.entries(declarations).forEach(([name, declaration]) => {
      if (skipSemanticRefs && isSemanticEntityRef(declaration.target)) return;
      const target = resolveSemanticEntityTarget(declaration.target, entitiesByName);
      if (!target || target.kind !== 'entity') {
        throw new Error(`Relation ${schema.name}.${name} did not resolve to an entity.`);
      }
      if (entitiesByName.get(target.name) !== target) {
        throw new Error(
          `Relation ${schema.name}.${name} targets entity ${target.name}, but it is not registered.`,
        );
      }
      if (declaration.sourceField && !(declaration.sourceField in schema.fields)) {
        throw new Error(
          `Unknown relation source field ${declaration.sourceField} on entity ${schema.name}`,
        );
      }
      if (declaration.targetField && !(declaration.targetField in target.fields)) {
        throw new Error(
          `Unknown relation target field ${declaration.targetField} on entity ${target.name}`,
        );
      }
      relations[name] = {
        kind: 'relation',
        relationKind: declaration.relationKind,
        target,
        ...(declaration.sourceField ? { sourceField: declaration.sourceField } : {}),
        ...(declaration.targetField ? { targetField: declaration.targetField } : {}),
      };
    });
  };
  const resolveReferences = (entitiesByName: ReadonlyMap<string, AnyEntityDefinition>) => {
    referencesResolved = false;

    const declarations = (
      typeof config.relations === 'function' ? config.relations() : (config.relations ?? {})
    ) as OntahiRelationDeclarations;
    materializeRelations(declarations, entitiesByName);
    const entityDependencies =
      typeof config.uses?.entities === 'function'
        ? config.uses.entities()
        : (config.uses?.entities ?? ({} as TEntities));
    entityDependencyNames = Object.fromEntries(
      Object.entries(entityDependencies).map(([name, declaration]) => [
        name,
        resolveSemanticEntityTarget(declaration, entitiesByName).name,
      ]),
    );
    referencesResolved = true;
  };

  Object.defineProperty(schema, ONTAHI_ENTITY_DECLARATION, {
    configurable: true,
    enumerable: false,
    value: {
      prepare: () => undefined,
      semanticEntities: () => [schema],
      resolveReferences,
      bind(app: OntahiApplicationBuilder, context: OntahiEntityBindingContext) {
        if (!referencesResolved) {
          throw new Error(`Entity ${schema.name} references have not been resolved.`);
        }
        const commands = app.graph.defineEntity(schema) as OntahiEntityCommands<typeof schema>;
        const entities = Object.fromEntries(
          Object.entries(entityDependencyNames ?? {}).map(([name, targetName]) => {
            const dependency = context.entities[targetName];
            if (!dependency) {
              throw new Error(
                `Entity ${schema.name} requires entity ${targetName}, but it is not registered.`,
              );
            }
            return [name, dependency];
          }),
        ) as unknown as OntahiEntityDependencyCommands<TEntities>;
        let boundValues: BoundRuntimeValueRefs<TValues> | undefined;
        let boundOperations:
          | Record<string, ResolvedDomainOperationDeclaration<any, any, any, any>>
          | undefined;
        const values = new Proxy({} as BoundRuntimeValueRefs<TValues>, {
          get: (_target, property) => {
            if (!boundValues) {
              throw new Error(
                `Entity ${schema.name} values are not available while operations are being declared.`,
              );
            }
            return Reflect.get(boundValues, property);
          },
        });
        const operations = new Proxy(
          {} as Record<string, ResolvedDomainOperationDeclaration<any, any, any, any>>,
          {
            get: (_target, property) => {
              if (!boundOperations) {
                throw new Error(
                  `Entity ${schema.name} sibling operations are not available while operations are being declared.`,
                );
              }
              return Reflect.get(boundOperations, property);
            },
          },
        );
        const commandsFor = <TDependency extends AnyEntityDefinition>(
          declaration: OntahiSemanticEntityTarget<TDependency>,
        ): BoundOntahiEntityCommands<TDependency> => {
          const targetName =
            isSemanticEntityRef(declaration) && declaration.name
              ? declaration.name
              : resolveSemanticEntityTarget(declaration).name;
          const dependency = context.entities[targetName];
          if (!dependency) {
            throw new Error(
              `Entity ${schema.name} requires entity ${targetName}, but it is not registered.`,
            );
          }
          return dependency as unknown as BoundOntahiEntityCommands<TDependency>;
        };
        const declarations =
          config.operations?.({
            self: schema,
            commands,
            operation: app.operation.define,
            ingress: app.ingress,
            app: app as OntahiApplicationBuilder<TCapabilities>,
            entities,
            commandsFor,
            values,
            operations,
          }) ?? ({} as TOperations);
        const graphOperations = Object.fromEntries(
          Object.entries(declarations).filter(
            ([, declaration]) => declaration.kind === 'graph-operation',
          ),
        ) as GraphOperationDeclarations;
        const domainOperations = Object.fromEntries(
          Object.entries(declarations).filter(
            ([, declaration]) => declaration.kind === 'domain-operation',
          ),
        ) as DomainOperationsFrom<TOperations>;

        const boundEntity = app.graph.defineEntity(schema, {
          exposure: config.exposure,
          domainOperationDefaults: config.domainOperationDefaults,
          operations: graphOperations,
          domainOperations: ({ values, operations }) => {
            boundValues = values as BoundRuntimeValueRefs<TValues>;
            boundOperations = operations;
            return domainOperations;
          },
          values: config.values,
        });

        return attachDirectDomainOperationMethods(
          boundEntity,
          boundEntity.domain as unknown as Record<
            string,
            ResolvedDomainOperationDeclaration<any, any, any, any>
          >,
          app.operation.invoke,
        );
      },
    },
  });
  if (config.relations && typeof config.relations !== 'function') {
    const declarations = Object.values(config.relations);
    const directTargets = declarations.flatMap(declaration =>
      isSemanticEntityRef(declaration.target)
        ? []
        : [[declaration.target.name, declaration.target] as const],
    );
    const directEntitiesByName = new Map(directTargets);
    if (
      declarations.every(declaration => !isSemanticEntityRef(declaration.target)) &&
      !config.uses?.entities
    ) {
      resolveReferences(directEntitiesByName);
    } else {
      materializeRelations(config.relations, directEntitiesByName, true);
    }
  }

  return schema as OntahiEntityDeclaration<
    EntitySchemaFromConfig<TName, TFields, TLocators, TRelations>,
    TOperations,
    TValues
  >;
};

export const entity = Object.assign(defineOntahiEntity, {
  ref: semanticEntityRef,
});
