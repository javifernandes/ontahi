import type {
  GraphLiteralDefinition,
  GraphSchemaLike,
  GraphVoidDefinition,
  ValueArrayDefinition,
  ValueDefaultDefinition,
  ValueNamedDefinition,
  ValueNullableDefinition,
  ValueOptionalDefinition,
  ValueRecordDefinition,
  ValueRefinementDefinition,
  ValueTransformDefinition,
  ValueUnionDefinition,
} from './definition.js';
import type { GraphSchemaPresentation } from './presentation.js';

export const graphLiteral = <const TValue extends string | number | boolean | null>(
  literalValue: TValue,
): GraphLiteralDefinition<TValue> => ({
  kind: 'schema.literal',
  value: literalValue,
});

export const graphVoid = (): GraphVoidDefinition => ({ kind: 'schema.void' });

export const valueArray = <TItem extends GraphSchemaLike, TValue>(
  item: TItem,
  options?: { minItems?: number; maxItems?: number },
): ValueArrayDefinition<TItem, TValue> => ({
  kind: 'schema.array',
  item,
  ...(options?.minItems === undefined ? {} : { minItems: options.minItems }),
  ...(options?.maxItems === undefined ? {} : { maxItems: options.maxItems }),
});

export const valueNullable = <TItem extends GraphSchemaLike, TValue>(
  item: TItem,
): ValueNullableDefinition<TItem, TValue> => ({ kind: 'schema.nullable', item });

export const valueOptional = <TItem extends GraphSchemaLike, TValue>(
  item: TItem,
): ValueOptionalDefinition<TItem, TValue> => ({ kind: 'schema.optional', item });

export const valueUnion = <TOptions extends readonly GraphSchemaLike[], TValue>(
  options: TOptions,
  discriminator?: string,
): ValueUnionDefinition<TOptions, TValue> => ({
  kind: 'schema.union',
  options,
  ...(discriminator === undefined ? {} : { discriminator }),
});

export const valueRecord = <TItem extends GraphSchemaLike, TValue>(
  item: TItem,
): ValueRecordDefinition<TItem, TValue> => ({ kind: 'schema.record', value: item });

export const valueDefault = <TItem extends GraphSchemaLike, TValue>(
  item: TItem,
  defaultValue: Exclude<TValue, undefined>,
): ValueDefaultDefinition<TItem, TValue> => ({ kind: 'schema.default', item, defaultValue });

export const valueTransform = <TItem extends GraphSchemaLike, TInput, TOutput>(
  item: TItem,
  transform: (value: TInput) => TOutput,
): ValueTransformDefinition<TItem, TInput, TOutput> => ({
  kind: 'schema.transform',
  item,
  transform,
});

export const valueRefine = <TItem extends GraphSchemaLike, TValue>(
  item: TItem,
  predicate: (value: TValue) => boolean,
  options: { message: string; path?: readonly (string | number)[]; rule?: string },
): ValueRefinementDefinition<TItem, TValue> => ({
  kind: 'schema.refinement',
  item,
  predicate,
  message: options.message,
  ...(options.path ? { path: options.path } : {}),
  ...(options.rule ? { rule: options.rule } : {}),
});

export const valueNamed = <TItem extends GraphSchemaLike, TValue>(
  name: string,
  item: TItem,
): ValueNamedDefinition<TItem, TValue> => ({ kind: 'schema.named', name, item });

export const describeGraphSchema = <TSchema extends object>(
  schema: TSchema,
  description: string,
): TSchema => ({ ...schema, description });

export const presentGraphSchema = <TSchema extends object>(
  schema: TSchema,
  presentation: GraphSchemaPresentation,
): TSchema => ({ ...schema, presentation });
