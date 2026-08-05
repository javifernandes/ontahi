import type { RelationNodeSpec } from './query.js';
import type {
  EntityRefLocator,
  EntityRefLocatorDeclarations,
  EntityRefLocatorFactory,
  EntityRefLocatorValue,
} from './ref.js';
import type { Selection } from './selection-value.js';

export type FieldDefinition<TValue> = {
  kind: 'field';
  fieldType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum';
  enumValues?: readonly string[];
  stringConstraints?: StringFieldConstraints;
  numberConstraints?: NumberFieldConstraints;
  nullable?: true;
  optional?: true;
  description?: string;
  presentation?: GraphSchemaPresentation;
  __value?: TValue;
};

export type StringFieldConstraints = {
  minLength?: number;
  maxLength?: number;
  trim?: true;
  pattern?: {
    source: string;
    flags?: string;
  };
  format?: 'email' | 'url' | 'uuid' | 'datetime';
  messages?: {
    required?: string;
    minLength?: string;
    maxLength?: string;
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

type FieldDefinitions = Record<string, FieldDefinition<unknown>>;
export type AnyFieldDefinition = FieldDefinition<unknown>;

export type InferFieldValue<TField extends AnyFieldDefinition> =
  TField extends FieldDefinition<infer TValue> ? TValue : never;

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
> {
  kind: 'schema.selection';
  entity: TEntity;
  cardinality: 'one' | 'many';
  __value?: Selection<TEntity>;
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
  sourceField?: string;
  targetField?: string;
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
  __value?: InferEntityRecord<TFields>;
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
  view: <
    TViewName extends string,
    TViewFields extends GraphSchemaFields = {},
    TOmit extends readonly (keyof TFields & string)[] = readonly [],
  >(
    viewName: TViewName,
    config?: EntityViewConfig<
      EntityDefinition<TName, TFields, TRelations, TLocators>,
      TViewFields,
      TOmit
    >,
  ) => EntityViewDefinition<
    EntityDefinition<TName, TFields, TRelations, TLocators>,
    TViewName,
    TViewFields,
    TOmit
  >;
  hasMany: <TRelationName extends string, TTarget extends AnyEntityDefinition>(
    relationName: TRelationName,
    target: TTarget,
    options?: { via?: keyof TTarget['fields'] & string },
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
  nullable: <TValue>(definition: FieldDefinition<TValue>): FieldDefinition<TValue | null> => ({
    ...definition,
    nullable: true,
  }),
  optional: <TValue>(definition: FieldDefinition<TValue>): FieldDefinition<TValue | undefined> => ({
    ...definition,
    optional: true,
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
    hasMany(relationName: string, target: AnyEntityDefinition, options?: { via?: string }) {
      this.relations[relationName] = {
        kind: 'relation',
        relationKind: 'hasMany',
        target,
        ...(options?.via ? { targetField: options.via } : {}),
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

  return entityDefinition as unknown as EntityDefinition<TName, TFields, {}, {}>;
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

export const graphSelection = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
  options?: { cardinality?: 'one' | 'many' },
): GraphSelectionDefinition<TEntity> => ({
  kind: 'schema.selection',
  entity: entityDefinition,
  cardinality: options?.cardinality ?? 'many',
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
