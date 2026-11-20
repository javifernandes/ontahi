export * from '../computation/entity-mapping.js';

import type { AnyEntityDefinition, EntityMapping } from '../model/entity/definition.js';
import {
  type AnyFieldDefinition,
  type DefaultedFieldDefinition,
  type DerivedFieldMetadata,
  type FieldDefinition,
  type FieldDefinitions,
  type GeneratedFieldDefinition,
  type GraphSchemaPresentation,
  type IdFieldDefinition,
  type InferEntityRecord,
  type InferFieldValue,
  type NumberFieldConstraints,
  type StringFieldConstraints,
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
import {
  isReferenceFieldDefinition,
  type DeferredEntityReference,
  type ReferenceFieldDefinition,
} from '../model/entity/reference-field.js';
import type { SemanticSelection } from '../model/query/selection-ast.js';
import { createRecursiveEntityView, isRecursiveViewShape } from '../model/query/view.js';
import {
  assertPortableRelationConstraints,
  type RelationDefinition,
  type RelationKind,
  type RelationOptions,
} from '../model/relation/definition.js';

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
  assertModelExpressionProgram,
  collectModelExpressionDependencies,
  type ModelExpressionProgram,
} from './model-expression/program.js';
import {
  graphSchemaExistingReference,
  graphSchemaReference,
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
  type SchemaEntityRef,
} from './ref/index.js';
import type { EntityViewFactory } from './view.js';

export type GraphSchemaLike<TValue = unknown> = {
  kind: string;
  __value?: TValue;
};

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

export interface GraphSchemaFields {
  [fieldName: string]: GraphSchemaLike;
}

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

export type ValueDefinition<
  TName extends string = string,
  TFields extends GraphSchemaFields = GraphSchemaFields,
  TValue = InferGraphSchemaFields<TFields>,
> = {
  kind: 'value';
  name: TName;
  fields: TFields;
  unknownKeys?: 'strip' | 'strict' | 'passthrough';
  derivedFrom?: GraphSchemaDerivation;
  __value?: TValue;
};

export type GraphSchemaDerivation = {
  operation: 'pick';
  source: {
    kind: 'entity' | 'entity-view' | 'value' | 'object';
    name?: string;
  };
  fields: readonly string[];
};

export type AnyValueDefinition = ValueDefinition<string, GraphSchemaFields, unknown>;

export type GraphObjectDefinition<
  TFields extends GraphSchemaFields = GraphSchemaFields,
  TUnknownKeys extends 'strip' | 'strict' | 'passthrough' = 'strip',
> = {
  kind: 'schema.object';
  fields: TFields;
  unknownKeys: TUnknownKeys;
  description?: string;
  __value?: InferGraphSchemaFields<TFields>;
};

export type AnyGraphObjectDefinition = GraphObjectDefinition<
  GraphSchemaFields,
  'strip' | 'strict' | 'passthrough'
>;

export interface GraphArrayDefinition<TItem extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.array';
  item: TItem;
  minItems?: number;
  maxItems?: number;
  __value?: InferGraphSchemaValue<TItem>[];
}

export interface GraphNullableDefinition<TItem extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.nullable';
  item: TItem;
  __value?: InferGraphSchemaValue<TItem> | null;
}

export interface GraphOptionalDefinition<TItem extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.optional';
  item: TItem;
  __value?: InferGraphSchemaValue<TItem> | undefined;
}

export interface GraphLiteralDefinition<TValue = string | number | boolean | null> {
  kind: 'schema.literal';
  value: TValue;
  description?: string;
  __value?: TValue;
}

export interface GraphUnionDefinition<
  TOptions extends readonly GraphSchemaLike[] = readonly GraphSchemaDefinition[],
> {
  kind: 'schema.union';
  options: TOptions;
  discriminator?: string;
  description?: string;
  __value?: InferGraphSchemaValue<TOptions[number]>;
}

export interface GraphRecordDefinition<TValue extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.record';
  value: TValue;
  description?: string;
  __value?: Record<string, InferGraphSchemaValue<TValue>>;
}

export interface GraphDefaultDefinition<TItem extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.default';
  item: TItem;
  defaultValue: Exclude<InferGraphSchemaValue<TItem>, undefined>;
  __value?: Exclude<InferGraphSchemaValue<TItem>, undefined>;
}

export interface GraphTransformDefinition<
  TItem extends GraphSchemaLike = GraphSchemaDefinition,
  TOutput = unknown,
> {
  kind: 'schema.transform';
  item: TItem;
  transform: (value: InferGraphSchemaValue<TItem>) => TOutput;
  __value?: TOutput;
}

export interface GraphRefinementDefinition<TItem extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.refinement';
  item: TItem;
  predicate: (value: InferGraphSchemaValue<TItem>) => boolean;
  message: string;
  path?: readonly (string | number)[];
  rule?: string;
  __value?: InferGraphSchemaValue<TItem>;
}

export interface GraphLazyDefinition<TValue = unknown> {
  kind: 'schema.lazy';
  name: string;
  resolve: () => GraphSchemaDefinition;
  __value?: TValue;
}

export interface GraphNamedDefinition<TItem extends GraphSchemaLike = GraphSchemaDefinition> {
  kind: 'schema.named';
  name: string;
  item: TItem;
  __value?: InferGraphSchemaValue<TItem>;
}

export interface GraphVoidDefinition {
  kind: 'schema.void';
  __value?: void;
}

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

export type ReferenceFieldRelations<TFields extends FieldDefinitions> = {
  [TFieldName in keyof TFields as TFields[TFieldName] extends {
    fieldType: 'reference';
    target: AnyEntityDefinition;
  }
    ? TFieldName
    : never]: TFields[TFieldName] extends {
    fieldType: 'reference';
    target: infer TTarget extends AnyEntityDefinition;
  }
    ? RelationDefinition<
        'belongsTo',
        TTarget,
        TFields[TFieldName] extends { nullable: true } | { optional: true } ? true : false
      >
    : never;
};

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

const identifierStringConstraints = {
  minLength: 1,
  maxLength: 200,
} satisfies StringFieldConstraints;

export type StringFieldInputConstraints = Omit<StringFieldConstraints, 'pattern'> & {
  pattern?: RegExp | StringFieldConstraints['pattern'];
};

const normalizeStringConstraints = (
  constraints?: StringFieldInputConstraints,
): StringFieldConstraints | undefined => {
  if (!constraints) {
    return undefined;
  }

  const { pattern, ...rest } = constraints;

  return {
    ...rest,
    ...(pattern instanceof RegExp
      ? {
          pattern: {
            source: pattern.source,
            ...(pattern.flags ? { flags: pattern.flags } : {}),
          },
        }
      : pattern
        ? { pattern }
        : {}),
  };
};

export const field = {
  named: <const TName extends string, TDefinition extends AnyFieldDefinition>(
    name: TName,
    definition: TDefinition,
  ): TDefinition & { valueType: TName } => {
    const valueType = name.trim();

    if (!valueType) {
      throw new TypeError('Named Field value types require a non-empty name.');
    }
    if (valueType !== name) {
      throw new TypeError('Named Field value types cannot have surrounding whitespace.');
    }
    if (definition.fieldType === 'reference') {
      throw new TypeError('Named Field value types must wrap a scalar Field definition.');
    }

    return { ...definition, valueType } as TDefinition & { valueType: TName };
  },
  id: (): IdFieldDefinition => ({
    kind: 'field',
    fieldType: 'id',
    stringConstraints: identifierStringConstraints,
  }),
  slug: (): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: identifierStringConstraints,
  }),
  string: (constraints?: StringFieldInputConstraints): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    ...(constraints ? { stringConstraints: normalizeStringConstraints(constraints) } : {}),
  }),
  nonEmptyString: (
    constraints?: Omit<StringFieldInputConstraints, 'minLength'>,
  ): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ minLength: 1, ...constraints }),
  }),
  email: (constraints?: Omit<StringFieldInputConstraints, 'format'>): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'email' }),
  }),
  url: (constraints?: Omit<StringFieldInputConstraints, 'format'>): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'url' }),
  }),
  uuid: (constraints?: Omit<StringFieldInputConstraints, 'format'>): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'uuid' }),
  }),
  datetime: (
    constraints?: Omit<StringFieldInputConstraints, 'format'>,
  ): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'datetime' }),
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
  ref: <TTarget extends AnyEntityDefinition>(
    target: TTarget | DeferredEntityReference<TTarget>,
  ): ReferenceFieldDefinition<TTarget> => ({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
  }),
  existingRef: <TTarget extends AnyEntityDefinition>(
    target: TTarget | DeferredEntityReference<TTarget>,
  ): ReferenceFieldDefinition<TTarget> & { mutationRequirement: 'existing' } => ({
    kind: 'field',
    fieldType: 'reference',
    target: target as TTarget,
    mutationRequirement: 'existing',
  }),
  derived: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
    authoring:
      | ModelExpressionProgram
      | ((model: Record<string, any>) => InferFieldValue<TDefinition>),
  ): TDefinition & { derived: DerivedFieldMetadata } => {
    if (definition.fieldType === 'id' || definition.fieldType === 'reference') {
      throw new TypeError('Derived Fields must use a non-identity scalar Field definition.');
    }
    if (typeof authoring === 'function') {
      return { ...definition, derived: {} };
    }

    assertModelExpressionProgram(authoring);
    return {
      ...definition,
      derived: {
        expression: authoring,
        dependencies: collectModelExpressionDependencies(authoring),
      },
    };
  },
  nullable: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
  ): Omit<TDefinition, '__value' | 'nullable'> & {
    nullable: true;
    __value?: InferFieldValue<TDefinition> | null;
  } =>
    ({
      ...definition,
      nullable: true,
    }) as Omit<TDefinition, '__value' | 'nullable'> & {
      nullable: true;
      __value?: InferFieldValue<TDefinition> | null;
    },
  optional: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
  ): Omit<TDefinition, '__value' | 'optional'> & {
    optional: true;
    __value?: InferFieldValue<TDefinition> | undefined;
  } =>
    ({
      ...definition,
      optional: true,
    }) as Omit<TDefinition, '__value' | 'optional'> & {
      optional: true;
      __value?: InferFieldValue<TDefinition> | undefined;
    },
  default: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
    defaultValue: InferFieldValue<TDefinition>,
  ): DefaultedFieldDefinition<TDefinition> => {
    if (
      definition.optional ||
      definition.derived ||
      definition.fieldType === 'id' ||
      definition.fieldType === 'reference'
    ) {
      throw new TypeError(
        'Stored Field defaults require a non-optional, non-derived scalar Field other than id.',
      );
    }
    if (defaultValue === undefined) {
      throw new TypeError('Stored Field defaults cannot be undefined.');
    }

    return { ...definition, defaultValue } as DefaultedFieldDefinition<TDefinition>;
  },
  generated: <TDefinition extends AnyFieldDefinition>(
    definition: TDefinition,
    generator: string,
  ): GeneratedFieldDefinition<TDefinition> => {
    if (
      definition.optional ||
      definition.derived ||
      Object.prototype.hasOwnProperty.call(definition, 'defaultValue') ||
      definition.fieldType === 'reference'
    ) {
      throw new TypeError(
        'Generated stored Fields require a non-optional, non-derived scalar Field without a default.',
      );
    }
    if (generator.trim().length === 0) {
      throw new TypeError('Generated stored Fields require a generator name.');
    }

    return { ...definition, generatedBy: generator } as GeneratedFieldDefinition<TDefinition>;
  },
};

export const entity = <TName extends string, TFields extends FieldDefinitions>(
  name: TName,
  fields: TFields,
): EntityDefinition<
  TName,
  TFields,
  ReferenceFieldRelations<TFields>,
  EntityRefLocatorFactories<TFields, ConventionalEntityLocatorDeclarations<TFields>>
> => {
  const entityFields = Object.fromEntries(
    Object.entries(fields).map(([fieldName, definition]) => {
      if (isReferenceFieldDefinition(definition) && definition.variant)
        throw new TypeError(
          'Variant references are supported as Operation inputs, not stored Reference Fields yet.',
        );
      return [fieldName, isReferenceFieldDefinition(definition) ? { ...definition } : definition];
    }),
  ) as TFields;
  const hasConventionalId =
    entityFields.id?.fieldType === 'id' && !entityFields.id.nullable && !entityFields.id.optional;
  const conventionalLocators = normalizeEntityLocatorDeclarations<
    TFields,
    ConventionalEntityLocatorDeclarations<TFields>
  >((hasConventionalId ? { refById: 'id' } : {}) as ConventionalEntityLocatorDeclarations<TFields>);
  const referenceRelations = Object.fromEntries(
    Object.entries(entityFields).flatMap(([fieldName, definition]) =>
      isReferenceFieldDefinition(definition)
        ? [
            [
              fieldName,
              {
                kind: 'relation' as const,
                relationKind: 'belongsTo' as const,
                target: definition.target,
                sourceField: fieldName,
                nullable: Boolean(definition.nullable || definition.optional),
              },
            ],
          ]
        : [],
    ),
  ) as ReferenceFieldRelations<TFields>;
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

  Object.entries(entityFields).forEach(([fieldName, definition]) => {
    if (!isReferenceFieldDefinition(definition)) return;
    Object.defineProperties(definition, {
      source: { configurable: true, value: entityDefinition },
      fieldName: { configurable: true, value: fieldName },
    });
  });

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
): ValueDefinition<TName, TFields> => ({
  kind: 'value',
  name,
  fields,
  ...(options?.unknownKeys ? { unknownKeys: options.unknownKeys } : {}),
});

export const valueOf = <TValue>(
  name: string,
  fields: GraphSchemaFields,
  options?: { unknownKeys?: 'strip' | 'strict' | 'passthrough' },
): ValueDefinition<string, GraphSchemaFields, TValue> => ({
  kind: 'value',
  name,
  fields,
  ...(options?.unknownKeys ? { unknownKeys: options.unknownKeys } : {}),
});

type GraphSchemaFieldSource = {
  kind: 'entity' | 'entity-view' | 'value' | 'schema.object';
  name?: string;
  fields: GraphSchemaFields;
};

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
  const fields = Object.fromEntries(
    keys.map(key => {
      if (!(key in source.fields)) {
        throw new Error(`Cannot pick unknown field ${key} from ${source.name ?? source.kind}`);
      }

      return [key, source.fields[key]];
    }),
  ) as Pick<TSource['fields'], TKeys[number]>;

  return {
    named: name => ({
      kind: 'value',
      name,
      fields,
      derivedFrom: {
        operation: 'pick',
        source: {
          kind: source.kind === 'schema.object' ? 'object' : source.kind,
          ...(source.name ? { name: source.name } : {}),
        },
        fields: [...keys],
      },
    }),
  };
};

export const graphObject = <
  TFields extends GraphSchemaFields,
  TUnknownKeys extends 'strip' | 'strict' | 'passthrough' = 'strip',
>(
  fields: TFields,
  options?: { unknownKeys?: TUnknownKeys; description?: string },
): GraphObjectDefinition<TFields, TUnknownKeys> => ({
  kind: 'schema.object',
  fields,
  unknownKeys: options?.unknownKeys ?? ('strip' as TUnknownKeys),
  ...(options?.description ? { description: options.description } : {}),
});

export const graphArray = <TItem extends GraphSchemaLike>(
  item: TItem,
  options?: { minItems?: number; maxItems?: number },
): GraphArrayDefinition<TItem> => ({
  kind: 'schema.array',
  item,
  ...(options?.minItems === undefined ? {} : { minItems: options.minItems }),
  ...(options?.maxItems === undefined ? {} : { maxItems: options.maxItems }),
});

export const graphNullable = <TItem extends GraphSchemaLike>(
  item: TItem,
): GraphNullableDefinition<TItem> => ({
  kind: 'schema.nullable',
  item,
});

export const graphOptional = <TItem extends GraphSchemaLike>(
  item: TItem,
): GraphOptionalDefinition<TItem> => ({
  kind: 'schema.optional',
  item,
});

export const graphLiteral = <const TValue extends string | number | boolean | null>(
  literalValue: TValue,
): GraphLiteralDefinition<TValue> => ({
  kind: 'schema.literal',
  value: literalValue,
});

export const graphUnion = <const TOptions extends readonly GraphSchemaLike[]>(
  options: TOptions,
): GraphUnionDefinition<TOptions> => ({
  kind: 'schema.union',
  options,
});

export const graphDiscriminatedUnion = <const TOptions extends readonly GraphSchemaLike[]>(
  discriminator: string,
  options: TOptions,
): GraphUnionDefinition<TOptions> => ({
  kind: 'schema.union',
  discriminator,
  options,
});

export const graphRecord = <TValue extends GraphSchemaLike>(
  recordValue: TValue,
): GraphRecordDefinition<TValue> => ({
  kind: 'schema.record',
  value: recordValue,
});

export const graphDefault = <TItem extends GraphSchemaLike>(
  item: TItem,
  defaultValue: Exclude<InferGraphSchemaValue<TItem>, undefined>,
): GraphDefaultDefinition<TItem> => ({
  kind: 'schema.default',
  item,
  defaultValue,
});

export const graphTransform = <TItem extends GraphSchemaLike, TOutput>(
  item: TItem,
  transform: (value: InferGraphSchemaValue<TItem>) => TOutput,
): GraphTransformDefinition<TItem, TOutput> => ({
  kind: 'schema.transform',
  item,
  transform,
});

export const graphRefine = <TItem extends GraphSchemaLike>(
  item: TItem,
  predicate: (value: InferGraphSchemaValue<TItem>) => boolean,
  options: { message: string; path?: readonly (string | number)[]; rule?: string },
): GraphRefinementDefinition<TItem> => ({
  kind: 'schema.refinement',
  item,
  predicate,
  message: options.message,
  ...(options.path ? { path: options.path } : {}),
  ...(options.rule ? { rule: options.rule } : {}),
});

export const graphLazy = <TValue>(
  name: string,
  resolve: () => GraphSchemaDefinition,
): GraphLazyDefinition<TValue> => ({
  kind: 'schema.lazy',
  name,
  resolve,
});

export const graphNamed = <TItem extends GraphSchemaLike>(
  name: string,
  item: TItem,
): GraphNamedDefinition<TItem> => ({
  kind: 'schema.named',
  name,
  item,
});

export const graphVoid = (): GraphVoidDefinition => ({ kind: 'schema.void' });

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

export const describeGraphSchema = <TSchema extends object>(
  schema: TSchema,
  description: string,
): TSchema => ({ ...schema, description });

export const presentGraphSchema = <TSchema extends object>(
  schema: TSchema,
  presentation: GraphSchemaPresentation,
): TSchema => ({ ...schema, presentation });

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
