import { isJsonValue, type JsonValue } from '../value/json.js';

import type { RelationNodeSpec } from './query.js';
import {
  getEntityIdentityLocator,
  type AnyEntityRef,
  type EntityRef,
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
  type EntityRefLocatorFactory,
  type EntityRefLocatorValue,
} from './ref.js';
import type { SemanticSelection } from './selection-ast.js';
import { createRecursiveEntityView, isRecursiveViewShape, type EntityViewFactory } from './view.js';

export type FieldDefinition<TValue> = {
  kind: 'field';
  fieldType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum' | 'reference';
  enumValues?: readonly string[];
  stringConstraints?: StringFieldConstraints;
  numberConstraints?: NumberFieldConstraints;
  nullable?: true;
  optional?: true;
  description?: string;
  presentation?: GraphSchemaPresentation;
  __value?: TValue;
};

export type IdFieldDefinition = FieldDefinition<string> & {
  fieldType: 'id';
  nullable?: never;
  optional?: never;
};

export type DeferredEntityReference<TEntity extends AnyEntityDefinition> = {
  readonly kind: 'ontahi.entity-ref';
  readonly __entity?: TEntity;
};

export type ReferenceFieldDefinition<TTarget extends AnyEntityDefinition = AnyEntityDefinition> =
  FieldDefinition<EntityRef<TTarget['name']>> & {
    fieldType: 'reference';
    target: TTarget;
    source?: AnyEntityDefinition;
    fieldName?: string;
  };

export type AnyReferenceFieldDefinition = ReferenceFieldDefinition<AnyEntityDefinition>;

export type StringFieldConstraints = {
  minLength?: number;
  maxLength?: number;
  trim?: true;
  exclude?: {
    values: readonly string[];
    caseInsensitive?: true;
  };
  pattern?: {
    source: string;
    flags?: string;
  };
  format?: 'email' | 'url' | 'uuid' | 'datetime';
  messages?: {
    required?: string;
    minLength?: string;
    maxLength?: string;
    exclude?: string;
    pattern?: string;
    format?: string;
  };
};

export type NumberFieldConstraints = {
  coerce?: true;
  integer?: true;
  min?: number;
  max?: number;
  multipleOf?: number;
  messages?: {
    required?: string;
    integer?: string;
    min?: string;
    max?: string;
    multipleOf?: string;
  };
};

export type GraphSchemaPresentation = {
  booleanLabels?: {
    true?: string;
    false?: string;
    unset?: string;
  };
  control?: 'text' | 'textarea' | 'password' | 'email' | 'url';
};

export type FieldDefinitions = Record<string, FieldDefinition<unknown>>;
export type AnyFieldDefinition = FieldDefinition<unknown>;

export const isReferenceFieldDefinition = (
  definition: AnyFieldDefinition,
): definition is AnyReferenceFieldDefinition => definition.fieldType === 'reference';

export type InferFieldValue<TField extends AnyFieldDefinition> = TField extends {
  __value?: infer TValue;
}
  ? TValue
  : never;

export type InferEntityRecord<TFields extends FieldDefinitions> = {
  [TKey in keyof TFields]: InferFieldValue<TFields[TKey]>;
};

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

export type InferGraphSchemaValue<TSchema extends GraphSchemaLike> = TSchema extends {
  __value?: infer TValue;
}
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

export type RelationKind = 'hasMany' | 'belongsTo' | 'manyToMany';
export type RelationMappingKind = 'one-to-many' | 'many-to-one' | 'many-to-many';

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

export type ConventionalEntityLocatorDeclarations<TFields extends FieldDefinitions> =
  TFields extends { readonly id: IdFieldDefinition } ? { readonly refById: 'id' } : {};

export type EffectiveEntityLocatorDeclarations<
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
> = Omit<ConventionalEntityLocatorDeclarations<TFields>, keyof TLocators> & TLocators;

export type EntityDisplayDescriptor = {
  primary?: string;
  secondary?: readonly string[];
  search?: readonly string[];
};

type EntityDisplayFieldPath<TFields extends FieldDefinitions, TRelationPath extends string> =
  | (keyof TFields & string)
  | TRelationPath;

export type EntityDisplayMetadata<
  TFields extends FieldDefinitions = FieldDefinitions,
  TRelationPath extends string = `${string}.${string}`,
> = {
  primary?: EntityDisplayFieldPath<TFields, TRelationPath>;
  secondary?: readonly EntityDisplayFieldPath<TFields, TRelationPath>[];
  search?: readonly EntityDisplayFieldPath<TFields, TRelationPath>[];
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
> = ((
  value: Extract<InferFieldValue<TFields[TField]>, EntityRefLocatorValue>,
) => EntityRefLocator) & { fields: readonly [TField] };

type CompositeFieldLocatorFactory<
  TFields extends FieldDefinitions,
  TFieldNames extends readonly (keyof TFields & string)[],
> = ((
  ...values: {
    [TIndex in keyof TFieldNames]: TFieldNames[TIndex] extends keyof TFields
      ? Extract<InferFieldValue<TFields[TFieldNames[TIndex]]>, EntityRefLocatorValue>
      : never;
  }
) => EntityRefLocator) & { fields: TFieldNames };

export type EntityRefLocatorFactories<
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
> = {
  [TName in keyof TLocators]: TLocators[TName] extends keyof TFields & string
    ? FieldLocatorFactory<TFields, TLocators[TName]>
    : TLocators[TName] extends readonly (keyof TFields & string)[]
      ? CompositeFieldLocatorFactory<TFields, TLocators[TName]>
      : TLocators[TName] extends EntityRefLocatorFactory
        ? TLocators[TName]
        : EntityRefLocatorFactory;
};

export type DirectRelationMapping = {
  type: 'one-to-many' | 'many-to-one';
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type ManyToManyRelationMapping = {
  type: 'many-to-many';
  fromTable: string;
  fromColumn: string;
  throughTable: string;
  throughFromColumn: string;
  throughToColumn: string;
  toTable: string;
  toColumn: string;
};

export type ParsedRelationMapping = DirectRelationMapping | ManyToManyRelationMapping;

export type RelationConstraintRejection = {
  readonly version: 1;
  readonly code: string;
  readonly message: string;
  readonly parameters?: Readonly<Record<string, string | number | boolean | null>>;
};

export type PortableSelectionPredicate =
  | {
      readonly kind: 'predicate';
      readonly operator: 'eq' | 'lte' | 'lt' | 'gte' | 'gt';
      readonly fieldName: string;
      readonly value: JsonValue;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'in';
      readonly fieldName: string;
      readonly values: readonly JsonValue[];
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'isNull';
      readonly fieldName: string;
    };

export type PortableSelectionExpression =
  | PortableSelectionPredicate
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'references'; readonly refs: readonly AnyEntityRef[] }
  | { readonly kind: 'and' | 'or'; readonly operands: readonly PortableSelectionExpression[] }
  | { readonly kind: 'not'; readonly operand: PortableSelectionExpression };

export type RelationParticipantSelectionConstraint = {
  readonly kind: 'participant-selection';
  /** Participant is relative to the Relation declaration, not storage orientation. */
  readonly participant: 'source' | 'target';
  readonly selection: PortableSelectionExpression;
  readonly rejection: RelationConstraintRejection;
};

export type RelationConstraint = RelationParticipantSelectionConstraint;

export const assertPortableRelationConstraints = (
  constraints: readonly RelationConstraint[] | undefined,
) => {
  if (constraints && !constraints.every(isJsonValue)) {
    throw new Error('Relation constraints must be JSON-safe.');
  }
};

export type RelationOptions = {
  via?: string;
  constraints?: readonly RelationConstraint[];
};

export type RelationDefinition<
  TKind extends RelationKind = RelationKind,
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
  TNullable extends boolean = boolean,
> = {
  kind: 'relation';
  relationKind: TKind;
  target: TTarget;
  sourceField?: string;
  targetField?: string;
  nullable?: TNullable;
  mapping?: ParsedRelationMapping;
  constraints?: readonly RelationConstraint[];
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
  hasMany: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
    options?: Omit<RelationOptions, 'via'> & { via?: keyof TTarget['fields'] & string },
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'hasMany', TTarget> },
    TLocators
  >;
  belongsTo: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
    options?: Omit<RelationOptions, 'via'> & { via?: keyof TFields & string },
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'belongsTo', TTarget> },
    TLocators
  >;
  manyToMany: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
  ) => EntityDefinition<
    TName,
    TFields,
    TRelations & { [TKey in TRelationName]: RelationDefinition<'manyToMany', TTarget> },
    TLocators
  >;
};

export type AnyEntityDefinition = {
  kind: 'entity';
  name: string;
  fields: FieldDefinitions;
  __value?: Record<string, unknown>;
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
): EntityDefinition<
  TName,
  TFields,
  ReferenceFieldRelations<TFields>,
  EntityRefLocatorFactories<TFields, ConventionalEntityLocatorDeclarations<TFields>>
> => {
  const entityFields = Object.fromEntries(
    Object.entries(fields).map(([fieldName, definition]) => [
      fieldName,
      isReferenceFieldDefinition(definition) ? { ...definition } : definition,
    ]),
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
      assertPortableRelationConstraints(options?.constraints);
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'hasMany',
        target,
        ...(options?.via ? { targetField: options.via } : {}),
        ...(options?.constraints ? { constraints: options.constraints } : {}),
      };
      return this as never;
    },
    belongsTo(relationName: string, target: AnyEntityDefinition, options?: RelationOptions) {
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
    manyToMany(relationName: string, target: AnyEntityDefinition) {
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'manyToMany',
        target,
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
): GraphArrayDefinition<TItem> => ({
  kind: 'schema.array',
  item,
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
  options?: { cardinality?: TCardinality },
): GraphSelectionDefinition<TEntity, TCardinality> => ({
  kind: 'schema.selection',
  entity: entityDefinition,
  cardinality: options?.cardinality ?? ('many' as TCardinality),
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
  ref: field.ref,
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
  input:
    | {
        type: 'one-to-many' | 'many-to-one';
        from: string;
        to: string;
      }
    | {
        type: 'many-to-many';
        from: string;
        through: { table: string; fromColumn: string; toColumn: string };
        to: string;
      },
) => {
  const relation = entityDefinition.relations[relationName];
  if (!relation) {
    throw new Error(`Unknown relation ${relationName} on entity ${entityDefinition.name}`);
  }

  const from = parseTableColumnPath(input.from);
  const to = parseTableColumnPath(input.to);
  if (input.type === 'many-to-many') {
    if (relation.relationKind !== 'manyToMany') {
      throw new Error(
        `Relation ${entityDefinition.name}.${relationName} is not declared many-to-many.`,
      );
    }
    if (!input.through.table || !input.through.fromColumn || !input.through.toColumn) {
      throw new Error(`Many-to-many relation ${relationName} requires complete through mapping.`);
    }
    relation.mapping = {
      type: input.type,
      fromTable: from.tableName,
      fromColumn: from.columnName,
      throughTable: input.through.table,
      throughFromColumn: input.through.fromColumn,
      throughToColumn: input.through.toColumn,
      toTable: to.tableName,
      toColumn: to.columnName,
    };
  } else {
    if (relation.relationKind === 'manyToMany') {
      throw new Error(
        `Relation ${entityDefinition.name}.${relationName} requires a many-to-many mapping.`,
      );
    }
    relation.mapping = {
      type: input.type,
      fromTable: from.tableName,
      fromColumn: from.columnName,
      toTable: to.tableName,
      toColumn: to.columnName,
    };
  }

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
  if (!relationDefinition) {
    throw new Error(`Unknown relation ${sourceEntity.name}.${relationName}.`);
  }
  if (relationDefinition.relationKind === 'manyToMany') {
    throw new Error(
      `Many-to-many Relation ${sourceEntity.name}.${relationName} does not use direct Entity fields.`,
    );
  }

  const singleIdentityField = (entityDefinition: AnyEntityDefinition) => {
    const fields = getEntityIdentityLocator(entityDefinition)?.locator.fields;
    return fields?.length === 1 ? fields[0] : undefined;
  };
  const semanticFields =
    relationDefinition.relationKind === 'belongsTo'
      ? {
          sourceField: relationDefinition.sourceField,
          targetField: singleIdentityField(relationDefinition.target),
        }
      : {
          sourceField: singleIdentityField(sourceEntity),
          targetField: relationDefinition.targetField,
        };

  if (semanticFields.sourceField && semanticFields.targetField) {
    return semanticFields as { sourceField: string; targetField: string };
  }

  const mapping = relationDefinition?.mapping;

  if (!mapping) {
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
