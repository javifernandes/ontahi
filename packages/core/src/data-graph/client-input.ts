import type {
  AnyEntityDefinition,
  GraphSchemaFields,
  GraphSchemaLike,
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
  type EntitySelectionInputItem,
} from './ref.js';
import { isSelection, Selection } from './selection-value.js';

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
  if (isSelection(value)) return value;
  const values = schema.cardinality === 'many' && Array.isArray(value) ? value : [value];
  return Selection.references(
    schema.entity,
    values.map(item => selectionInputItemToRef(schema.entity, item)),
    schema.cardinality,
  );
};

export type NormalizeGraphSchemaClientInputOptions = {
  bindSelection?: (selection: Selection<AnyEntityDefinition, 'one' | 'many'>) => unknown;
};

export const normalizeGraphSchemaClientInput = (
  schema: GraphSchemaLike,
  value: unknown,
  options: NormalizeGraphSchemaClientInputOptions = {},
): unknown => {
  const definition = schema as GraphSchemaLike & Record<string, unknown>;

  if (definition.kind === 'schema.selection') {
    const normalized = normalizeSelectionInput(
      definition as unknown as {
        entity: AnyEntityDefinition;
        cardinality: 'one' | 'many';
      },
      value,
    );
    return options.bindSelection?.(normalized) ?? normalized;
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
        fields[key]
          ? normalizeGraphSchemaClientInput(fields[key], fieldValue, options)
          : fieldValue,
      ]),
    );
  }

  if (definition.kind === 'schema.array' && Array.isArray(value)) {
    return value.map(item =>
      normalizeGraphSchemaClientInput(definition.item as GraphSchemaLike, item, options),
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
      : normalizeGraphSchemaClientInput(definition.item as GraphSchemaLike, value, options);
  }

  return value;
};
