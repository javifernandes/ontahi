import { hasOwn } from '../object.js';

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
  ValueSchemaPickBuilder,
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

export const defineValue = <TName extends string, TFields extends ValueSchemaFields, TValue>(
  name: TName,
  fields: TFields,
  options?: {
    unknownKeys?: 'strip' | 'strict' | 'passthrough';
    derivedFrom?: PortableValueDefinition<TName, TFields, TValue>['derivedFrom'];
  },
): PortableValueDefinition<TName, TFields, TValue> => ({
  kind: 'value',
  name,
  fields,
  ...(options?.unknownKeys ? { unknownKeys: options.unknownKeys } : {}),
  ...(options?.derivedFrom ? { derivedFrom: options.derivedFrom } : {}),
});

export const pickValueFields = <
  TSource extends ValueSchemaFieldSource,
  const TKeys extends readonly (keyof TSource['fields'] & string)[],
  TValue,
>(
  source: TSource,
  keys: TKeys,
): ValueSchemaPickBuilder<TSource, TKeys, TValue> => {
  const selectedKeys = [...keys];
  const derivationSource = {
    kind: source.kind === 'schema.object' ? ('object' as const) : source.kind,
    ...(source.name ? { name: source.name } : {}),
  };
  const fields = Object.fromEntries(
    selectedKeys.map(key => {
      if (!hasOwn(source.fields, key)) {
        throw new Error(`Cannot pick unknown field ${key} from ${source.name ?? source.kind}`);
      }

      return [key, source.fields[key]];
    }),
  ) as Pick<TSource['fields'], TKeys[number]>;

  return {
    named: name =>
      defineValue<typeof name, typeof fields, TValue>(name, fields, {
        derivedFrom: {
          operation: 'pick',
          source: derivationSource,
          fields: selectedKeys,
        },
      }),
  };
};

export const valueObject = <
  TFields extends ValueSchemaFields,
  TUnknownKeys extends 'strip' | 'strict' | 'passthrough',
  TValue,
>(
  fields: TFields,
  options?: { unknownKeys?: TUnknownKeys; description?: string },
): PortableObjectDefinition<TFields, TUnknownKeys, TValue> => ({
  kind: 'schema.object',
  fields,
  unknownKeys: options?.unknownKeys ?? ('strip' as TUnknownKeys),
  ...(options?.description ? { description: options.description } : {}),
});

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

export const valueLazy = <TResolved extends GraphSchemaLike, TValue>(
  name: string,
  resolve: () => TResolved,
): ValueLazyDefinition<TResolved, TValue> => ({ kind: 'schema.lazy', name, resolve });

export const describeGraphSchema = <TSchema extends object>(
  schema: TSchema,
  description: string,
): TSchema => ({ ...schema, description });

export const presentGraphSchema = <TSchema extends object>(
  schema: TSchema,
  presentation: GraphSchemaPresentation,
): TSchema => ({ ...schema, presentation });
