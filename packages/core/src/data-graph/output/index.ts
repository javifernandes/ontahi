import type {
  AnyEntityDefinition,
  AnyEntityViewDefinition,
  AnyGraphObjectDefinition,
  AnyValueDefinition,
  GraphArrayDefinition,
  GraphDefaultDefinition,
  GraphLazyDefinition,
  GraphNamedDefinition,
  GraphNullableDefinition,
  GraphOptionalDefinition,
  GraphRefinementDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
  GraphTransformDefinition,
} from '../definitions.js';

export type GraphOutputDescriptor =
  | GraphOutputOpaqueDescriptor
  | GraphOutputEntityDescriptor
  | GraphOutputArrayDescriptor
  | GraphOutputObjectDescriptor
  | GraphOutputNullableDescriptor
  | GraphOutputOptionalDescriptor;

export interface GraphOutputObjectFields {
  readonly [fieldName: string]: GraphOutputDescriptor;
}

export type GraphOutputOpaqueDescriptor = {
  kind: 'graph-output.opaque';
};

export type GraphOutputEntityDescriptor<TEntity extends AnyEntityDefinition = AnyEntityDefinition> =
  {
    kind: 'graph-output.entity';
    entity: TEntity;
    fields?: GraphOutputObjectFields;
  };

export type GraphOutputArrayDescriptor = {
  kind: 'graph-output.array';
  item: GraphOutputDescriptor;
};

export type GraphOutputObjectDescriptor = {
  kind: 'graph-output.object';
  fields: GraphOutputObjectFields;
};

export type GraphOutputNullableDescriptor = {
  kind: 'graph-output.nullable';
  item: GraphOutputDescriptor;
};

export type GraphOutputOptionalDescriptor = {
  kind: 'graph-output.optional';
  item: GraphOutputDescriptor;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const isEntityDefinition = (value: unknown): value is AnyEntityDefinition =>
  isRecord(value) && value.kind === 'entity' && typeof value.name === 'string';

const isEntityViewDefinition = (value: unknown): value is AnyEntityViewDefinition =>
  isRecord(value) && value.kind === 'entity-view' && typeof value.name === 'string';

const isValueDefinition = (value: unknown): value is AnyValueDefinition =>
  isRecord(value) && value.kind === 'value' && typeof value.name === 'string';

const isGraphObjectDefinition = (value: unknown): value is AnyGraphObjectDefinition =>
  isRecord(value) && value.kind === 'schema.object';

const isGraphArrayDefinition = (
  value: unknown,
): value is GraphArrayDefinition<GraphSchemaDefinition> =>
  isRecord(value) && value.kind === 'schema.array';

const isGraphNullableDefinition = (
  value: unknown,
): value is GraphNullableDefinition<GraphSchemaDefinition> =>
  isRecord(value) && value.kind === 'schema.nullable';

const isGraphOptionalDefinition = (
  value: unknown,
): value is GraphOptionalDefinition<GraphSchemaDefinition> =>
  isRecord(value) && value.kind === 'schema.optional';

const isGraphDefaultDefinition = (
  value: unknown,
): value is GraphDefaultDefinition<GraphSchemaDefinition> =>
  isRecord(value) && value.kind === 'schema.default';

const isGraphTransformDefinition = (
  value: unknown,
): value is GraphTransformDefinition<GraphSchemaDefinition, unknown> =>
  isRecord(value) && value.kind === 'schema.transform';

const isGraphRefinementDefinition = (
  value: unknown,
): value is GraphRefinementDefinition<GraphSchemaDefinition> =>
  isRecord(value) && value.kind === 'schema.refinement';

const isGraphLazyDefinition = (value: unknown): value is GraphLazyDefinition =>
  isRecord(value) && value.kind === 'schema.lazy' && typeof value.resolve === 'function';

const isGraphNamedDefinition = (value: unknown): value is GraphNamedDefinition =>
  isRecord(value) && value.kind === 'schema.named';

const deriveGraphOutputFields = (
  fields: GraphSchemaFields,
  seen: WeakSet<object>,
): GraphOutputObjectFields =>
  Object.fromEntries(
    Object.entries(fields)
      .map(([fieldName, fieldSchema]) => [
        fieldName,
        deriveGraphOutputDescriptor(fieldSchema, seen),
      ])
      .filter((entry): entry is [string, GraphOutputDescriptor] => Boolean(entry[1])),
  );

const deriveGraphOutputDescriptor = (
  schema: unknown,
  seen: WeakSet<object>,
): GraphOutputDescriptor | undefined => {
  if (isEntityDefinition(schema)) {
    return graphOutput.entity(schema);
  }

  if (isEntityViewDefinition(schema)) {
    const fields = deriveGraphOutputFields(schema.fields, seen);

    return Object.keys(fields).length > 0
      ? graphOutput.entity(schema.entity, fields)
      : graphOutput.entity(schema.entity);
  }

  if (isValueDefinition(schema) || isGraphObjectDefinition(schema)) {
    const fields = deriveGraphOutputFields(schema.fields, seen);

    return Object.keys(fields).length > 0 ? graphOutput.object(fields) : undefined;
  }

  if (isGraphArrayDefinition(schema)) {
    const item = deriveGraphOutputDescriptor(schema.item, seen);

    return item ? graphOutput.array(item) : undefined;
  }

  if (isGraphNullableDefinition(schema)) {
    const item = deriveGraphOutputDescriptor(schema.item, seen);

    return item ? graphOutput.nullable(item) : undefined;
  }

  if (isGraphOptionalDefinition(schema)) {
    const item = deriveGraphOutputDescriptor(schema.item, seen);

    return item ? graphOutput.optional(item) : undefined;
  }

  if (
    isGraphDefaultDefinition(schema) ||
    isGraphTransformDefinition(schema) ||
    isGraphRefinementDefinition(schema)
  ) {
    return deriveGraphOutputDescriptor(schema.item, seen);
  }

  if (isGraphLazyDefinition(schema)) {
    if (seen.has(schema)) {
      return undefined;
    }

    seen.add(schema);
    return deriveGraphOutputDescriptor(schema.resolve(), seen);
  }

  if (isGraphNamedDefinition(schema)) {
    return deriveGraphOutputDescriptor(schema.item, seen);
  }

  return undefined;
};

export const getGraphOutputDescriptor = (schema: unknown): GraphOutputDescriptor | undefined =>
  deriveGraphOutputDescriptor(schema, new WeakSet<object>());

function graphOutputEntity<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
): GraphOutputEntityDescriptor<TEntity>;
function graphOutputEntity<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  fields: GraphOutputObjectFields,
): GraphOutputEntityDescriptor<TEntity>;
function graphOutputEntity<TEntity extends AnyEntityDefinition>(
  entity: TEntity,
  fields?: GraphOutputObjectFields,
): GraphOutputEntityDescriptor<TEntity> {
  return {
    kind: 'graph-output.entity',
    entity,
    ...(fields ? { fields } : {}),
  };
}

export const graphOutput = {
  opaque: (): GraphOutputOpaqueDescriptor => ({
    kind: 'graph-output.opaque',
  }),
  entity: graphOutputEntity,
  array: (item: GraphOutputDescriptor): GraphOutputArrayDescriptor => ({
    kind: 'graph-output.array',
    item,
  }),
  object: <TFields extends GraphOutputObjectFields>(
    fields: TFields,
  ): GraphOutputObjectDescriptor => ({
    kind: 'graph-output.object',
    fields,
  }),
  nullable: (item: GraphOutputDescriptor): GraphOutputNullableDescriptor => ({
    kind: 'graph-output.nullable',
    item,
  }),
  optional: (item: GraphOutputDescriptor): GraphOutputOptionalDescriptor => ({
    kind: 'graph-output.optional',
    item,
  }),
};
