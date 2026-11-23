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
  ValueSchemaFields,
  ValueTransformDefinition,
  ValueUnionDefinition,
} from '../../value/schema/definition.js';
import type { AnyEntityDefinition } from '../entity/definition.js';
import type { AnyFieldDefinition, InferEntityRecord } from '../entity/field.js';
import type { EntityRefLocator, SchemaEntityRef } from '../entity/ref/model.js';
import type { ReferenceFieldDefinition } from '../entity/reference-field.js';
import type { SemanticSelection } from '../query/selection-ast.js';

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

export type InferGraphSchemaFields<TFields extends GraphSchemaFields> = Simplify<
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
