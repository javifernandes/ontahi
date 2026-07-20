import { z, type ZodType } from 'zod';

import type {
  AnyEntityDefinition,
  AnyEntityViewDefinition,
  AnyFieldDefinition,
  AnyValueDefinition,
  GraphArrayDefinition,
  GraphNullableDefinition,
  GraphOptionalDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
} from './definitions.js';
import {
  getGraphOutputDescriptor,
  graphOutput,
  type GraphOutputDescriptor,
} from './output/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const isFieldDefinition = (schema: GraphSchemaDefinition): schema is AnyFieldDefinition =>
  schema.kind === 'field';

const isEntityDefinition = (schema: GraphSchemaDefinition): schema is AnyEntityDefinition =>
  schema.kind === 'entity';

const isEntityViewDefinition = (schema: GraphSchemaDefinition): schema is AnyEntityViewDefinition =>
  schema.kind === 'entity-view';

const isValueDefinition = (schema: GraphSchemaDefinition): schema is AnyValueDefinition =>
  schema.kind === 'value';

const isGraphArrayDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphArrayDefinition<GraphSchemaDefinition> => schema.kind === 'schema.array';

const isGraphNullableDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphNullableDefinition<GraphSchemaDefinition> => schema.kind === 'schema.nullable';

const isGraphOptionalDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphOptionalDefinition<GraphSchemaDefinition> => schema.kind === 'schema.optional';

const toZodFieldSchema = (field: AnyFieldDefinition): ZodType => {
  let schema: ZodType;

  if (field.fieldType === 'id' || field.fieldType === 'string' || field.fieldType === 'date') {
    let stringSchema = z.string();

    if (field.stringConstraints?.minLength !== undefined) {
      stringSchema = stringSchema.min(field.stringConstraints.minLength);
    }

    if (field.stringConstraints?.maxLength !== undefined) {
      stringSchema = stringSchema.max(field.stringConstraints.maxLength);
    }

    schema = stringSchema;
  } else if (field.fieldType === 'number') {
    let numberSchema = z.number();

    if (field.numberConstraints?.integer) {
      numberSchema = numberSchema.int();
    }

    if (field.numberConstraints?.min !== undefined) {
      numberSchema = numberSchema.min(field.numberConstraints.min);
    }

    if (field.numberConstraints?.max !== undefined) {
      numberSchema = numberSchema.max(field.numberConstraints.max);
    }

    schema = numberSchema;
  } else if (field.fieldType === 'boolean') {
    schema = z.boolean();
  } else if (field.fieldType === 'enum' && field.enumValues && field.enumValues.length > 0) {
    schema = z.enum(field.enumValues as [string, ...string[]]);
  } else {
    schema = z.unknown();
  }

  return field.nullable ? schema.nullable() : schema;
};

const toZodObjectShape = (fields: GraphSchemaFields): Record<string, ZodType> =>
  Object.fromEntries(
    Object.entries(fields).map(([fieldName, fieldSchema]) => [fieldName, toZodSchema(fieldSchema)]),
  );

const toZodEntitySchema = (entity: AnyEntityDefinition): ZodType =>
  z.object(toZodObjectShape(entity.fields));

const toZodEntityViewSchema = (view: AnyEntityViewDefinition): ZodType => {
  const omittedFields = new Set(view.omit);
  const selectedEntityFields = Object.fromEntries(
    Object.entries(view.entity.fields).filter(([fieldName]) => !omittedFields.has(fieldName)),
  );

  return z.object({
    ...toZodObjectShape(selectedEntityFields),
    ...toZodObjectShape(view.fields),
  });
};

const withGraphOutputDescriptor = (source: GraphSchemaDefinition, schema: ZodType): ZodType => {
  const descriptor = getGraphOutputDescriptor(source);

  return descriptor ? graphOutput.schema(schema, descriptor) : schema;
};

const toBareZodSchema = (schema: GraphSchemaDefinition): ZodType => {
  if (isFieldDefinition(schema)) {
    return toZodFieldSchema(schema);
  }

  if (isEntityDefinition(schema)) {
    return toZodEntitySchema(schema);
  }

  if (isEntityViewDefinition(schema)) {
    return toZodEntityViewSchema(schema);
  }

  if (isValueDefinition(schema)) {
    return z.object(toZodObjectShape(schema.fields));
  }

  if (isGraphArrayDefinition(schema)) {
    return z.array(toZodSchema(schema.item));
  }

  if (isGraphNullableDefinition(schema)) {
    return toZodSchema(schema.item).nullable();
  }

  if (isGraphOptionalDefinition(schema)) {
    return toZodSchema(schema.item).optional();
  }

  throw new Error('Unsupported graph schema definition.');
};

export const toZodSchema = (schema: GraphSchemaDefinition): ZodType =>
  withGraphOutputDescriptor(schema, toBareZodSchema(schema));

export const toGraphOutputDescriptor = (
  schema: GraphSchemaDefinition,
): GraphOutputDescriptor | undefined => getGraphOutputDescriptor(schema);

export const graphAdapters = {
  zod: toZodSchema,
  graphOutput: toGraphOutputDescriptor,
};
