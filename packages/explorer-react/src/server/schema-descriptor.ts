import {
  isGraphSchemaDefinition,
  toGraphJsonSchema,
  type GraphSchemaDefinition,
} from '@ontahi/core/data-graph';

import type {
  ExplorerSchemaDescriptor,
  ExplorerSchemaField,
  ExplorerSchemaVariant,
} from '../contracts/index.js';

type JsonSchemaObject = {
  title?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
  allOf?: JsonSchemaObject[];
  $ref?: string;
  $defs?: Record<string, JsonSchemaObject>;
  presentation?: {
    booleanLabels?: {
      true?: unknown;
      false?: unknown;
      unset?: unknown;
    };
  };
  'x-ontahi-selection'?: {
    entityName: string;
    cardinality: 'one' | 'many';
    identity?: {
      name: string;
      fields: string[];
    };
  };
};

const isVoidGraphSchema = (schema: GraphSchemaDefinition): boolean =>
  schema.kind === 'schema.void' ||
  (schema.kind === 'schema.named' &&
    isGraphSchemaDefinition(schema.item) &&
    isVoidGraphSchema(schema.item));

type JsonSchemaContext = {
  definitions: Record<string, JsonSchemaObject>;
};

const notDeclaredSchema = (summary: string): ExplorerSchemaDescriptor => ({
  source: 'not-declared',
  summary,
  fields: [],
});

export const undeclaredInputSchema = (): ExplorerSchemaDescriptor =>
  notDeclaredSchema('No runtime input schema is declared.');

export const undeclaredResultSchema = (): ExplorerSchemaDescriptor =>
  notDeclaredSchema('Return type is TypeScript-only; no runtime result schema is declared yet.');

const formatLiteral = (value: unknown) =>
  typeof value === 'string' ? `"${value}"` : JSON.stringify(value);

const getSchemaVariants = (schema: JsonSchemaObject) => schema.anyOf ?? schema.oneOf ?? [];

const refName = (ref: string) => ref.replace(/^#\/\$defs\//, '');

const resolveSchemaRef = (schema: JsonSchemaObject, context: JsonSchemaContext) =>
  schema.$ref ? context.definitions[refName(schema.$ref)] : undefined;

const describeObjectVariantLabel = (schema: JsonSchemaObject, context: JsonSchemaContext) => {
  if (schema.$ref) {
    return refName(schema.$ref);
  }

  if (schema.title) {
    return schema.title;
  }

  const discriminator = schema.properties?.type;

  if (typeof discriminator?.const === 'string') {
    return discriminator.const;
  }

  const enumValues = discriminator?.enum?.filter(
    (value): value is string => typeof value === 'string',
  );

  return enumValues?.length ? enumValues.join(' | ') : undefined;
};

const formatArrayItemType = (type: string) =>
  type.includes(' | ') || type.includes(' & ') ? `(${type})` : type;

const describeSchemaType = (schema: JsonSchemaObject, context: JsonSchemaContext): string => {
  if (schema.$ref) {
    return refName(schema.$ref);
  }

  if (schema.title) {
    return schema.title;
  }

  if (schema.const !== undefined) {
    return formatLiteral(schema.const);
  }

  if (schema.enum) {
    return schema.enum.map(formatLiteral).join(' | ');
  }

  const variants = schema.anyOf ?? schema.oneOf;
  if (variants?.length) {
    return [
      ...new Set(
        variants.map(
          variant =>
            describeObjectVariantLabel(variant, context) ?? describeSchemaType(variant, context),
        ),
      ),
    ].join(' | ');
  }

  if (schema.allOf?.length) {
    return schema.allOf.map(child => describeSchemaType(child, context)).join(' & ');
  }

  if (schema.type === 'array') {
    return `${formatArrayItemType(describeSchemaType(schema.items ?? {}, context))}[]`;
  }

  if (Array.isArray(schema.type)) {
    return schema.type.join(' | ');
  }

  return schema.type ?? 'unknown';
};

const getStringEnumValues = (schema: JsonSchemaObject): string[] => {
  const directValues = [
    ...(schema.enum ?? []).filter((value): value is string => typeof value === 'string'),
    ...(typeof schema.const === 'string' ? [schema.const] : []),
  ];
  const variantValues = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].flatMap(
    getStringEnumValues,
  );

  return [...new Set([...directValues, ...variantValues])];
};

const enumValuesMetadata = (schema: JsonSchemaObject) => {
  const enumValues = getStringEnumValues(schema);

  return enumValues.length > 0 ? { enumValues } : {};
};

const schemaFieldTypeMetadata = (
  schema: JsonSchemaObject,
  context: JsonSchemaContext,
): Pick<ExplorerSchemaField, 'type' | 'valueType'> => {
  const namedScalar = Boolean(
    schema.title &&
    !schema.$ref &&
    !schema.properties &&
    !isArraySchema(schema) &&
    getSchemaVariants(schema).length === 0 &&
    !schema.allOf?.length,
  );

  return {
    type: namedScalar
      ? Array.isArray(schema.type)
        ? schema.type.join(' | ')
        : (schema.type ?? describeSchemaType(schema, context))
      : describeSchemaType(schema, context),
    ...(namedScalar && schema.title ? { valueType: schema.title } : {}),
  };
};

const presentationMetadata = (
  schema: JsonSchemaObject,
): Pick<ExplorerSchemaField, 'presentation'> => {
  const labels = schema.presentation?.booleanLabels;

  if (!labels) {
    return {};
  }

  const booleanLabels = {
    ...(typeof labels.true === 'string' ? { true: labels.true } : {}),
    ...(typeof labels.false === 'string' ? { false: labels.false } : {}),
    ...(typeof labels.unset === 'string' ? { unset: labels.unset } : {}),
  };

  return Object.keys(booleanLabels).length > 0
    ? {
        presentation: {
          booleanLabels,
        },
      }
    : {};
};

const selectionMetadata = (schema: JsonSchemaObject) => {
  const selection = schema['x-ontahi-selection'];

  return selection
    ? {
        type: `Selection<${selection.entityName}>`,
        selection,
      }
    : undefined;
};

const isArraySchema = (schema: JsonSchemaObject) =>
  schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'));

const hasNestedSchemaFields = (
  schema: JsonSchemaObject,
  context: JsonSchemaContext,
  visitedRefs: Set<string>,
): boolean => {
  if (schema.$ref) {
    const name = refName(schema.$ref);
    const resolved = resolveSchemaRef(schema, context);

    return Boolean(
      resolved &&
      !visitedRefs.has(name) &&
      hasNestedSchemaFields(resolved, context, new Set([...visitedRefs, name])),
    );
  }

  const variants = getSchemaVariants(schema);

  if (variants.length > 0) {
    return variants.some(variant => hasNestedSchemaFields(variant, context, visitedRefs));
  }

  if (schema.allOf?.length) {
    return schema.allOf.some(child => hasNestedSchemaFields(child, context, visitedRefs));
  }

  if (schema.properties) {
    return true;
  }

  return Boolean(
    isArraySchema(schema) &&
    schema.items &&
    hasNestedSchemaFields(schema.items, context, visitedRefs),
  );
};

const describeSchemaFieldVariants = (
  schema: JsonSchemaObject,
  pathPrefix: string,
  required: boolean,
  context: JsonSchemaContext,
  visitedRefs: Set<string>,
): ExplorerSchemaVariant[] => {
  if (!pathPrefix) {
    return [];
  }

  if (schema.$ref) {
    const name = refName(schema.$ref);
    const resolved = resolveSchemaRef(schema, context);

    if (!resolved || visitedRefs.has(name)) {
      return [];
    }

    const nextVisitedRefs = new Set([...visitedRefs, name]);
    const resolvedVariants = getSchemaVariants(resolved);

    if (resolvedVariants.length > 0) {
      return describeSchemaFieldVariants(resolved, pathPrefix, required, context, nextVisitedRefs);
    }

    if (!hasNestedSchemaFields(resolved, context, nextVisitedRefs)) {
      return [];
    }

    return [
      {
        type: name,
        fields: flattenNestedSchemaFields(resolved, pathPrefix, required, context, nextVisitedRefs),
      },
    ];
  }

  if (schema.title && schema.properties) {
    return [
      {
        type: schema.title,
        fields: flattenNestedSchemaFields(schema, pathPrefix, required, context, visitedRefs),
      },
    ];
  }

  const variants = getSchemaVariants(schema);

  if (variants.length > 0) {
    return variants.flatMap(variant => {
      const fields = flattenNestedSchemaFields(variant, pathPrefix, required, context, visitedRefs);

      return fields.length > 0
        ? [
            {
              type:
                describeObjectVariantLabel(variant, context) ??
                describeSchemaType(variant, context),
              fields,
            },
          ]
        : [];
    });
  }

  return isArraySchema(schema) && schema.items
    ? describeSchemaFieldVariants(schema.items, `${pathPrefix}[]`, required, context, visitedRefs)
    : [];
};

const mergeSchemaVariants = (variants: ExplorerSchemaVariant[]) => {
  const byType = new Map<string, ExplorerSchemaVariant>();

  for (const variant of variants) {
    const current = byType.get(variant.type);

    byType.set(variant.type, {
      type: variant.type,
      fields: current ? mergeSchemaFields([...current.fields, ...variant.fields]) : variant.fields,
    });
  }

  return [...byType.values()];
};

const mergeSchemaFields = (fields: ExplorerSchemaField[]) => {
  const byPath = new Map<string, ExplorerSchemaField>();

  for (const field of fields) {
    const current = byPath.get(field.path);

    if (!current) {
      byPath.set(field.path, field);
      continue;
    }

    const types = [...new Set([...current.type.split(' | '), ...field.type.split(' | ')])];
    const enumValues = [...new Set([...(current.enumValues ?? []), ...(field.enumValues ?? [])])];
    const variants = mergeSchemaVariants([...(current.variants ?? []), ...(field.variants ?? [])]);
    const presentation = current.presentation ?? field.presentation;
    const valueType = current.valueType ?? field.valueType;

    byPath.set(field.path, {
      path: field.path,
      type: types.join(' | '),
      required: current.required && field.required,
      ...(current.description || field.description
        ? { description: current.description ?? field.description }
        : {}),
      ...(enumValues.length > 0 ? { enumValues } : {}),
      ...(variants.length > 0 ? { variants } : {}),
      ...(presentation ? { presentation } : {}),
      ...(valueType ? { valueType } : {}),
    });
  }

  return [...byPath.values()];
};

const flattenNestedSchemaFields = (
  schema: JsonSchemaObject,
  pathPrefix: string,
  required: boolean,
  context: JsonSchemaContext,
  visitedRefs: Set<string>,
): ExplorerSchemaField[] => {
  if (schema.$ref) {
    const name = refName(schema.$ref);
    const resolved = resolveSchemaRef(schema, context);

    return resolved && !visitedRefs.has(name)
      ? flattenNestedSchemaFields(
          resolved,
          pathPrefix,
          required,
          context,
          new Set([...visitedRefs, name]),
        )
      : [];
  }

  const variants = getSchemaVariants(schema);

  if (variants.length > 0) {
    return mergeSchemaFields(
      variants.flatMap(variant =>
        flattenNestedSchemaFields(variant, pathPrefix, required, context, visitedRefs),
      ),
    );
  }

  if (schema.properties) {
    return flattenSchemaFields(schema, pathPrefix, required, context, visitedRefs);
  }

  return isArraySchema(schema) &&
    schema.items &&
    hasNestedSchemaFields(schema.items, context, visitedRefs)
    ? flattenSchemaFields(schema.items, `${pathPrefix}[]`, required, context, visitedRefs)
    : [];
};

const flattenSchemaFields = (
  schema: JsonSchemaObject,
  pathPrefix = '',
  required = true,
  context: JsonSchemaContext,
  visitedRefs = new Set<string>(),
): ExplorerSchemaField[] => {
  if (schema.$ref) {
    const name = refName(schema.$ref);
    const resolved = resolveSchemaRef(schema, context);
    const shouldEmitCurrent = pathPrefix && !pathPrefix.endsWith('[]');
    const variants = describeSchemaFieldVariants(
      schema,
      pathPrefix,
      required,
      context,
      visitedRefs,
    );
    const current = shouldEmitCurrent
      ? [
          {
            path: pathPrefix,
            type: name,
            required,
            ...(schema.description ? { description: schema.description } : {}),
            ...(variants.length > 0 ? { variants } : {}),
            ...presentationMetadata(schema),
          },
        ]
      : [];

    if (!resolved || visitedRefs.has(name)) {
      return current;
    }

    return [
      ...current,
      ...flattenNestedSchemaFields(
        resolved,
        pathPrefix,
        required,
        context,
        new Set([...visitedRefs, name]),
      ),
    ];
  }

  const variants = getSchemaVariants(schema);

  if (variants.length > 0) {
    return mergeSchemaFields(
      variants.flatMap(variant =>
        flattenSchemaFields(variant, pathPrefix, required, context, visitedRefs),
      ),
    );
  }

  if (isArraySchema(schema)) {
    if (!schema.items) {
      return pathPrefix
        ? [
            {
              path: pathPrefix,
              ...schemaFieldTypeMetadata(schema, context),
              required,
              ...(schema.description ? { description: schema.description } : {}),
              ...enumValuesMetadata(schema),
              ...presentationMetadata(schema),
            },
          ]
        : [];
    }

    return flattenSchemaFields(
      schema.items,
      pathPrefix ? `${pathPrefix}[]` : '[]',
      required,
      context,
      visitedRefs,
    );
  }

  const properties = schema.properties;

  if (!properties) {
    return pathPrefix
      ? [
          {
            path: pathPrefix,
            ...schemaFieldTypeMetadata(schema, context),
            required,
            ...(schema.description ? { description: schema.description } : {}),
            ...enumValuesMetadata(schema),
            ...presentationMetadata(schema),
          },
        ]
      : [];
  }

  const requiredProperties = new Set(schema.required ?? []);

  return Object.entries(properties).flatMap(([name, child]) => {
    const path = pathPrefix ? `${pathPrefix}.${name}` : name;
    const childRequired = required && requiredProperties.has(name);
    const variants = describeSchemaFieldVariants(child, path, childRequired, context, visitedRefs);
    const selection = selectionMetadata(child);
    const current = {
      path,
      ...(selection ? { type: selection.type } : schemaFieldTypeMetadata(child, context)),
      required: childRequired,
      ...(child.description ? { description: child.description } : {}),
      ...enumValuesMetadata(child),
      ...(variants.length > 0 ? { variants } : {}),
      ...presentationMetadata(child),
      ...(selection ? { selection: selection.selection } : {}),
    };
    const nested = selection
      ? []
      : flattenNestedSchemaFields(child, path, childRequired, context, visitedRefs);

    return [current, ...nested];
  });
};

const summarizeJsonSchema = (
  schema: JsonSchemaObject,
  context: JsonSchemaContext,
  options?: { io?: 'input' | 'output' },
  preferTitle = false,
): string => {
  if (schema.$ref) {
    return refName(schema.$ref);
  }

  if (preferTitle && schema.title) {
    return schema.title;
  }

  const variants = getSchemaVariants(schema);

  if (variants.length > 0) {
    return [
      ...new Set(variants.map(variant => summarizeJsonSchema(variant, context, options, true))),
    ].join(' | ');
  }

  if (schema.properties) {
    const count = Object.keys(schema.properties).length;

    return count === 0
      ? options?.io === 'input'
        ? 'no input fields'
        : 'object with no fields'
      : `object with ${count} field${count === 1 ? '' : 's'}`;
  }

  return describeSchemaType(schema, context);
};

export const describeRuntimeSchema = (
  schema: unknown,
  options?: { io?: 'input' | 'output' },
): ExplorerSchemaDescriptor => {
  if (!schema) {
    return undeclaredInputSchema();
  }

  if (isGraphSchemaDefinition(schema)) {
    return describeGraphSchema(schema, options);
  }

  return {
    source: 'unknown',
    summary: 'Runtime schema exists, but it is not a recognized Ontahi schema.',
    fields: [],
  };
};

export const describeGraphSchema = (
  schema: GraphSchemaDefinition,
  options?: { io?: 'input' | 'output' },
): ExplorerSchemaDescriptor => {
  try {
    const io = options?.io ?? 'input';
    const jsonSchema = toGraphJsonSchema(schema) as JsonSchemaObject;

    if (isVoidGraphSchema(schema)) {
      return {
        source: 'ontahi',
        summary: 'void',
        fields: [],
        jsonSchema,
      };
    }

    const context = {
      definitions: jsonSchema.$defs ?? {},
    };

    return {
      source: 'ontahi',
      summary: summarizeJsonSchema(jsonSchema, context, { io }),
      fields: flattenSchemaFields(jsonSchema, '', true, context),
      jsonSchema,
    };
  } catch (error) {
    return {
      source: 'ontahi',
      summary: 'Ontahi schema could not be described.',
      fields: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
