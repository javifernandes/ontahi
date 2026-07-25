import {
  entity as defineEntitySchema,
  type AnyEntityDefinition,
  type BoundEntityRefLocators,
  type DomainOperationDefaults,
  type DomainOperationDeclarations,
  type AnyFieldDefinition,
  type EntityDefinition,
  type EntityLocatorDeclarations,
  type EntityRefLocatorFactories,
  type EntityRefLocators,
  type GraphEntityWithOperations,
  type ResolveDomainOperations,
  type RuntimeBoundSelectionEntity,
} from '../../data-graph/index.js';

import type { OntahiApplicationBuilder } from './ontahi.js';

const ONTAHI_ENTITY_DECLARATION = Symbol('ontahi.entity.declaration');

type FieldDefinitions = Record<string, AnyFieldDefinition>;

type OntahiSelectionEntity<TEntity extends AnyEntityDefinition> = RuntimeBoundSelectionEntity<
  TEntity,
  any,
  any,
  any,
  any
>;

export type OntahiEntityCommands<TEntity extends AnyEntityDefinition> = GraphEntityWithOperations<
  TEntity,
  OntahiSelectionEntity<TEntity>
>;

export type OntahiEntityOperationContext<TEntity extends AnyEntityDefinition> = {
  self: TEntity;
  commands: OntahiEntityCommands<TEntity>;
  operation: OntahiApplicationBuilder['operation']['define'];
  ingress: OntahiApplicationBuilder['ingress'];
  app: OntahiApplicationBuilder;
};

export type OntahiEntityConfig<
  TName extends string,
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
  TOperations extends DomainOperationDeclarations,
> = {
  name: TName;
  fields: TFields;
  locators?: TLocators;
  identity?: keyof TLocators & string;
  domainOperationDefaults?: DomainOperationDefaults;
  operations?: (
    context: OntahiEntityOperationContext<
      EntityDefinition<TName, TFields, {}, EntityRefLocatorsFrom<TFields, TLocators>>
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
> = EntityDefinition<TName, TFields, {}, EntityRefLocatorsFrom<TFields, TLocators>>;

export type BoundOntahiEntity<
  TEntity extends AnyEntityDefinition,
  TOperations extends DomainOperationDeclarations,
> = GraphEntityWithOperations<TEntity, OntahiSelectionEntity<TEntity>, {}, TOperations> &
  BoundEntityRefLocators<
    TEntity,
    ResolveDomainOperations<TEntity['name'], TOperations>,
    EntityRefLocators<TEntity>,
    unknown
  >;

export type OntahiEntityDeclaration<
  TEntity extends AnyEntityDefinition,
  TOperations extends DomainOperationDeclarations,
> = TEntity & {
  readonly [ONTAHI_ENTITY_DECLARATION]: {
    bind(app: OntahiApplicationBuilder): BoundOntahiEntity<TEntity, TOperations>;
  };
};

export type AnyOntahiEntityDeclaration = AnyEntityDefinition & {
  readonly [ONTAHI_ENTITY_DECLARATION]: {
    bind(app: OntahiApplicationBuilder): object;
  };
};

export type BoundOntahiEntityDeclaration<TDeclaration extends AnyOntahiEntityDeclaration> =
  TDeclaration extends OntahiEntityDeclaration<
    infer TEntity,
    infer TOperations extends DomainOperationDeclarations
  >
    ? BoundOntahiEntity<TEntity, TOperations>
    : never;

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
): BoundOntahiEntityDeclaration<TDeclaration> =>
  declaration[ONTAHI_ENTITY_DECLARATION].bind(app) as BoundOntahiEntityDeclaration<TDeclaration>;

export const entity = <
  const TName extends string,
  const TFields extends FieldDefinitions,
  const TLocators extends EntityLocatorDeclarations<TFields> = {},
  TOperations extends DomainOperationDeclarations = {},
>(
  config: OntahiEntityConfig<TName, TFields, TLocators, TOperations>,
): OntahiEntityDeclaration<EntitySchemaFromConfig<TName, TFields, TLocators>, TOperations> => {
  const base = defineEntitySchema(config.name, config.fields);
  const withLocators = config.locators ? base.locators(config.locators) : base;
  const schema = (
    config.identity
      ? (withLocators.identity as (name: string) => typeof withLocators)(config.identity)
      : withLocators
  ) as EntitySchemaFromConfig<TName, TFields, TLocators>;

  Object.defineProperty(schema, ONTAHI_ENTITY_DECLARATION, {
    enumerable: false,
    value: {
      bind(app: OntahiApplicationBuilder) {
        const commands = app.graph.defineEntity(schema) as OntahiEntityCommands<typeof schema>;
        const domainOperations =
          config.operations?.({
            self: schema,
            commands,
            operation: app.operation.define,
            ingress: app.ingress,
            app,
          }) ?? ({} as TOperations);

        return app.graph.defineEntity(schema, {
          domainOperationDefaults: config.domainOperationDefaults,
          domainOperations,
        });
      },
    },
  });

  return schema as OntahiEntityDeclaration<
    EntitySchemaFromConfig<TName, TFields, TLocators>,
    TOperations
  >;
};
