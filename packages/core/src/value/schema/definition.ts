export type GraphSchemaLike<TValue = unknown> = {
  kind: string;
  __value?: TValue;
};

export interface ValueSchemaFields {
  [fieldName: string]: GraphSchemaLike;
}

export type GraphSchemaDerivation = {
  operation: 'pick';
  source: {
    kind: 'entity' | 'entity-view' | 'value' | 'object';
    name?: string;
  };
  fields: readonly string[];
};

export interface PortableValueDefinition<
  TName extends string,
  TFields extends ValueSchemaFields,
  TValue,
> {
  kind: 'value';
  name: TName;
  fields: TFields;
  unknownKeys?: 'strip' | 'strict' | 'passthrough';
  derivedFrom?: GraphSchemaDerivation;
  __value?: TValue;
}

export interface PortableObjectDefinition<
  TFields extends ValueSchemaFields,
  TUnknownKeys extends 'strip' | 'strict' | 'passthrough',
  TValue,
> {
  kind: 'schema.object';
  fields: TFields;
  unknownKeys: TUnknownKeys;
  description?: string;
  __value?: TValue;
}

export interface GraphLiteralDefinition<TValue = string | number | boolean | null> {
  kind: 'schema.literal';
  value: TValue;
  description?: string;
  __value?: TValue;
}

export interface GraphVoidDefinition {
  kind: 'schema.void';
  __value?: void;
}

export interface ValueArrayDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.array';
  item: TItem;
  minItems?: number;
  maxItems?: number;
  __value?: TValue[];
}

export interface ValueNullableDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.nullable';
  item: TItem;
  __value?: TValue | null;
}

export interface ValueOptionalDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.optional';
  item: TItem;
  __value?: TValue | undefined;
}

export interface ValueUnionDefinition<TOptions extends readonly GraphSchemaLike[], TValue> {
  kind: 'schema.union';
  options: TOptions;
  discriminator?: string;
  description?: string;
  __value?: TValue;
}

export interface ValueRecordDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.record';
  value: TItem;
  description?: string;
  __value?: Record<string, TValue>;
}

export interface ValueDefaultDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.default';
  item: TItem;
  defaultValue: Exclude<TValue, undefined>;
  __value?: Exclude<TValue, undefined>;
}

export interface ValueTransformDefinition<TItem extends GraphSchemaLike, TInput, TOutput> {
  kind: 'schema.transform';
  item: TItem;
  transform: (value: TInput) => TOutput;
  __value?: TOutput;
}

export interface ValueRefinementDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.refinement';
  item: TItem;
  predicate: (value: TValue) => boolean;
  message: string;
  path?: readonly (string | number)[];
  rule?: string;
  __value?: TValue;
}

export interface ValueNamedDefinition<TItem extends GraphSchemaLike, TValue> {
  kind: 'schema.named';
  name: string;
  item: TItem;
  __value?: TValue;
}
