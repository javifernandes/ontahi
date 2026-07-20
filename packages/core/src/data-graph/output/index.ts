import type { ZodType } from 'zod';

import type {
  AnyEntityDefinition,
  AnyEntityViewDefinition,
  AnyValueDefinition,
  GraphArrayDefinition,
  GraphNullableDefinition,
  GraphOptionalDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
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

const graphOutputDescriptors = new WeakMap<object, GraphOutputDescriptor>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const isZodSchema = (value: unknown): value is ZodType =>
  isRecord(value) && isRecord(value.def) && typeof value.parse === 'function';

const isEntityDefinition = (value: unknown): value is AnyEntityDefinition =>
  isRecord(value) && value.kind === 'entity' && typeof value.name === 'string';

const isEntityViewDefinition = (value: unknown): value is AnyEntityViewDefinition =>
  isRecord(value) && value.kind === 'entity-view' && typeof value.name === 'string';

const isValueDefinition = (value: unknown): value is AnyValueDefinition =>
  isRecord(value) && value.kind === 'value' && typeof value.name === 'string';

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
  if (!isZodSchema(schema)) {
    if (isEntityDefinition(schema)) {
      return graphOutput.entity(schema);
    }

    if (isEntityViewDefinition(schema)) {
      const fields = deriveGraphOutputFields(schema.fields, seen);

      return Object.keys(fields).length > 0
        ? graphOutput.entity(schema.entity, fields)
        : graphOutput.entity(schema.entity);
    }

    if (isValueDefinition(schema)) {
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

    return undefined;
  }

  if (seen.has(schema)) {
    return graphOutputDescriptors.get(schema);
  }

  seen.add(schema);

  const directDescriptor = graphOutputDescriptors.get(schema);
  const def = schema.def as {
    type?: string;
    shape?: Record<string, unknown>;
    element?: unknown;
    innerType?: unknown;
  };

  let derivedDescriptor: GraphOutputDescriptor | undefined;

  if (def.type === 'object') {
    const fields = Object.fromEntries(
      Object.entries(def.shape ?? {})
        .map(([fieldName, fieldSchema]) => [
          fieldName,
          deriveGraphOutputDescriptor(fieldSchema, seen),
        ])
        .filter((entry): entry is [string, GraphOutputDescriptor] => Boolean(entry[1])),
    );

    if (Object.keys(fields).length > 0) {
      derivedDescriptor = graphOutput.object(fields);
    }
  } else if (def.type === 'array') {
    const item = deriveGraphOutputDescriptor(def.element, seen);

    if (item) {
      derivedDescriptor = graphOutput.array(item);
    }
  } else if (def.type === 'nullable') {
    const item = deriveGraphOutputDescriptor(def.innerType, seen);

    if (item) {
      derivedDescriptor = graphOutput.nullable(item);
    }
  } else if (def.type === 'optional') {
    const item = deriveGraphOutputDescriptor(def.innerType, seen);

    if (item) {
      derivedDescriptor = graphOutput.optional(item);
    }
  }

  if (directDescriptor?.kind === 'graph-output.entity') {
    return {
      ...directDescriptor,
      ...(derivedDescriptor?.kind === 'graph-output.object'
        ? {
            fields: {
              ...derivedDescriptor.fields,
              ...directDescriptor.fields,
            },
          }
        : {}),
    };
  }

  return directDescriptor ?? derivedDescriptor;
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
function graphOutputEntity<TEntity extends AnyEntityDefinition, TSchema extends ZodType>(
  entity: TEntity,
  schema: TSchema,
): TSchema;
function graphOutputEntity<TEntity extends AnyEntityDefinition, TSchema extends ZodType>(
  entity: TEntity,
  schemaOrFields?: TSchema | GraphOutputObjectFields,
): GraphOutputEntityDescriptor<TEntity> | TSchema {
  if (isZodSchema(schemaOrFields)) {
    graphOutputDescriptors.set(schemaOrFields, {
      kind: 'graph-output.entity',
      entity,
    });
    return schemaOrFields;
  }

  return {
    kind: 'graph-output.entity',
    entity,
    ...(schemaOrFields ? { fields: schemaOrFields } : {}),
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
  schema: <TSchema extends ZodType>(
    schema: TSchema,
    descriptor: GraphOutputDescriptor,
  ): TSchema => {
    graphOutputDescriptors.set(schema, descriptor);
    return schema;
  },
};
