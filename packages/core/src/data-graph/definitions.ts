export * from '../computation/entity-mapping.js';

import type { AnyEntityDefinition, EntityMapping } from '../model/entity/definition.js';
import {
  bindReferenceFieldSources,
  createEntityDefinitionState,
  type ReferenceFieldRelations,
} from '../model/entity/entity-authoring.js';
export type { ReferenceFieldRelations } from '../model/entity/entity-authoring.js';
import { field } from '../model/entity/field-authoring.js';
import type {
  AnyFieldDefinition,
  FieldDefinitions,
  InferEntityRecord,
} from '../model/entity/field.js';
import {
  normalizeEntityLocatorDeclarations,
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
import { type ReferenceFieldDefinition } from '../model/entity/reference-field.js';
export type { StringFieldInputConstraints } from '../model/entity/scalar-field-authoring.js';
import type { SemanticSelection } from '../model/query/selection-ast.js';
import { createRecursiveEntityView, isRecursiveViewShape } from '../model/query/view.js';
import {
  assertPortableRelationConstraints,
  type RelationDefinition,
  type RelationKind,
  type RelationOptions,
} from '../model/relation/definition.js';
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
import type {
  GraphLiteralDefinition,
  GraphSchemaLike,
  GraphVoidDefinition,
  PortableObjectDefinition,
  PortableValueDefinition,
  ValueArrayDefinition,
  ValueDefaultDefinition,
  ValueLazyDefinition,
  ValueNamedDefinition,
  ValueNullableDefinition,
  ValueOptionalDefinition,
  ValueRecordDefinition,
  ValueRefinementDefinition,
  ValueSchemaFieldSource,
  ValueSchemaFields,
  ValueTransformDefinition,
  ValueUnionDefinition,
} from '../value/schema/definition.js';

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
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
  type SchemaEntityRef,
} from './ref/index.js';
import type { EntityViewFactory } from './view.js';

export type GraphSchemaDefinition =
  | AnyFieldDefinition
  | AnyEntityDefinition
  | AnyEntityViewDefinition
  | AnyValueDefinition
  | AnyGraphObjectDefinition
  | GraphArrayDefinition
  | GraphNullableDefinition
  | GraphOptionalDefinition
  | GraphLiteralDefinition
  | GraphUnionDefinition
  | GraphRecordDefinition
  | GraphDefaultDefinition
  | GraphTransformDefinition
  | GraphRefinementDefinition
  | GraphLazyDefinition
  | GraphNamedDefinition
  | GraphSelectionDefinition
  | GraphVoidDefinition;

export interface GraphSchemaFields extends ValueSchemaFields {}

type OptionalGraphSchemaFieldKeys<TFields extends GraphSchemaFields> = {
  [TKey in keyof TFields]: TFields[TKey] extends { kind: 'schema.optional' } | { optional: true }
    ? TKey
    : never;
}[keyof TFields];

type RequiredGraphSchemaFieldKeys<TFields extends GraphSchemaFields> = Exclude<
  keyof TFields,
  OptionalGraphSchemaFieldKeys<TFields>
>;

type InferGraphSchemaFields<TFields extends GraphSchemaFields> = Simplify<
  {
    [TKey in RequiredGraphSchemaFieldKeys<TFields>]: InferGraphSchemaValue<TFields[TKey]>;
  } & {
    [TKey in OptionalGraphSchemaFieldKeys<TFields>]?: Exclude<
      InferGraphSchemaValue<TFields[TKey]>,
      undefined
    >;
  }
>;

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

type GraphSchemaReferenceResolution<TSchema> = TSchema extends {
  readonly __graphSchemaRef?: { readonly resolution: infer TResolution };
}
  ? TResolution
  : never;

type GraphSchemaReferenceRequirement<TSchema> = TSchema extends {
  readonly __graphSchemaRef?: { readonly requirement: infer TRequirement };
}
  ? TRequirement
  : 'portable';

export type InferGraphSchemaValue<TSchema extends GraphSchemaLike> =
  TSchema extends ReferenceFieldDefinition<infer TTarget>
    ? SchemaEntityRef<
        TTarget['name'],
        EntityRefLocator,
        TTarget,
        GraphSchemaReferenceResolution<TSchema>,
        GraphSchemaReferenceRequirement<TSchema>
      >
    : TSchema extends { __value?: infer TValue }
      ? TValue
      : never;

export interface ValueDefinition<
  TName extends string = string,
  TFields extends GraphSchemaFields = GraphSchemaFields,
  TValue = InferGraphSchemaFields<TFields>,
> extends PortableValueDefinition<TName, TFields, TValue> {}

export type AnyValueDefinition = ValueDefinition<string, GraphSchemaFields, unknown>;

export interface GraphObjectDefinition<
  TFields extends GraphSchemaFields = GraphSchemaFields,
  TUnknownKeys extends 'strip' | 'strict' | 'passthrough' = 'strip',
> extends PortableObjectDefinition<TFields, TUnknownKeys, InferGraphSchemaFields<TFields>> {}

export type AnyGraphObjectDefinition = GraphObjectDefinition<
  GraphSchemaFields,
  'strip' | 'strict' | 'passthrough'
>;

export interface GraphArrayDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueArrayDefinition<TItem, InferGraphSchemaValue<TItem>> {}

export interface GraphNullableDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueNullableDefinition<TItem, InferGraphSchemaValue<TItem>> {}

export interface GraphOptionalDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueOptionalDefinition<TItem, InferGraphSchemaValue<TItem>> {}

export interface GraphUnionDefinition<
  TOptions extends readonly GraphSchemaLike[] = readonly GraphSchemaDefinition[],
> extends ValueUnionDefinition<TOptions, InferGraphSchemaValue<TOptions[number]>> {}

export interface GraphRecordDefinition<
  TValue extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueRecordDefinition<TValue, InferGraphSchemaValue<TValue>> {}

export interface GraphDefaultDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueDefaultDefinition<TItem, InferGraphSchemaValue<TItem>> {}

export interface GraphTransformDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
  TOutput = unknown,
> extends ValueTransformDefinition<TItem, InferGraphSchemaValue<TItem>, TOutput> {}

export interface GraphRefinementDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueRefinementDefinition<TItem, InferGraphSchemaValue<TItem>> {}

export interface GraphLazyDefinition<TValue = unknown> extends ValueLazyDefinition<
  GraphSchemaDefinition,
  TValue
> {}

export interface GraphNamedDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
> extends ValueNamedDefinition<TItem, InferGraphSchemaValue<TItem>> {}

export interface GraphSelectionDefinition<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TCardinality extends 'one' | 'many' = 'one' | 'many',
> {
  kind: 'schema.selection';
  entity: TEntity;
  cardinality: TCardinality;
  /** Receiver-owned model context for source-relative Selection validation. Not wire data. */
  entities?: readonly AnyEntityDefinition[];
  __value?: SemanticSelection<TEntity['name'], TEntity, TCardinality>;
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
      this.refLocators = {
        ...this.refLocators,
        ...normalizeEntityLocatorDeclarations<TFields, TLocatorDeclarations>(locators),
      };
      return this as never;
    },
    identity(locatorName: string) {
      if (!(locatorName in this.refLocators)) {
        throw new Error(`Unknown identity locator ${locatorName} on entity ${name}`);
      }

      this.identityLocatorName = locatorName;
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
      if (options?.onDelete && options.onDelete !== 'cascade') {
        throw new Error('hasMany Relations only support onDelete: cascade.');
      }
      assertPortableRelationConstraints(options?.constraints);
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'hasMany',
        target,
        ...(options?.via ? { targetField: options.via } : {}),
        ...(options?.ordered ? { ordered: true as const } : {}),
        ...(options?.onDelete ? { onDelete: options.onDelete } : {}),
        ...(options?.constraints ? { constraints: options.constraints } : {}),
      };
      return this as never;
    },
    belongsTo(
      relationName: string,
      target: AnyEntityDefinition,
      options?: Omit<RelationOptions, 'ordered' | 'onDelete'>,
    ) {
      assertPortableRelationConstraints(options?.constraints);
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'belongsTo',
        target,
        ...(options?.via ? { sourceField: options.via } : {}),
        ...(options?.constraints ? { constraints: options.constraints } : {}),
      };
      return this as never;
    },
    manyToMany(
      relationName: string,
      target: AnyEntityDefinition,
      options?: Omit<RelationOptions, 'via' | 'ordered' | 'onDelete'> & {
        onDelete?: 'detach';
      },
    ) {
      if (options?.onDelete && options.onDelete !== 'detach') {
        throw new Error('manyToMany Relations only support onDelete: detach.');
      }
      assertPortableRelationConstraints(options?.constraints);
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'manyToMany',
        target,
        ...(options?.onDelete ? { onDelete: options.onDelete } : {}),
        ...(options?.constraints ? { constraints: options.constraints } : {}),
      };
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
