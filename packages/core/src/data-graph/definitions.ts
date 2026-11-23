export * from '../computation/entity-mapping.js';

import type { AnyEntityDefinition, EntityMapping } from '../model/entity/definition.js';
import {
  addEntityLocators,
  addEntityRelation,
  bindReferenceFieldSources,
  createEntityDefinitionState,
  setEntityDisplayMetadata,
  setEntityFreshnessMetadata,
  setEntityIdentity,
  type ReferenceFieldRelations,
} from '../model/entity/entity-authoring.js';
export type { ReferenceFieldRelations } from '../model/entity/entity-authoring.js';
import { field } from '../model/entity/field-authoring.js';
import type { FieldDefinitions, InferEntityRecord } from '../model/entity/field.js';
import {
  type ConventionalEntityLocatorDeclarations,
  type EntityLocatorDeclarations,
  type EntityRefLocatorFactories,
} from '../model/entity/locator.js';
import type {
  EntityDisplayDescriptor,
  EntityDisplayMetadata,
  EntityFreshnessDescriptor,
  EntityFreshnessMetadata,
} from '../model/entity/metadata.js';
export type { StringFieldInputConstraints } from '../model/entity/scalar-field-authoring.js';
import { createRecursiveEntityView, isRecursiveViewShape } from '../model/query/view.js';
import {
  type RelationDefinition,
  type RelationKind,
  type RelationOptions,
} from '../model/relation/definition.js';
import type {
  AnyEntityViewDefinition,
  EntityViewConfig,
  GraphArrayDefinition,
  GraphDefaultDefinition,
  GraphLazyDefinition,
  GraphNamedDefinition,
  GraphNullableDefinition,
  GraphObjectDefinition,
  GraphOptionalDefinition,
  GraphRecordDefinition,
  GraphRefinementDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
  GraphSelectionDefinition,
  GraphTransformDefinition,
  GraphUnionDefinition,
  InferGraphSchemaFields,
  InferGraphSchemaValue,
  ValueDefinition,
} from '../model/schema/definition.js';
import {
  defineValue,
  describeGraphSchema,
  graphLiteral,
  graphVoid,
  pickValueFields,
  presentGraphSchema,
  valueArray,
  valueDefault,
  valueLazy,
  valueNamed,
  valueNullable,
  valueOptional,
  valueRecord,
  valueRefine,
  valueTransform,
  valueObject,
  valueUnion,
} from '../value/schema/authoring.js';
import type { GraphSchemaLike, ValueSchemaFieldSource } from '../value/schema/definition.js';

export {
  describeGraphSchema,
  graphLiteral,
  graphVoid,
  presentGraphSchema,
} from '../value/schema/authoring.js';
export type {
  GraphLiteralDefinition,
  GraphSchemaDerivation,
  GraphSchemaLike,
  GraphVoidDefinition,
} from '../value/schema/definition.js';

export type { AnyEntityDefinition, EntityRefLocators } from '../model/entity/definition.js';
export * from '../model/relation/definition.js';

export type {
  EntityDisplayDescriptor,
  EntityDisplayMetadata,
  EntityFreshnessDescriptor,
  EntityFreshnessMetadata,
} from '../model/entity/metadata.js';
export {
  isDerivedFieldDefinition,
  type AnyFieldDefinition,
  type DefaultedFieldDefinition,
  type DerivedFieldDefinition,
  type DerivedFieldMetadata,
  type FieldDefinition,
  type FieldDefinitions,
  type GeneratedFieldDefinition,
  type GraphSchemaPresentation,
  type IdFieldDefinition,
  type InferEntityMutationRecord,
  type InferEntityRecord,
  type InferFieldValue,
  type NumberFieldConstraints,
  type StoredFieldName,
  type StringFieldConstraints,
  type WritableStoredFieldName,
} from '../model/entity/field.js';
export type {
  ConventionalEntityLocatorDeclarations,
  EffectiveEntityLocatorDeclarations,
  EntityLocatorDeclaration,
  EntityLocatorDeclarations,
  EntityRefLocatorFactories,
} from '../model/entity/locator.js';
export {
  isReferenceFieldDefinition,
  type AnyReferenceFieldDefinition,
  type DeferredEntityReference,
  type ReferenceFieldDefinition,
} from '../model/entity/reference-field.js';

import { EntityVariant, type EntityVariantDiscriminator } from './entity-variant.js';
import {
  graphSchemaExistingReference,
  graphSchemaReference,
  type EntityRefLocatorDeclarations,
} from './ref/index.js';
import type { EntityViewFactory } from './view.js';

export type {
  AnyEntityViewDefinition,
  AnyGraphObjectDefinition,
  AnyValueDefinition,
  EntityViewConfig,
  EntityViewDefinition,
  GraphArrayDefinition,
  GraphDefaultDefinition,
  GraphLazyDefinition,
  GraphNamedDefinition,
  GraphNullableDefinition,
  GraphObjectDefinition,
  GraphOptionalDefinition,
  GraphRecordDefinition,
  GraphRefinementDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
  GraphSelectionDefinition,
  GraphTransformDefinition,
  GraphUnionDefinition,
  InferGraphSchemaFields,
  InferGraphSchemaValue,
  ValueDefinition,
} from '../model/schema/definition.js';

type RelationDefinitions = Record<string, RelationDefinition<RelationKind, any>>;

export type EntityRelationsFromFields<
  TFields extends FieldDefinitions,
  TRelations extends RelationDefinitions = {},
> = Omit<ReferenceFieldRelations<TFields>, keyof TRelations> & TRelations;

export type EntityReferenceFieldSource<
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
};

export type BindReferenceFieldSources<
  TSource extends EntityReferenceFieldSource,
  TFields extends FieldDefinitions,
> = {
  [TFieldName in keyof TFields]: TFields[TFieldName] extends {
    fieldType: 'reference';
    target: infer TTarget extends AnyEntityDefinition;
  }
    ? TFields[TFieldName] & {
        source: TSource;
        fieldName: TFieldName & string;
        target: TTarget;
      }
    : TFields[TFieldName];
};

export type EntityDefinition<
  TName extends string = string,
  TFields extends FieldDefinitions = FieldDefinitions,
  TRelations extends RelationDefinitions = RelationDefinitions,
  TLocators extends EntityRefLocatorDeclarations = EntityRefLocatorDeclarations,
> = {
  kind: 'entity';
  name: TName;
  fields: BindReferenceFieldSources<
    EntityReferenceFieldSource<TName, TFields, TRelations, TLocators>,
    TFields
  >;
  __value?: InferEntityRecord<TFields>;
  relations: TRelations;
  refLocators: TLocators;
  identityLocatorName?: keyof TLocators & string;
  displayMetadata?: EntityDisplayDescriptor;
  freshnessMetadata?: EntityFreshnessDescriptor;
  mapping?: EntityMapping<TFields>;
  variant: <
    TEntity extends AnyEntityDefinition,
    const TVariantName extends string,
    const TDiscriminator extends EntityVariantDiscriminator<TEntity>,
  >(
    this: TEntity,
    name: TVariantName,
    options: { discriminator: TDiscriminator },
  ) => EntityVariant<TEntity, TVariantName, TDiscriminator>;
  one: () => GraphSelectionDefinition<
    EntityDefinition<TName, TFields, TRelations, TLocators>,
    'one'
  >;
  many: () => GraphSelectionDefinition<
    EntityDefinition<TName, TFields, TRelations, TLocators>,
    'many'
  >;
  array: () => GraphArrayDefinition<EntityDefinition<TName, TFields, TRelations, TLocators>>;
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
    Omit<TLocators, keyof TLocatorDeclarations> &
      EntityRefLocatorFactories<TFields, TLocatorDeclarations>
  >;
  identity: <TLocatorName extends keyof TLocators & string>(
    locatorName: TLocatorName,
  ) => EntityDefinition<TName, TFields, TRelations, TLocators>;
  view: EntityViewFactory<
    EntityDefinition<TName, TFields, TRelations, TLocators>,
    BindReferenceFieldSources<
      EntityReferenceFieldSource<TName, TFields, TRelations, TLocators>,
      TFields
    >,
    TRelations
  >;
  hasMany: <
    TRelationName extends string,
    TTarget extends AnyEntityDefinition,
    const TOptions extends Omit<RelationOptions, 'via' | 'onDelete'> & {
      via?: keyof TTarget['fields'] & string;
      onDelete?: 'cascade';
    } = {},
  >(
    relationName: TRelationName,
    target: TTarget,
    options?: TOptions,
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & {
      [TKey in TRelationName]: RelationDefinition<'hasMany', TTarget> &
        (TOptions extends { ordered: true } ? { ordered: true } : {});
    },
    TLocators
  >;
  belongsTo: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
    options?: Omit<RelationOptions, 'via' | 'ordered' | 'onDelete'> & {
      via?: keyof TFields & string;
    },
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'belongsTo', TTarget> },
    TLocators
  >;
  manyToMany: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
    options?: Omit<RelationOptions, 'via' | 'ordered' | 'onDelete'> & { onDelete?: 'detach' },
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'manyToMany', TTarget> },
    TLocators
  >;
};

export { field } from '../model/entity/field-authoring.js';

export const entity = <TName extends string, TFields extends FieldDefinitions>(
  name: TName,
  fields: TFields,
): EntityDefinition<
  TName,
  TFields,
  ReferenceFieldRelations<TFields>,
  EntityRefLocatorFactories<TFields, ConventionalEntityLocatorDeclarations<TFields>>
> => {
  const state = createEntityDefinitionState(name, fields);
  const entityFields = state.fields;
  const conventionalLocators = state.refLocators;
  const referenceRelations = state.relations;
  const hasConventionalId = state.identityLocatorName === 'refById';
  const entityDefinition = {
    kind: 'entity' as const,
    name,
    fields: entityFields,
    relations: referenceRelations as RelationDefinitions,
    refLocators: conventionalLocators as EntityRefLocatorDeclarations,
    identityLocatorName: (hasConventionalId ? 'refById' : undefined) as string | undefined,
    displayMetadata: undefined as EntityDisplayDescriptor | undefined,
    freshnessMetadata: undefined as EntityFreshnessDescriptor | undefined,
    variant<
      TVariantName extends string,
      TDiscriminator extends EntityVariantDiscriminator<AnyEntityDefinition>,
    >(variantName: TVariantName, options: { discriminator: TDiscriminator }) {
      return new EntityVariant(this, variantName, options);
    },
    one() {
      return { kind: 'schema.selection' as const, entity: this, cardinality: 'one' as const };
    },
    many() {
      return { kind: 'schema.selection' as const, entity: this, cardinality: 'many' as const };
    },
    array() {
      return { kind: 'schema.array' as const, item: this };
    },
    display(displayMetadata: EntityDisplayMetadata<TFields>) {
      setEntityDisplayMetadata(this, displayMetadata);
      return this as never;
    },
    freshness(freshnessMetadata: EntityFreshnessMetadata<TFields>) {
      setEntityFreshnessMetadata(this, freshnessMetadata);
      return this as never;
    },
    locators<TLocatorDeclarations extends EntityLocatorDeclarations<TFields>>(
      locators: TLocatorDeclarations,
    ) {
      addEntityLocators(this, locators);
      return this as never;
    },
    identity(locatorName: string) {
      setEntityIdentity(this, locatorName);
      return this as never;
    },
    view(viewName: string, config?: unknown) {
      if (isRecursiveViewShape(config)) {
        return createRecursiveEntityView(this as AnyEntityDefinition, viewName, config as never);
      }

      const legacyConfig = config as
        | EntityViewConfig<any, GraphSchemaFields, readonly string[]>
        | undefined;

      const viewDefinition: AnyEntityViewDefinition = {
        kind: 'entity-view',
        name: viewName,
        entity: this as AnyEntityDefinition,
        fields: legacyConfig?.fields ?? {},
        omit: legacyConfig?.omit ?? [],
      };

      return viewDefinition;
    },
    hasMany(relationName: string, target: AnyEntityDefinition, options?: RelationOptions) {
      addEntityRelation(this, relationName, 'hasMany', target, options);
      return this as never;
    },
    belongsTo(
      relationName: string,
      target: AnyEntityDefinition,
      options?: Omit<RelationOptions, 'ordered' | 'onDelete'>,
    ) {
      addEntityRelation(this, relationName, 'belongsTo', target, options);
      return this as never;
    },
    manyToMany(
      relationName: string,
      target: AnyEntityDefinition,
      options?: Omit<RelationOptions, 'via' | 'ordered' | 'onDelete'> & {
        onDelete?: 'detach';
      },
    ) {
      addEntityRelation(this, relationName, 'manyToMany', target, options);
      return this as never;
    },
  };

  bindReferenceFieldSources(entityFields, entityDefinition as unknown as AnyEntityDefinition);

  return entityDefinition as unknown as EntityDefinition<
    TName,
    TFields,
    ReferenceFieldRelations<TFields>,
    EntityRefLocatorFactories<TFields, ConventionalEntityLocatorDeclarations<TFields>>
  >;
};

export const value = <TName extends string, TFields extends GraphSchemaFields>(
  name: TName,
  fields: TFields,
  options?: { unknownKeys?: 'strip' | 'strict' | 'passthrough' },
): ValueDefinition<TName, TFields> =>
  defineValue<TName, TFields, InferGraphSchemaFields<TFields>>(name, fields, options);

export const valueOf = <TValue>(
  name: string,
  fields: GraphSchemaFields,
  options?: { unknownKeys?: 'strip' | 'strict' | 'passthrough' },
): ValueDefinition<string, GraphSchemaFields, TValue> =>
  defineValue<string, GraphSchemaFields, TValue>(name, fields, options);

type GraphSchemaFieldSource = ValueSchemaFieldSource & { fields: GraphSchemaFields };

export type GraphSchemaPickBuilder<
  TSource extends GraphSchemaFieldSource,
  TKeys extends readonly (keyof TSource['fields'] & string)[],
> = {
  named: <TName extends string>(
    name: TName,
  ) => ValueDefinition<TName, Pick<TSource['fields'], TKeys[number]>>;
};

export const graphPick = <
  TSource extends GraphSchemaFieldSource,
  const TKeys extends readonly (keyof TSource['fields'] & string)[],
>(
  source: TSource,
  keys: TKeys,
): GraphSchemaPickBuilder<TSource, TKeys> => {
  return pickValueFields<
    TSource,
    TKeys,
    InferGraphSchemaFields<Pick<TSource['fields'], TKeys[number]>>
  >(source, keys);
};

export const graphObject = <
  TFields extends GraphSchemaFields,
  TUnknownKeys extends 'strip' | 'strict' | 'passthrough' = 'strip',
>(
  fields: TFields,
  options?: { unknownKeys?: TUnknownKeys; description?: string },
): GraphObjectDefinition<TFields, TUnknownKeys> =>
  valueObject<TFields, TUnknownKeys, InferGraphSchemaFields<TFields>>(fields, options);

export const graphArray = <TItem extends GraphSchemaLike>(
  item: TItem,
  options?: { minItems?: number; maxItems?: number },
): GraphArrayDefinition<TItem> => valueArray<TItem, InferGraphSchemaValue<TItem>>(item, options);

export const graphNullable = <TItem extends GraphSchemaLike>(
  item: TItem,
): GraphNullableDefinition<TItem> => valueNullable<TItem, InferGraphSchemaValue<TItem>>(item);

export const graphOptional = <TItem extends GraphSchemaLike>(
  item: TItem,
): GraphOptionalDefinition<TItem> => valueOptional<TItem, InferGraphSchemaValue<TItem>>(item);

export const graphUnion = <const TOptions extends readonly GraphSchemaLike[]>(
  options: TOptions,
): GraphUnionDefinition<TOptions> =>
  valueUnion<TOptions, InferGraphSchemaValue<TOptions[number]>>(options);

export const graphDiscriminatedUnion = <const TOptions extends readonly GraphSchemaLike[]>(
  discriminator: string,
  options: TOptions,
): GraphUnionDefinition<TOptions> =>
  valueUnion<TOptions, InferGraphSchemaValue<TOptions[number]>>(options, discriminator);

export const graphRecord = <TValue extends GraphSchemaLike>(
  recordValue: TValue,
): GraphRecordDefinition<TValue> => valueRecord<TValue, InferGraphSchemaValue<TValue>>(recordValue);

export const graphDefault = <TItem extends GraphSchemaLike>(
  item: TItem,
  defaultValue: Exclude<InferGraphSchemaValue<TItem>, undefined>,
): GraphDefaultDefinition<TItem> =>
  valueDefault<TItem, InferGraphSchemaValue<TItem>>(item, defaultValue);

export const graphTransform = <TItem extends GraphSchemaLike, TOutput>(
  item: TItem,
  transform: (value: InferGraphSchemaValue<TItem>) => TOutput,
): GraphTransformDefinition<TItem, TOutput> =>
  valueTransform<TItem, InferGraphSchemaValue<TItem>, TOutput>(item, transform);

export const graphRefine = <TItem extends GraphSchemaLike>(
  item: TItem,
  predicate: (value: InferGraphSchemaValue<TItem>) => boolean,
  options: { message: string; path?: readonly (string | number)[]; rule?: string },
): GraphRefinementDefinition<TItem> =>
  valueRefine<TItem, InferGraphSchemaValue<TItem>>(item, predicate, options);

export const graphLazy = <TValue>(
  name: string,
  resolve: () => GraphSchemaDefinition,
): GraphLazyDefinition<TValue> => valueLazy<GraphSchemaDefinition, TValue>(name, resolve);

export const graphNamed = <TItem extends GraphSchemaLike>(
  name: string,
  item: TItem,
): GraphNamedDefinition<TItem> => valueNamed<TItem, InferGraphSchemaValue<TItem>>(name, item);

export const graphSelection = <
  TEntity extends AnyEntityDefinition,
  const TCardinality extends 'one' | 'many' = 'many',
>(
  entityDefinition: TEntity,
  options?: { cardinality?: TCardinality; entities?: readonly AnyEntityDefinition[] },
): GraphSelectionDefinition<TEntity, TCardinality> => ({
  kind: 'schema.selection',
  entity: entityDefinition,
  cardinality: options?.cardinality ?? ('many' as TCardinality),
  ...(options?.entities ? { entities: options.entities } : {}),
});

export const graphSchema = {
  value,
  valueOf,
  pick: graphPick,
  object: graphObject,
  array: graphArray,
  nullable: graphNullable,
  optional: graphOptional,
  literal: graphLiteral,
  union: graphUnion,
  discriminatedUnion: graphDiscriminatedUnion,
  record: graphRecord,
  default: graphDefault,
  transform: graphTransform,
  refine: graphRefine,
  lazy: graphLazy,
  named: graphNamed,
  void: graphVoid,
  selection: graphSelection,
  describe: describeGraphSchema,
  present: presentGraphSchema,
  string: field.string,
  nonEmptyString: field.nonEmptyString,
  email: field.email,
  url: field.url,
  uuid: field.uuid,
  datetime: field.datetime,
  id: field.id,
  slug: field.slug,
  number: field.number,
  integer: field.integer,
  nonNegativeInteger: field.nonNegativeInteger,
  positiveInteger: field.positiveInteger,
  boolean: field.boolean,
  date: field.date,
  json: field.json,
  enum: field.enum,
  ref: graphSchemaReference,
  existingRef: graphSchemaExistingReference,
};
