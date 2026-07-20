import type { RelationNodeSpec } from './query.js';
import type {
  EntityRefLocator,
  EntityRefLocatorDeclarations,
  EntityRefLocatorFactory,
  EntityRefLocatorValue,
} from './ref.js';

export type FieldDefinition<TValue> = {
  kind: 'field';
  fieldType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum';
  enumValues?: readonly string[];
  stringConstraints?: StringFieldConstraints;
  numberConstraints?: NumberFieldConstraints;
  nullable?: true;
  __value?: TValue;
};

export type StringFieldConstraints = {
  minLength?: number;
  maxLength?: number;
};

export type NumberFieldConstraints = {
  integer?: true;
  min?: number;
  max?: number;
};

type FieldDefinitions = Record<string, FieldDefinition<unknown>>;
export type AnyFieldDefinition = FieldDefinition<unknown>;

export type InferFieldValue<TField extends AnyFieldDefinition> =
  TField extends FieldDefinition<infer TValue> ? TValue : never;

export type InferEntityRecord<TFields extends FieldDefinitions> = {
  [TKey in keyof TFields]: InferFieldValue<TFields[TKey]>;
};

export type GraphSchemaDefinition =
  | AnyFieldDefinition
  | AnyEntityDefinition
  | AnyEntityViewDefinition
  | AnyValueDefinition
  | GraphArrayDefinition
  | GraphNullableDefinition
  | GraphOptionalDefinition;

export interface GraphSchemaFields {
  [fieldName: string]: GraphSchemaDefinition;
}

type InferGraphSchemaFields<TFields extends GraphSchemaFields> = {
  [TKey in keyof TFields]: InferGraphSchemaValue<TFields[TKey]>;
};

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

export type InferGraphSchemaValue<TSchema extends GraphSchemaDefinition> =
  TSchema extends FieldDefinition<infer TValue>
    ? TValue
    : TSchema extends EntityDefinition<any, infer TFields, any, any>
      ? InferEntityRecord<TFields>
      : TSchema extends AnyEntityDefinition
        ? InferEntityRecord<TSchema['fields']>
        : TSchema extends EntityViewDefinition<infer TEntity, any, infer TFields, infer TOmit>
          ? Simplify<
              Omit<InferEntityRecord<TEntity['fields']>, TOmit[number]> &
                InferGraphSchemaFields<TFields>
            >
          : TSchema extends ValueDefinition<any, infer TFields>
            ? InferGraphSchemaFields<TFields>
            : TSchema extends GraphArrayDefinition<infer TItem>
              ? InferGraphSchemaValue<TItem>[]
              : TSchema extends GraphNullableDefinition<infer TItem>
                ? InferGraphSchemaValue<TItem> | null
                : TSchema extends GraphOptionalDefinition<infer TItem>
                  ? InferGraphSchemaValue<TItem> | undefined
                  : never;

export type ValueDefinition<
  TName extends string = string,
  TFields extends GraphSchemaFields = GraphSchemaFields,
> = {
  kind: 'value';
  name: TName;
  fields: TFields;
  __value?: InferGraphSchemaFields<TFields>;
};

export type AnyValueDefinition = ValueDefinition<string, GraphSchemaFields>;

export interface GraphArrayDefinition<TItem extends GraphSchemaDefinition = GraphSchemaDefinition> {
  kind: 'schema.array';
  item: TItem;
  __value?: InferGraphSchemaValue<TItem>[];
}

export interface GraphNullableDefinition<
  TItem extends GraphSchemaDefinition = GraphSchemaDefinition,
> {
  kind: 'schema.nullable';
  item: TItem;
  __value?: InferGraphSchemaValue<TItem> | null;
}

export interface GraphOptionalDefinition<
  TItem extends GraphSchemaDefinition = GraphSchemaDefinition,
> {
  kind: 'schema.optional';
  item: TItem;
  __value?: InferGraphSchemaValue<TItem> | undefined;
}

export type EntityViewDefinition<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TName extends string = string,
  TFields extends GraphSchemaFields = GraphSchemaFields,
  TOmit extends readonly (keyof TEntity['fields'] & string)[] = readonly [],
> = {
  kind: 'entity-view';
  name: TName;
  entity: TEntity;
  fields: TFields;
  omit: TOmit;
  __value?: Simplify<
    Omit<InferEntityRecord<TEntity['fields']>, TOmit[number]> & InferGraphSchemaFields<TFields>
  >;
};

export type AnyEntityViewDefinition = EntityViewDefinition<
  AnyEntityDefinition,
  string,
  GraphSchemaFields,
  readonly string[]
>;

export type EntityViewConfig<
  TEntity extends AnyEntityDefinition,
  TFields extends GraphSchemaFields,
  TOmit extends readonly (keyof TEntity['fields'] & string)[],
> = {
  fields?: TFields;
  omit?: TOmit;
};

export type RelationKind = 'hasMany' | 'belongsTo';
export type RelationMappingKind = 'one-to-many' | 'many-to-one';

type EntityMapping<TFields extends FieldDefinitions> = {
  tableName: string;
  fieldColumns: Partial<Record<keyof TFields & string, string>>;
};

export type EntityLocatorDeclaration<TFields extends FieldDefinitions = FieldDefinitions> =
  | (keyof TFields & string)
  | readonly (keyof TFields & string)[]
  | EntityRefLocatorFactory;

export type EntityLocatorDeclarations<TFields extends FieldDefinitions = FieldDefinitions> = Record<
  string,
  EntityLocatorDeclaration<TFields>
>;

export type EntityDisplayDescriptor = {
  primary?: string;
  secondary?: readonly string[];
  search?: readonly string[];
};

export type EntityDisplayMetadata<TFields extends FieldDefinitions = FieldDefinitions> = {
  primary?: keyof TFields & string;
  secondary?: readonly (keyof TFields & string)[];
  search?: readonly (keyof TFields & string)[];
};

export type EntityFreshnessDescriptor = {
  hash?: string;
  updatedAt?: string;
  version?: string;
};

export type EntityFreshnessMetadata<TFields extends FieldDefinitions = FieldDefinitions> = {
  hash?: keyof TFields & string;
  updatedAt?: keyof TFields & string;
  version?: keyof TFields & string;
};

type FieldLocatorFactory<
  TFields extends FieldDefinitions,
  TField extends keyof TFields & string,
> = (value: Extract<InferFieldValue<TFields[TField]>, EntityRefLocatorValue>) => EntityRefLocator;

export type EntityRefLocatorFactories<
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
> = {
  [TName in keyof TLocators]: TLocators[TName] extends keyof TFields & string
    ? FieldLocatorFactory<TFields, TLocators[TName]>
    : TLocators[TName] extends EntityRefLocatorFactory
      ? TLocators[TName]
      : EntityRefLocatorFactory;
};

type ParsedRelationMapping = {
  type: RelationMappingKind;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type RelationDefinition<
  TKind extends RelationKind = RelationKind,
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
> = {
  kind: 'relation';
  relationKind: TKind;
  target: TTarget;
  mapping?: ParsedRelationMapping;
};

type RelationDefinitions = Record<string, RelationDefinition<RelationKind, any>>;

export type EntityDefinition<
  TName extends string = string,
  TFields extends FieldDefinitions = FieldDefinitions,
  TRelations extends RelationDefinitions = RelationDefinitions,
  TLocators extends EntityRefLocatorDeclarations = EntityRefLocatorDeclarations,
> = {
  kind: 'entity';
  name: TName;
  fields: TFields;
  relations: TRelations;
  refLocators: TLocators;
  identityLocatorName?: keyof TLocators & string;
  displayMetadata?: EntityDisplayDescriptor;
  freshnessMetadata?: EntityFreshnessDescriptor;
  mapping?: EntityMapping<TFields>;
  display: (
    metadata: EntityDisplayMetadata<TFields>,
  ) => EntityDefinition<TName, TFields, TRelations, TLocators>;
  freshness: (
    metadata: EntityFreshnessMetadata<TFields>,
  ) => EntityDefinition<TName, TFields, TRelations, TLocators>;
  locators: <TLocatorDeclarations extends EntityLocatorDeclarations<TFields>>(
    locators: TLocatorDeclarations,
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations,
    EntityRefLocatorFactories<TFields, TLocatorDeclarations>
  >;
  identity: <TLocatorName extends keyof TLocators & string>(
    locatorName: TLocatorName,
  ) => EntityDefinition<TName, TFields, TRelations, TLocators>;
  view: (
    viewName: string,
    config?: EntityViewConfig<AnyEntityDefinition, GraphSchemaFields, readonly string[]>,
  ) => AnyEntityViewDefinition;
  hasMany: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'hasMany', TTarget> },
    TLocators
  >;
  belongsTo: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'belongsTo', TTarget> },
    TLocators
  >;
};

export type AnyEntityDefinition = {
  kind: 'entity';
  name: string;
  fields: FieldDefinitions;
  relations: Record<string, RelationDefinition<RelationKind, any>>;
  refLocators: EntityRefLocatorDeclarations;
  identityLocatorName?: string;
  displayMetadata?: EntityDisplayDescriptor;
  freshnessMetadata?: EntityFreshnessDescriptor;
  mapping?: EntityMapping<any>;
};

export type EntityRefLocators<TEntity extends AnyEntityDefinition> = TEntity['refLocators'];

const identifierStringConstraints = {
  minLength: 1,
  maxLength: 200,
} satisfies StringFieldConstraints;

export const field = {
  id: (): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'id',
    stringConstraints: identifierStringConstraints,
  }),
  slug: (): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: identifierStringConstraints,
  }),
  string: (constraints?: StringFieldConstraints): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    ...(constraints ? { stringConstraints: constraints } : {}),
  }),
  nonEmptyString: (
    constraints?: Omit<StringFieldConstraints, 'minLength'>,
  ): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: {
      minLength: 1,
      ...constraints,
    },
  }),
  number: (constraints?: NumberFieldConstraints): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    ...(constraints ? { numberConstraints: constraints } : {}),
  }),
  integer: (constraints?: Omit<NumberFieldConstraints, 'integer'>): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    numberConstraints: {
      integer: true,
      ...constraints,
    },
  }),
  nonNegativeInteger: (): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    numberConstraints: {
      integer: true,
      min: 0,
    },
  }),
  positiveInteger: (
    constraints?: Omit<NumberFieldConstraints, 'integer' | 'min'>,
  ): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    numberConstraints: {
      integer: true,
      min: 1,
      ...constraints,
    },
  }),
  boolean: (): FieldDefinition<boolean> => ({ kind: 'field', fieldType: 'boolean' }),
  date: (): FieldDefinition<Date> => ({ kind: 'field', fieldType: 'date' }),
  json: <TValue = unknown>(): FieldDefinition<TValue> => ({ kind: 'field', fieldType: 'json' }),
  enum: <const TValue extends readonly string[]>(
    values: TValue,
  ): FieldDefinition<TValue[number]> => ({
    kind: 'field',
    fieldType: 'enum',
    enumValues: values,
  }),
  nullable: <TValue>(definition: FieldDefinition<TValue>): FieldDefinition<TValue | null> => ({
    ...definition,
    nullable: true,
  }),
};

const normalizeEntityLocatorDeclaration = <TFields extends FieldDefinitions>(
  declaration: EntityLocatorDeclaration<TFields>,
): EntityRefLocatorFactory => {
  if (typeof declaration === 'function') {
    return declaration;
  }

  if (Array.isArray(declaration)) {
    return Object.assign(
      (...values: readonly EntityRefLocatorValue[]): EntityRefLocator =>
        Object.fromEntries(declaration.map((fieldName, index) => [fieldName, values[index]])),
      {
        fields: declaration,
      },
    );
  }

  return Object.assign(
    (value: EntityRefLocatorValue): EntityRefLocator => ({
      [declaration as string]: value,
    }),
    {
      fields: [declaration as string],
    },
  );
};

const normalizeEntityLocatorDeclarations = <
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
>(
  locators: TLocators,
): EntityRefLocatorFactories<TFields, TLocators> =>
  Object.fromEntries(
    Object.entries(locators).map(([name, declaration]) => [
      name,
      normalizeEntityLocatorDeclaration(declaration),
    ]),
  ) as EntityRefLocatorFactories<TFields, TLocators>;

export const entity = <TName extends string, TFields extends FieldDefinitions>(
  name: TName,
  fields: TFields,
): EntityDefinition<TName, TFields, {}, {}> => {
  const entityDefinition = {
    kind: 'entity' as const,
    name,
    fields,
    relations: {} as RelationDefinitions,
    refLocators: {} as EntityRefLocatorDeclarations,
    identityLocatorName: undefined as string | undefined,
    displayMetadata: undefined as EntityDisplayDescriptor | undefined,
    freshnessMetadata: undefined as EntityFreshnessDescriptor | undefined,
    display(displayMetadata: EntityDisplayMetadata<TFields>) {
      this.displayMetadata = displayMetadata;
      return this as never;
    },
    freshness(freshnessMetadata: EntityFreshnessMetadata<TFields>) {
      this.freshnessMetadata = freshnessMetadata;
      return this as never;
    },
    locators<TLocatorDeclarations extends EntityLocatorDeclarations<TFields>>(
      locators: TLocatorDeclarations,
    ) {
      this.refLocators = normalizeEntityLocatorDeclarations<TFields, TLocatorDeclarations>(
        locators,
      );
      return this as never;
    },
    identity(locatorName: string) {
      if (!(locatorName in this.refLocators)) {
        throw new Error(`Unknown identity locator ${locatorName} on entity ${name}`);
      }

      this.identityLocatorName = locatorName;
      return this as never;
    },
    view(viewName: string, config?: EntityViewConfig<any, GraphSchemaFields, readonly string[]>) {
      const viewDefinition: AnyEntityViewDefinition = {
        kind: 'entity-view',
        name: viewName,
        entity: this as AnyEntityDefinition,
        fields: config?.fields ?? {},
        omit: config?.omit ?? [],
      };

      return viewDefinition;
    },
    hasMany(relationName: string, target: AnyEntityDefinition) {
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'hasMany',
        target,
      };
      return this as never;
    },
    belongsTo(relationName: string, target: AnyEntityDefinition) {
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'belongsTo',
        target,
      };
      return this as never;
    },
  };

  return entityDefinition as EntityDefinition<TName, TFields, {}, {}>;
};

export const value = (name: string, fields: Record<string, unknown>): AnyValueDefinition => ({
  kind: 'value',
  name,
  fields: fields as GraphSchemaFields,
});

export const graphArray = (item: unknown): GraphArrayDefinition => ({
  kind: 'schema.array',
  item: item as GraphSchemaDefinition,
});

export const graphNullable = (item: unknown): GraphNullableDefinition => ({
  kind: 'schema.nullable',
  item: item as GraphSchemaDefinition,
});

export const graphOptional = (item: unknown): GraphOptionalDefinition => ({
  kind: 'schema.optional',
  item: item as GraphSchemaDefinition,
});

export const graphSchema = {
  value,
  array: graphArray,
  nullable: graphNullable,
  optional: graphOptional,
};

export const mapEntity = <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) => ({
  toTable: (
    tableName: string,
    fieldColumns: Partial<Record<keyof TEntity['fields'] & string, string>> = {},
  ) => {
    entityDefinition.mapping = {
      tableName,
      fieldColumns,
    };
    return entityDefinition;
  },
});

const parseTableColumnPath = (path: string) => {
  const [tableName, columnName] = path.split('.');
  if (!tableName || !columnName) {
    throw new Error(`Invalid relation mapping path: ${path}`);
  }

  return { tableName, columnName };
};

export const mapRelation = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
  relationName: keyof TEntity['relations'] & string,
  input: {
    type: RelationMappingKind;
    from: string;
    to: string;
  },
) => {
  const relation = entityDefinition.relations[relationName];
  if (!relation) {
    throw new Error(`Unknown relation ${relationName} on entity ${entityDefinition.name}`);
  }

  relation.mapping = {
    type: input.type,
    ...(() => {
      const from = parseTableColumnPath(input.from);
      const to = parseTableColumnPath(input.to);
      return {
        fromTable: from.tableName,
        fromColumn: from.columnName,
        toTable: to.tableName,
        toColumn: to.columnName,
      };
    })(),
  };

  return relation;
};

export const resolveColumnNameForEntity = (
  entityDefinition: AnyEntityDefinition,
  fieldName: string,
) => entityDefinition.mapping?.fieldColumns[fieldName] ?? fieldName;

export const resolveFieldNameForEntity = (
  entityDefinition: AnyEntityDefinition,
  columnName: string,
) => {
  const explicitField = Object.entries(entityDefinition.mapping?.fieldColumns ?? {}).find(
    ([, mappedColumnName]) => mappedColumnName === columnName,
  )?.[0];

  return explicitField ?? columnName;
};

export const getEntityMapping = (entityDefinition: AnyEntityDefinition) => ({
  tableName: entityDefinition.mapping?.tableName ?? entityDefinition.name,
  columns: Object.fromEntries(
    Object.keys(entityDefinition.fields).map(fieldName => [
      fieldName,
      resolveColumnNameForEntity(entityDefinition, fieldName),
    ]),
  ),
});

export const resolveRelationFields = (
  sourceEntity: AnyEntityDefinition,
  relationName: string,
  relationNode: RelationNodeSpec,
) => {
  const relationDefinition = sourceEntity.relations[relationName] as
    | RelationDefinition<RelationKind, AnyEntityDefinition>
    | undefined;
  const mapping = relationDefinition?.mapping;

  if (!relationDefinition || !mapping) {
    throw new Error(`Relation ${sourceEntity.name}.${relationName} is missing mapping metadata.`);
  }

  const fromEntity =
    mapping.fromTable === getEntityMapping(sourceEntity).tableName
      ? sourceEntity
      : relationNode.entity;
  const toEntity = fromEntity === sourceEntity ? relationNode.entity : sourceEntity;

  return {
    sourceField: resolveFieldNameForEntity(fromEntity, mapping.fromColumn),
    targetField: resolveFieldNameForEntity(toEntity, mapping.toColumn),
  };
};
