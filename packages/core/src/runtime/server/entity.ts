import {
  entity as defineEntitySchema,
  type AnyEntityDefinition,
  type BoundEntityRefLocators,
  type DomainOperationDefaults,
  type DomainOperationDeclarations,
  type DataGraphExecutionRuntime,
  type AnyFieldDefinition,
  type EntityDisplayMetadata,
  type EntityDefinition,
  type EntityFreshnessMetadata,
  type EntityLocatorDeclarations,
  type RelationDefinition,
  type EntityRefLocatorFactories,
  type EntityRefLocators,
  type GraphEntityWithOperations,
  type GraphEntityExposure,
  type GraphOperationDeclaration,
  type GraphOperationDeclarations,
  type ResolveDomainOperations,
  type RuntimeBoundSelectionEntity,
} from '../../data-graph/index.js';

import type { ResolvedDomainOperationDeclaration } from './domain-operations.js';
import type { OntahiApplicationBuilder, OntahiCapabilities } from './ontahi.js';
import type { BoundRuntimeValueRefs, RuntimeValueRefDeclarations } from './operation/value-ref.js';

const ONTAHI_ENTITY_DECLARATION = Symbol('ontahi.entity.declaration');
declare const ONTAHI_CUSTOM_ENTITY_TYPE: unique symbol;
declare const ONTAHI_UNIFIED_ENTITY_TYPE: unique symbol;

type FieldDefinitions = Record<string, AnyFieldDefinition>;

export type OntahiRelationDeclaration<
  TKind extends 'belongsTo' | 'hasMany',
  TTarget extends AnyEntityDefinition,
> = {
  relationKind: TKind;
  target: TTarget;
  sourceField?: string;
  targetField?: string;
};

type OntahiRelationDeclarations = Record<
  string,
  OntahiRelationDeclaration<'belongsTo' | 'hasMany', AnyEntityDefinition>
>;

type EntityRelationsFrom<TDeclarations extends OntahiRelationDeclarations> = {
  [TName in keyof TDeclarations]: TDeclarations[TName] extends OntahiRelationDeclaration<
    infer TKind,
    infer TTarget
  >
    ? RelationDefinition<TKind, TTarget>
    : never;
};

export const relation = {
  belongsTo: <TTarget extends AnyEntityDefinition>(
    target: TTarget,
    options?: { via?: string },
  ): OntahiRelationDeclaration<'belongsTo', TTarget> => ({
    relationKind: 'belongsTo',
    target,
    ...(options?.via ? { sourceField: options.via } : {}),
  }),
  hasMany: <TTarget extends AnyEntityDefinition>(
    target: TTarget,
    options?: { via?: string },
  ): OntahiRelationDeclaration<'hasMany', TTarget> => ({
    relationKind: 'hasMany',
    target,
    ...(options?.via ? { targetField: options.via } : {}),
  }),
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

type OntahiEntityDependencies = Record<string, AnyEntityDefinition>;
type OntahiOperationDeclaration =
  | GraphOperationDeclaration<any, any>
  | DomainOperationDeclarations[string];
type OntahiOperationDeclarations = Record<string, OntahiOperationDeclaration>;
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

type OntahiEntityDependencyCommands<TDependencies extends OntahiEntityDependencies> = {
  [TName in keyof TDependencies]: BoundOntahiEntityCommands<TDependencies[TName]>;
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
    entity: TEntity,
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
  display?: EntityDisplayMetadata<TFields>;
  freshness?: EntityFreshnessMetadata<TFields>;
  locators?: TLocators;
  identity?: keyof TLocators & string;
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
> = EntityRefLocatorFactories<TFields, TLocators>;

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
> = GraphEntityWithOperations<
  TEntity,
  OntahiSelectionEntity<TEntity, TRuntime>,
  GraphOperationsFrom<TOperations>,
  DomainOperationsFrom<TOperations>
> &
  BoundEntityRefLocators<
    TEntity,
    ResolveDomainOperations<TEntity['name'], DomainOperationsFrom<TOperations>>,
    EntityRefLocators<TEntity>,
    unknown
  > & { values: BoundRuntimeValueRefs<TValues> };

export type OntahiEntityDeclaration<
  TEntity extends AnyEntityDefinition,
  TOperations extends OntahiOperationDeclarations,
  TValues extends RuntimeValueRefDeclarations = {},
> = OntahiBindableEntity<TEntity> & {
  readonly [ONTAHI_UNIFIED_ENTITY_TYPE]: {
    entity: TEntity;
    operations: TOperations;
    values: TValues;
  };
};

type OntahiBindableDeclaration<
  TDeclaration extends { name: string },
  TCapabilities extends OntahiCapabilities = OntahiCapabilities,
> = TDeclaration & {
  readonly [ONTAHI_ENTITY_DECLARATION]: {
    prepare(): void;
    semanticEntities(): readonly AnyEntityDefinition[];
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

type BoundOntahiEntityCommands<TEntity extends AnyEntityDefinition> =
  TEntity extends AnyOntahiEntityDeclaration
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

export const entity = <
  const TName extends string,
  const TFields extends FieldDefinitions,
  const TLocators extends EntityLocatorDeclarations<TFields>,
  const TRelations extends OntahiRelationDeclarations,
  TOperations extends OntahiOperationDeclarations,
  const TValues extends RuntimeValueRefDeclarations,
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
  let prepared = false;
  const prepare = () => {
    if (prepared) return;

    const relations = schema.relations as Record<
      string,
      RelationDefinition<'belongsTo' | 'hasMany', AnyEntityDefinition>
    >;
    const declarations = (
      typeof config.relations === 'function' ? config.relations() : (config.relations ?? {})
    ) as OntahiRelationDeclarations;
    Object.entries(declarations).forEach(([name, declaration]) => {
      if (declaration.sourceField && !(declaration.sourceField in schema.fields)) {
        throw new Error(
          `Unknown relation source field ${declaration.sourceField} on entity ${schema.name}`,
        );
      }
      if (declaration.targetField && !(declaration.targetField in declaration.target.fields)) {
        throw new Error(
          `Unknown relation target field ${declaration.targetField} on entity ${declaration.target.name}`,
        );
      }
      relations[name] = {
        kind: 'relation',
        relationKind: declaration.relationKind,
        target: declaration.target,
        ...(declaration.sourceField ? { sourceField: declaration.sourceField } : {}),
        ...(declaration.targetField ? { targetField: declaration.targetField } : {}),
      };
    });
    prepared = true;
  };

  Object.defineProperty(schema, ONTAHI_ENTITY_DECLARATION, {
    configurable: true,
    enumerable: false,
    value: {
      prepare,
      semanticEntities: () => [schema],
      bind(app: OntahiApplicationBuilder, context: OntahiEntityBindingContext) {
        prepare();
        const commands = app.graph.defineEntity(schema) as OntahiEntityCommands<typeof schema>;
        const entityDependencies: TEntities =
          typeof config.uses?.entities === 'function'
            ? config.uses.entities()
            : (config.uses?.entities ?? ({} as TEntities));
        const entities = Object.fromEntries(
          Object.entries(entityDependencies).map(([name, declaration]) => {
            const dependency = context.entities[declaration.name];
            if (!dependency) {
              throw new Error(
                `Entity ${schema.name} requires entity ${declaration.name}, but it is not registered.`,
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
        const declarations =
          config.operations?.({
            self: schema,
            commands,
            operation: app.operation.define,
            ingress: app.ingress,
            app: app as OntahiApplicationBuilder<TCapabilities>,
            entities,
            commandsFor: declaration => {
              const dependency = context.entities[declaration.name];
              if (!dependency) {
                throw new Error(
                  `Entity ${schema.name} requires entity ${declaration.name}, but it is not registered.`,
                );
              }
              return dependency as unknown as BoundOntahiEntityCommands<typeof declaration>;
            },
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

        return app.graph.defineEntity(schema, {
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
      },
    },
  });
  if (config.relations && typeof config.relations !== 'function') {
    prepare();
  }

  return schema as OntahiEntityDeclaration<
    EntitySchemaFromConfig<TName, TFields, TLocators, TRelations>,
    TOperations,
    TValues
  >;
};
