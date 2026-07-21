import { z, type ZodType } from 'zod';

import type {
  AnyEntityDefinition,
  AnyEntityViewDefinition,
  AnyFieldDefinition,
  AnyGraphObjectDefinition,
  AnyValueDefinition,
  GraphArrayDefinition,
  GraphDefaultDefinition,
  GraphLiteralDefinition,
  GraphLazyDefinition,
  GraphNamedDefinition,
  GraphNullableDefinition,
  GraphOptionalDefinition,
  GraphRecordDefinition,
  GraphRefinementDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
  GraphTransformDefinition,
  GraphUnionDefinition,
  GraphVoidDefinition,
} from './definitions.js';
import { getGraphOutputDescriptor, type GraphOutputDescriptor } from './output/index.js';

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

const isGraphObjectDefinition = (
  schema: GraphSchemaDefinition,
): schema is AnyGraphObjectDefinition => schema.kind === 'schema.object';

const isGraphArrayDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphArrayDefinition<GraphSchemaDefinition> => schema.kind === 'schema.array';

const isGraphNullableDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphNullableDefinition<GraphSchemaDefinition> => schema.kind === 'schema.nullable';

const isGraphOptionalDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphOptionalDefinition<GraphSchemaDefinition> => schema.kind === 'schema.optional';

const isGraphLiteralDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphLiteralDefinition => schema.kind === 'schema.literal';

const isGraphUnionDefinition = (schema: GraphSchemaDefinition): schema is GraphUnionDefinition =>
  schema.kind === 'schema.union';

const isGraphRecordDefinition = (schema: GraphSchemaDefinition): schema is GraphRecordDefinition =>
  schema.kind === 'schema.record';

const isGraphDefaultDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphDefaultDefinition => schema.kind === 'schema.default';

const isGraphTransformDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphTransformDefinition => schema.kind === 'schema.transform';

const isGraphRefinementDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphRefinementDefinition => schema.kind === 'schema.refinement';

const isGraphLazyDefinition = (schema: GraphSchemaDefinition): schema is GraphLazyDefinition =>
  schema.kind === 'schema.lazy';

const isGraphNamedDefinition = (schema: GraphSchemaDefinition): schema is GraphNamedDefinition =>
  schema.kind === 'schema.named';

const isGraphVoidDefinition = (schema: GraphSchemaDefinition): schema is GraphVoidDefinition =>
  schema.kind === 'schema.void';

const toZodFieldSchema = (field: AnyFieldDefinition): ZodType => {
  let schema: ZodType;

  if (field.fieldType === 'id' || field.fieldType === 'string' || field.fieldType === 'date') {
    let stringSchema = z.string({ error: field.stringConstraints?.messages?.required });

    if (field.stringConstraints?.minLength !== undefined) {
      stringSchema = stringSchema.min(
        field.stringConstraints.minLength,
        field.stringConstraints.messages?.minLength,
      );
    }

    if (field.stringConstraints?.maxLength !== undefined) {
      stringSchema = stringSchema.max(
        field.stringConstraints.maxLength,
        field.stringConstraints.messages?.maxLength,
      );
    }

    if (field.stringConstraints?.trim) {
      stringSchema = stringSchema.trim();
    }

    if (field.stringConstraints?.pattern) {
      stringSchema = stringSchema.regex(
        new RegExp(field.stringConstraints.pattern.source, field.stringConstraints.pattern.flags),
        field.stringConstraints.messages?.pattern,
      );
    }

    if (field.stringConstraints?.format === 'email') {
      stringSchema = stringSchema.email(field.stringConstraints.messages?.format);
    } else if (field.stringConstraints?.format === 'url') {
      stringSchema = stringSchema.url(field.stringConstraints.messages?.format);
    } else if (field.stringConstraints?.format === 'uuid') {
      stringSchema = stringSchema.uuid(field.stringConstraints.messages?.format);
    } else if (field.stringConstraints?.format === 'datetime') {
      stringSchema = stringSchema.datetime({ message: field.stringConstraints.messages?.format });
    }

    schema = stringSchema;
  } else if (field.fieldType === 'number') {
    let numberSchema = field.numberConstraints?.coerce
      ? z.coerce.number({ error: field.numberConstraints.messages?.required })
      : z.number({ error: field.numberConstraints?.messages?.required });

    if (field.numberConstraints?.integer) {
      numberSchema = numberSchema.int(field.numberConstraints.messages?.integer);
    }

    if (field.numberConstraints?.min !== undefined) {
      numberSchema = numberSchema.min(
        field.numberConstraints.min,
        field.numberConstraints.messages?.min,
      );
    }

    if (field.numberConstraints?.max !== undefined) {
      numberSchema = numberSchema.max(
        field.numberConstraints.max,
        field.numberConstraints.messages?.max,
      );
    }

    if (field.numberConstraints?.multipleOf !== undefined) {
      numberSchema = numberSchema.multipleOf(
        field.numberConstraints.multipleOf,
        field.numberConstraints.messages?.multipleOf,
      );
    }

    schema = numberSchema;
  } else if (field.fieldType === 'boolean') {
    schema = z.boolean();
  } else if (field.fieldType === 'enum' && field.enumValues && field.enumValues.length > 0) {
    schema = z.enum(field.enumValues as [string, ...string[]]);
  } else {
    schema = z.unknown();
  }

  const nullableSchema = field.nullable ? schema.nullable() : schema;

  return field.optional ? nullableSchema.optional() : nullableSchema;
};

const toZodObjectShape = (fields: GraphSchemaFields): Record<string, ZodType> =>
  Object.fromEntries(
    Object.entries(fields).map(([fieldName, fieldSchema]) => [
      fieldName,
      toZodSchemaInternal(fieldSchema as GraphSchemaDefinition),
    ]),
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
    const valueSchema = z.object(toZodObjectShape(schema.fields));

    return schema.unknownKeys === 'passthrough'
      ? valueSchema.passthrough()
      : schema.unknownKeys === 'strict'
        ? valueSchema.strict()
        : valueSchema;
  }

  if (isGraphObjectDefinition(schema)) {
    const objectSchema = z.object(toZodObjectShape(schema.fields));

    return schema.unknownKeys === 'passthrough'
      ? objectSchema.passthrough()
      : schema.unknownKeys === 'strict'
        ? objectSchema.strict()
        : objectSchema;
  }

  if (isGraphArrayDefinition(schema)) {
    return z.array(toZodSchemaInternal(schema.item));
  }

  if (isGraphNullableDefinition(schema)) {
    return toZodSchemaInternal(schema.item).nullable();
  }

  if (isGraphOptionalDefinition(schema)) {
    return toZodSchemaInternal(schema.item).optional();
  }

  if (isGraphLiteralDefinition(schema)) {
    return z.literal(schema.value);
  }

  if (isGraphUnionDefinition(schema)) {
    if (schema.options.length < 2) {
      return schema.options[0] ? toZodSchemaInternal(schema.options[0]) : z.never();
    }

    const options = schema.options.map(option => toZodSchemaInternal(option));

    return z.union(options as [ZodType, ZodType, ...ZodType[]]);
  }

  if (isGraphRecordDefinition(schema)) {
    return z.record(z.string(), toZodSchemaInternal(schema.value));
  }

  if (isGraphDefaultDefinition(schema)) {
    const defaultSchema = schema as unknown as {
      item: GraphSchemaDefinition;
      defaultValue: unknown;
    };

    return toZodSchemaInternal(defaultSchema.item).default(defaultSchema.defaultValue);
  }

  if (isGraphTransformDefinition(schema)) {
    const transformSchema = schema as unknown as {
      item: GraphSchemaDefinition;
      transform: (value: unknown) => unknown;
    };

    return toZodSchemaInternal(transformSchema.item).transform(transformSchema.transform);
  }

  if (isGraphRefinementDefinition(schema)) {
    const refinementSchema = schema as unknown as {
      item: GraphSchemaDefinition;
      predicate: (value: unknown) => boolean;
      message: string;
      path?: readonly (string | number)[];
    };

    return toZodSchemaInternal(refinementSchema.item).refine(refinementSchema.predicate, {
      message: refinementSchema.message,
      ...(refinementSchema.path ? { path: [...refinementSchema.path] } : {}),
    });
  }

  if (isGraphLazyDefinition(schema)) {
    return z.lazy(() => toZodSchemaInternal(schema.resolve()));
  }

  if (isGraphNamedDefinition(schema)) {
    return toZodSchemaInternal(schema.item);
  }

  if (isGraphVoidDefinition(schema)) {
    return z.void();
  }

  throw new Error('Unsupported graph schema definition.');
};

const toZodSchemaInternal = (schema: GraphSchemaDefinition): ZodType => toBareZodSchema(schema);

export const toZodUnknownGraphSchema = (schema: unknown): ZodType =>
  toZodSchemaInternal(schema as GraphSchemaDefinition);

export const toZodSchema = <TSchema extends GraphSchemaDefinition>(
  schema: TSchema,
): ZodType<GraphSchemaValue<TSchema>> =>
  toZodSchemaInternal(schema) as ZodType<GraphSchemaValue<TSchema>>;

export type GraphSchemaValue<TSchema extends GraphSchemaDefinition> = TSchema extends {
  __value?: infer TValue;
}
  ? TValue
  : never;

export type GraphSchemaValidationIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
};

export type GraphSchemaParseResult<TValue> =
  | { success: true; data: TValue }
  | { success: false; issues: GraphSchemaValidationIssue[] };

export class GraphSchemaValidationError extends Error {
  readonly issues: GraphSchemaValidationIssue[];

  constructor(issues: GraphSchemaValidationIssue[]) {
    super(issues[0]?.message ?? 'Graph schema validation failed.');
    this.name = 'GraphSchemaValidationError';
    this.issues = issues;
  }
}

export const safeParseUnknownGraphSchema = (
  schema: unknown,
  value: unknown,
): GraphSchemaParseResult<unknown> => {
  const result = toZodSchemaInternal(schema as GraphSchemaDefinition).safeParse(value);

  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        issues: result.error.issues.map(issue => ({
          code: issue.code,
          path: issue.path.map(segment =>
            typeof segment === 'symbol' ? (segment.description ?? String(segment)) : segment,
          ),
          message: issue.message,
        })),
      };
};

export function safeParseGraphSchema<TSchema extends GraphSchemaDefinition>(
  schema: TSchema,
  value: unknown,
): GraphSchemaParseResult<GraphSchemaValue<TSchema>>;
export function safeParseGraphSchema(
  schema: GraphSchemaDefinition,
  value: unknown,
): GraphSchemaParseResult<unknown> {
  return safeParseUnknownGraphSchema(schema, value);
}

export const parseGraphSchema = <TSchema extends GraphSchemaDefinition>(
  schema: TSchema,
  value: unknown,
): GraphSchemaValue<TSchema> => {
  const result = safeParseUnknownGraphSchema(schema, value);

  if (!result.success) {
    throw new GraphSchemaValidationError(result.issues);
  }

  return result.data as GraphSchemaValue<TSchema>;
};

export const toGraphOutputDescriptor = (
  schema: GraphSchemaDefinition,
): GraphOutputDescriptor | undefined => getGraphOutputDescriptor(schema);

export const graphAdapters = {
  zod: toZodSchema,
  graphOutput: toGraphOutputDescriptor,
};
