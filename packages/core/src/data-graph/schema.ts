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
  GraphSelectionDefinition,
  GraphSchemaDefinition,
  GraphSchemaFields,
  GraphTransformDefinition,
  GraphUnionDefinition,
  GraphVoidDefinition,
} from './definitions.js';
import { isReferenceFieldDefinition } from './definitions.js';
import { getGraphOutputDescriptor, type GraphOutputDescriptor } from './output/index.js';
import { isEntityRef, isEntityRefLocatorValue, type EntityRefLocatorValue } from './ref.js';
import { lowerEntityReferenceValue } from './reference-field.js';
import type { SelectionExpression } from './selection-ast.js';
import { isSelection, Selection } from './selection-value.js';

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

const isGraphSelectionDefinition = (
  schema: GraphSchemaDefinition,
): schema is GraphSelectionDefinition => schema.kind === 'schema.selection';

const selectionExpressionSchema: z.ZodType<SelectionExpression> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('all') }),
    z.object({ kind: z.literal('none') }),
    z.object({
      kind: z.literal('references'),
      refs: z.array(
        z.object({
          kind: z.literal('entity-ref'),
          entityName: z.string(),
          locator: z.record(z.string(), z.custom<EntityRefLocatorValue>(isEntityRefLocatorValue)),
        }),
      ),
    }),
    z.object({
      kind: z.literal('predicate'),
      operator: z.literal('eq'),
      fieldName: z.string(),
      value: z.unknown(),
    }),
    z.object({
      kind: z.literal('predicate'),
      operator: z.literal('in'),
      fieldName: z.string(),
      values: z.array(z.unknown()),
    }),
    z.object({
      kind: z.literal('predicate'),
      operator: z.literal('isNull'),
      fieldName: z.string(),
    }),
    z.object({
      kind: z.literal('predicate'),
      operator: z.union([z.literal('lte'), z.literal('lt'), z.literal('gte'), z.literal('gt')]),
      fieldName: z.string(),
      value: z.unknown(),
    }),
    z.object({
      kind: z.union([z.literal('and'), z.literal('or')]),
      operands: z.array(selectionExpressionSchema),
    }),
    z.object({ kind: z.literal('not'), operand: selectionExpressionSchema }),
  ]),
);

const validateSelectionFields = (
  expression: SelectionExpression,
  entity: AnyEntityDefinition,
  context: z.RefinementCtx,
) => {
  if (expression.kind === 'references') {
    for (const [index, ref] of expression.refs.entries()) {
      if (ref.entityName !== entity.name) {
        context.addIssue({
          code: 'custom',
          message: `Expected a ${entity.name} reference, received ${ref.entityName}.`,
          path: ['expression', 'refs', index, 'entityName'],
        });
        continue;
      }

      const locatorFields = Object.keys(ref.locator);
      const matchesLocator = Object.values(entity.refLocators).some(
        locator =>
          locator.fields?.length === locatorFields.length &&
          locator.fields.every(fieldName => locatorFields.includes(fieldName)),
      );
      if (!matchesLocator) {
        context.addIssue({
          code: 'custom',
          message: `Unknown locator fields on entity ${entity.name}: ${locatorFields.join(', ')}.`,
          path: ['expression', 'refs', index, 'locator'],
        });
        continue;
      }

      for (const [fieldName, value] of Object.entries(ref.locator)) {
        const fieldDefinition = entity.fields[fieldName];
        if (!fieldDefinition || !toZodFieldSchema(fieldDefinition).safeParse(value).success) {
          context.addIssue({
            code: 'custom',
            message: `Invalid locator value for ${entity.name}.${fieldName}.`,
            path: ['expression', 'refs', index, 'locator', fieldName],
          });
        }
      }
    }
    return;
  }

  if (expression.kind === 'predicate') {
    const fieldDefinition = entity.fields[expression.fieldName];
    if (!fieldDefinition) {
      context.addIssue({
        code: 'custom',
        message: `Unknown field "${expression.fieldName}" on entity ${entity.name}.`,
        path: ['expression', 'fieldName'],
      });
      return;
    }

    const values =
      expression.operator === 'in'
        ? expression.values
        : expression.operator === 'isNull'
          ? []
          : [expression.value];
    for (const value of values) {
      const validDate = fieldDefinition.fieldType === 'date' && value instanceof Date;
      if (!validDate && !toZodFieldSchema(fieldDefinition).safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          message: `Invalid value for ${entity.name}.${expression.fieldName}.`,
          path: ['expression', 'value'],
        });
      }
    }
    return;
  }

  if (expression.kind === 'and' || expression.kind === 'or') {
    expression.operands.forEach(operand => validateSelectionFields(operand, entity, context));
  } else if (expression.kind === 'not') {
    validateSelectionFields(expression.operand, entity, context);
  }
};

const hydrateSelectionValues = (
  expression: SelectionExpression,
  entity: AnyEntityDefinition,
): SelectionExpression => {
  if (expression.kind === 'references') return expression;

  if (expression.kind === 'predicate') {
    const fieldDefinition = entity.fields[expression.fieldName];
    if (fieldDefinition?.fieldType !== 'date') return expression;
    if (expression.operator === 'in') {
      return {
        ...expression,
        values: expression.values.map(value =>
          typeof value === 'string' ? new Date(value) : value,
        ),
      };
    }
    if (expression.operator === 'isNull') return expression;
    return {
      ...expression,
      value: typeof expression.value === 'string' ? new Date(expression.value) : expression.value,
    };
  }
  if (expression.kind === 'and' || expression.kind === 'or') {
    return {
      ...expression,
      operands: expression.operands.map(operand => hydrateSelectionValues(operand, entity)),
    };
  }
  if (expression.kind === 'not') {
    return { ...expression, operand: hydrateSelectionValues(expression.operand, entity) };
  }
  return expression;
};

const toZodSelectionSchema = (schema: GraphSelectionDefinition): ZodType =>
  z
    .preprocess(
      value => (isSelection(value) ? value.toAst() : value),
      z.object({
        kind: z.literal('selection'),
        entityName: z.literal(schema.entity.name),
        expression: selectionExpressionSchema,
      }),
    )
    .superRefine((ast, context) => {
      validateSelectionFields(ast.expression, schema.entity, context);
      if (schema.cardinality !== 'one') return;

      const knownCount =
        ast.expression.kind === 'none'
          ? 0
          : ast.expression.kind === 'references'
            ? ast.expression.refs.length
            : undefined;
      if (knownCount !== undefined && knownCount !== 1) {
        context.addIssue({
          code: 'custom',
          message: `Expected exactly one ${schema.entity.name} reference, received ${knownCount}.`,
          path: ['expression'],
        });
      }
    })
    .transform(
      ast =>
        new Selection(
          schema.entity,
          hydrateSelectionValues(ast.expression, schema.entity),
          undefined,
          schema.cardinality,
        ),
    );

const toZodFieldSchema = (field: AnyFieldDefinition): ZodType => {
  let schema: ZodType;

  if (isReferenceFieldDefinition(field)) {
    schema = z.custom(isEntityRef).superRefine((value, context) => {
      try {
        lowerEntityReferenceValue(field, value);
      } catch (cause) {
        context.addIssue({
          code: 'custom',
          message: cause instanceof Error ? cause.message : `Invalid ${field.target.name} Ref.`,
        });
      }
    });
  } else if (
    field.fieldType === 'id' ||
    field.fieldType === 'string' ||
    field.fieldType === 'date'
  ) {
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

    if (field.stringConstraints?.exclude) {
      const { values, caseInsensitive } = field.stringConstraints.exclude;
      const normalizeExcludedValue = (value: string) => {
        const normalized = field.stringConstraints?.trim ? value.trim() : value;
        return caseInsensitive ? normalized.toLowerCase() : normalized;
      };
      const excludedValues = new Set(values.map(normalizeExcludedValue));

      stringSchema = stringSchema.refine(
        value => !excludedValues.has(normalizeExcludedValue(value)),
        { message: field.stringConstraints.messages?.exclude },
      );
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

  if (isGraphSelectionDefinition(schema)) {
    return toZodSelectionSchema(schema);
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
