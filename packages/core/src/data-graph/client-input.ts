import type {
  AnyEntityDefinition,
  GraphSchemaFields,
  GraphSchemaLike,
  InferEntityRecord,
  InferGraphSchemaValue,
} from './definitions.js';
import {
  createEntityIdentityRef,
  createEntityRef,
  getEntityIdentityLocator,
  isEntityRef,
  isEntityRefLocatorValue,
  type EntityRef,
  type EntityRefLocatorValue,
} from './ref.js';
import { Selection } from './selection-value.js';

type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

type OptionalClientInputKeys<TFields extends GraphSchemaFields> = {
  [TKey in keyof TFields]: TFields[TKey] extends { kind: 'schema.optional' } | { optional: true }
    ? TKey
    : never;
}[keyof TFields];

type ClientInputFields<TFields extends GraphSchemaFields> = Simplify<
  {
    [TKey in Exclude<keyof TFields, OptionalClientInputKeys<TFields>>]: InferGraphSchemaClientInput<
      TFields[TKey]
    >;
  } & {
    [TKey in OptionalClientInputKeys<TFields>]?: Exclude<
      InferGraphSchemaClientInput<TFields[TKey]>,
      undefined
    >;
  }
>;

type SingleLocatorArgument<TLocator> = TLocator extends (...args: infer TArguments) => unknown
  ? TArguments extends [infer TValue]
    ? TValue
    : never
  : never;

type IsUnion<TValue, TWhole = TValue> = TValue extends unknown
  ? [TWhole] extends [TValue]
    ? false
    : true
  : never;

type IdentityScalar<TEntity extends AnyEntityDefinition> =
  IsUnion<keyof TEntity['refLocators']> extends true
    ? never
    : SingleLocatorArgument<TEntity['refLocators'][keyof TEntity['refLocators']]>;

type IdentityLocator<TEntity extends AnyEntityDefinition> =
  TEntity['identityLocatorName'] extends keyof TEntity['refLocators']
    ? TEntity['refLocators'][TEntity['identityLocatorName']]
    : never;

type IdentityFieldNames<TEntity extends AnyEntityDefinition> =
  IdentityLocator<TEntity> extends { fields: readonly (infer TFieldName extends string)[] }
    ? TFieldName
    : never;

type IdentityRecord<TEntity extends AnyEntityDefinition> = [IdentityFieldNames<TEntity>] extends [
  never,
]
  ? never
  : Pick<
      InferEntityRecord<TEntity['fields']>,
      Extract<IdentityFieldNames<TEntity>, keyof InferEntityRecord<TEntity['fields']>>
    >;

export type EntitySelectionInputItem<TEntity extends AnyEntityDefinition> =
  | EntityRef<TEntity['name']>
  | InferEntityRecord<TEntity['fields']>
  | IdentityRecord<TEntity>
  | IdentityScalar<TEntity>;

export type GraphSelectionClientInput<
  TEntity extends AnyEntityDefinition,
  TCardinality extends 'one' | 'many',
> =
  | Selection<TEntity>
  | (TCardinality extends 'one'
      ? EntitySelectionInputItem<TEntity>
      : readonly EntitySelectionInputItem<TEntity>[]);

export type InferGraphSchemaClientInput<TSchema extends GraphSchemaLike> = TSchema extends {
  kind: 'schema.selection';
  entity: infer TEntity extends AnyEntityDefinition;
  cardinality: infer TCardinality extends 'one' | 'many';
}
  ? GraphSelectionClientInput<TEntity, TCardinality>
  : TSchema extends { kind: 'value' | 'schema.object'; fields: infer TFields }
    ? TFields extends GraphSchemaFields
      ? ClientInputFields<TFields>
      : never
    : TSchema extends { kind: 'schema.array'; item: infer TItem extends GraphSchemaLike }
      ? InferGraphSchemaClientInput<TItem>[]
      : TSchema extends { kind: 'schema.optional'; item: infer TItem extends GraphSchemaLike }
        ? InferGraphSchemaClientInput<TItem> | undefined
        : TSchema extends { kind: 'schema.nullable'; item: infer TItem extends GraphSchemaLike }
          ? InferGraphSchemaClientInput<TItem> | null
          : TSchema extends {
                kind: 'schema.named' | 'schema.default' | 'schema.transform' | 'schema.refinement';
                item: infer TItem extends GraphSchemaLike;
              }
            ? InferGraphSchemaClientInput<TItem>
            : InferGraphSchemaValue<TSchema>;

const selectionInputItemToRef = (
  entity: AnyEntityDefinition,
  value: unknown,
): EntityRef<string> => {
  if (isEntityRef(value)) {
    if (value.entityName !== entity.name) {
      throw new Error(`Cannot select ${entity.name} using a ${value.entityName} reference.`);
    }
    return value;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const ref = createEntityIdentityRef(entity, value as Record<string, unknown>);
    if (ref) return ref;
    throw new Error(`Cannot derive the ${entity.name} identity from the provided record.`);
  }

  const identity = getEntityIdentityLocator(entity);
  if (identity?.locator.fields?.length === 1 && isEntityRefLocatorValue(value)) {
    return createEntityRef(entity, identity.locator(value as EntityRefLocatorValue));
  }

  throw new Error(
    `Cannot derive a ${entity.name} reference without a single-field identity or identity fields.`,
  );
};

const normalizeSelectionInput = (
  schema: {
    entity: AnyEntityDefinition;
    cardinality: 'one' | 'many';
  },
  value: unknown,
) => {
  if (value instanceof Selection) return value;
  const values = schema.cardinality === 'many' ? value : [value];
  if (!Array.isArray(values)) {
    throw new Error(`Expected an array of ${schema.entity.name} selection inputs.`);
  }
  return Selection.references(
    schema.entity,
    values.map(item => selectionInputItemToRef(schema.entity, item)),
    schema.cardinality,
  );
};

export const normalizeGraphSchemaClientInput = (
  schema: GraphSchemaLike,
  value: unknown,
): unknown => {
  const definition = schema as GraphSchemaLike & Record<string, unknown>;

  if (definition.kind === 'schema.selection') {
    return normalizeSelectionInput(
      definition as unknown as {
        entity: AnyEntityDefinition;
        cardinality: 'one' | 'many';
      },
      value,
    );
  }

  if (
    (definition.kind === 'value' || definition.kind === 'schema.object') &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const fields = definition.fields as GraphSchemaFields;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => [
        key,
        fields[key] ? normalizeGraphSchemaClientInput(fields[key], fieldValue) : fieldValue,
      ]),
    );
  }

  if (definition.kind === 'schema.array' && Array.isArray(value)) {
    return value.map(item =>
      normalizeGraphSchemaClientInput(definition.item as GraphSchemaLike, item),
    );
  }

  if (
    definition.kind === 'schema.optional' ||
    definition.kind === 'schema.nullable' ||
    definition.kind === 'schema.named' ||
    definition.kind === 'schema.default' ||
    definition.kind === 'schema.transform' ||
    definition.kind === 'schema.refinement'
  ) {
    return value == null
      ? value
      : normalizeGraphSchemaClientInput(definition.item as GraphSchemaLike, value);
  }

  return value;
};
