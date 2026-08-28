import type {
  AnyEntityDefinition,
  AnyEntityViewDefinition,
  AnyFieldDefinition,
  AnyGraphObjectDefinition,
  AnyReferenceFieldDefinition,
  AnyValueDefinition,
  GraphArrayDefinition,
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
  GraphSchemaPresentation,
  GraphTransformDefinition,
  GraphUnionDefinition,
} from './definitions.js';
import { isReferenceFieldDefinition } from './definitions.js';

export type GraphSchemaScalarType =
  | 'id'
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
  | 'enum';

export type GraphSchemaDescriptor =
  | GraphSchemaScalarDescriptor
  | GraphSchemaReferenceDescriptor
  | GraphSchemaObjectDescriptor
  | GraphSchemaArrayDescriptor
  | GraphSchemaNullableDescriptor
  | GraphSchemaOptionalDescriptor
  | GraphSchemaLiteralDescriptor
  | GraphSchemaUnionDescriptor
  | GraphSchemaRecordDescriptor
  | GraphSchemaDefaultDescriptor
  | GraphSchemaTransformDescriptor
  | GraphSchemaRefinementDescriptor
  | GraphSchemaLazyDescriptor
  | GraphSchemaNamedDescriptor
  | GraphSelectionDescriptor
  | GraphSchemaVoidDescriptor;

export type GraphSchemaScalarDescriptor = {
  kind: 'scalar';
  type: GraphSchemaScalarType;
  enumValues?: string[];
  stringConstraints?: {
    minLength?: number;
    maxLength?: number;
    trim?: true;
    exclude?: {
      values: readonly string[];
      caseInsensitive?: true;
    };
    pattern?: { source: string; flags?: string };
    format?: 'email' | 'url' | 'uuid' | 'datetime';
    messages?: {
      required?: string;
      minLength?: string;
      maxLength?: string;
      exclude?: string;
      pattern?: string;
      format?: string;
    };
  };
  numberConstraints?: {
    coerce?: true;
    integer?: true;
    min?: number;
    max?: number;
    multipleOf?: number;
  };
  description?: string;
  presentation?: GraphSchemaPresentation;
};

export type GraphSchemaReferenceDescriptor = {
  kind: 'entity-ref';
  entityName: string;
  identity?: {
    name: string;
    fields: string[];
  };
  description?: string;
  presentation?: GraphSchemaPresentation;
  resolution?: 'existing';
};

export type GraphSchemaObjectDescriptor = {
  kind: 'object';
  role: 'object' | 'value' | 'entity' | 'entity-view';
  name?: string;
  entityName?: string;
  fields: Record<string, GraphSchemaDescriptor>;
  unknownKeys: 'strip' | 'strict' | 'passthrough';
  description?: string;
  derivedFrom?: {
    operation: 'pick';
    source: {
      kind: 'entity' | 'entity-view' | 'value' | 'object';
      name?: string;
    };
    fields: string[];
  };
};

export type GraphSchemaArrayDescriptor = {
  kind: 'array';
  item: GraphSchemaDescriptor;
};

export type GraphSchemaNullableDescriptor = {
  kind: 'nullable';
  item: GraphSchemaDescriptor;
};

export type GraphSchemaOptionalDescriptor = {
  kind: 'optional';
  item: GraphSchemaDescriptor;
};

export type GraphSchemaLiteralDescriptor = {
  kind: 'literal';
  value: string | number | boolean | null;
  description?: string;
};

export type GraphSchemaUnionDescriptor = {
  kind: 'union';
  options: GraphSchemaDescriptor[];
  discriminator?: string;
  description?: string;
};

export type GraphSchemaRecordDescriptor = {
  kind: 'record';
  value: GraphSchemaDescriptor;
  description?: string;
};

export type GraphSchemaDefaultDescriptor = {
  kind: 'default';
  item: GraphSchemaDescriptor;
  defaultValue: unknown;
};

export type GraphSchemaTransformDescriptor = {
  kind: 'transform';
  item: GraphSchemaDescriptor;
};

export type GraphSchemaRefinementDescriptor = {
  kind: 'refinement';
  item: GraphSchemaDescriptor;
  message: string;
  path?: Array<string | number>;
  rule?: string;
};

export type GraphSchemaLazyDescriptor = {
  kind: 'lazy';
  name: string;
  item?: GraphSchemaDescriptor;
};

export type GraphSchemaNamedDescriptor = {
  kind: 'named';
  name: string;
  item: GraphSchemaDescriptor;
};

export type GraphSelectionDescriptor = {
  kind: 'selection';
  entityName: string;
  cardinality: 'one' | 'many';
  identity?: {
    name: string;
    fields: string[];
  };
};

export type GraphSchemaVoidDescriptor = {
  kind: 'void';
};

export type GraphJsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, GraphJsonSchema>;
  required?: string[];
  additionalProperties?: boolean | GraphJsonSchema;
  items?: GraphJsonSchema;
  anyOf?: GraphJsonSchema[];
  default?: unknown;
  $ref?: string;
  $defs?: Record<string, GraphJsonSchema>;
  presentation?: GraphSchemaPresentation;
  'x-ontahi-string-exclusion'?: {
    values: readonly string[];
    caseInsensitive?: true;
    message?: string;
  };
  'x-ontahi-selection'?: {
    entityName: string;
    cardinality: 'one' | 'many';
    identity?: {
      name: string;
      fields: string[];
    };
  };
  'x-ontahi-entity-ref'?: {
    entityName: string;
    identity?: {
      name: string;
      fields: string[];
    };
    resolution?: 'existing';
  };
};

const descriptorFields = (fields: GraphSchemaFields, resolvingLazyNames: Set<string>) =>
  Object.fromEntries(
    Object.entries(fields).map(([name, schema]) => [
      name,
      toGraphSchemaDescriptor(schema as GraphSchemaDefinition, resolvingLazyNames),
    ]),
  );

const graphSchemaKinds = new Set<GraphSchemaDefinition['kind']>([
  'field',
  'entity',
  'entity-view',
  'value',
  'schema.object',
  'schema.array',
  'schema.nullable',
  'schema.optional',
  'schema.literal',
  'schema.union',
  'schema.record',
  'schema.default',
  'schema.transform',
  'schema.refinement',
  'schema.lazy',
  'schema.named',
  'schema.selection',
  'schema.void',
]);

export const isGraphSchemaDefinition = (value: unknown): value is GraphSchemaDefinition =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  typeof value.kind === 'string' &&
  graphSchemaKinds.has(value.kind as GraphSchemaDefinition['kind']);

const entityViewFields = (view: AnyEntityViewDefinition): GraphSchemaFields => {
  const omitted = new Set(view.omit);

  return {
    ...Object.fromEntries(
      Object.entries(view.entity.fields).filter(([fieldName]) => !omitted.has(fieldName)),
    ),
    ...view.fields,
  };
};

const describeReferenceField = (
  field: AnyReferenceFieldDefinition,
): GraphSchemaReferenceDescriptor => {
  const identityName = field.target.identityLocatorName;
  const identity = identityName ? field.target.refLocators[identityName] : undefined;

  return {
    kind: 'entity-ref',
    entityName: field.target.name,
    ...(identityName && identity?.fields
      ? { identity: { name: identityName, fields: [...identity.fields] } }
      : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(field.presentation ? { presentation: field.presentation } : {}),
    ...(field.referenceRequirement ? { resolution: field.referenceRequirement } : {}),
  };
};

const describeField = (
  field: AnyFieldDefinition,
): GraphSchemaScalarDescriptor | GraphSchemaReferenceDescriptor =>
  isReferenceFieldDefinition(field)
    ? describeReferenceField(field)
    : {
        kind: 'scalar',
        type: field.fieldType as GraphSchemaScalarType,
        ...(field.enumValues ? { enumValues: [...field.enumValues] } : {}),
        ...(field.stringConstraints ? { stringConstraints: { ...field.stringConstraints } } : {}),
        ...(field.numberConstraints ? { numberConstraints: { ...field.numberConstraints } } : {}),
        ...(field.description ? { description: field.description } : {}),
        ...(field.presentation ? { presentation: field.presentation } : {}),
      };

const describeEntity = (
  entity: AnyEntityDefinition,
  resolvingLazyNames: Set<string>,
): GraphSchemaObjectDescriptor => ({
  kind: 'object',
  role: 'entity',
  name: entity.name,
  entityName: entity.name,
  fields: descriptorFields(entity.fields, resolvingLazyNames),
  unknownKeys: 'strip',
});

const describeEntityView = (
  view: AnyEntityViewDefinition,
  resolvingLazyNames: Set<string>,
): GraphSchemaObjectDescriptor => ({
  kind: 'object',
  role: 'entity-view',
  name: view.name,
  entityName: view.entity.name,
  fields: descriptorFields(entityViewFields(view), resolvingLazyNames),
  unknownKeys: 'strip',
});

const describeValue = (
  schema: AnyValueDefinition,
  resolvingLazyNames: Set<string>,
): GraphSchemaObjectDescriptor => ({
  kind: 'object',
  role: 'value',
  name: schema.name,
  fields: descriptorFields(schema.fields, resolvingLazyNames),
  unknownKeys: schema.unknownKeys ?? 'strip',
  ...(schema.derivedFrom
    ? {
        derivedFrom: {
          ...schema.derivedFrom,
          fields: [...schema.derivedFrom.fields],
        },
      }
    : {}),
});

const describeObject = (
  schema: AnyGraphObjectDefinition,
  resolvingLazyNames: Set<string>,
): GraphSchemaObjectDescriptor => ({
  kind: 'object',
  role: 'object',
  fields: descriptorFields(schema.fields, resolvingLazyNames),
  unknownKeys: schema.unknownKeys,
  ...(schema.description ? { description: schema.description } : {}),
});

export const toGraphSchemaDescriptor = (
  schema: GraphSchemaDefinition,
  resolvingLazyNames = new Set<string>(),
): GraphSchemaDescriptor => {
  if (schema.kind === 'field') {
    const descriptor = describeField(schema);
    const nullableDescriptor: GraphSchemaDescriptor = schema.nullable
      ? { kind: 'nullable', item: descriptor }
      : descriptor;

    return schema.optional ? { kind: 'optional', item: nullableDescriptor } : nullableDescriptor;
  }

  if (schema.kind === 'entity') {
    return describeEntity(schema, resolvingLazyNames);
  }

  if (schema.kind === 'entity-view') {
    return describeEntityView(schema, resolvingLazyNames);
  }

  if (schema.kind === 'value') {
    return describeValue(schema, resolvingLazyNames);
  }

  if (schema.kind === 'schema.object') {
    return describeObject(schema, resolvingLazyNames);
  }

  if (schema.kind === 'schema.array') {
    return {
      kind: 'array',
      item: toGraphSchemaDescriptor((schema as GraphArrayDefinition).item, resolvingLazyNames),
    };
  }

  if (schema.kind === 'schema.nullable') {
    return {
      kind: 'nullable',
      item: toGraphSchemaDescriptor((schema as GraphNullableDefinition).item, resolvingLazyNames),
    };
  }

  if (schema.kind === 'schema.optional') {
    return {
      kind: 'optional',
      item: toGraphSchemaDescriptor((schema as GraphOptionalDefinition).item, resolvingLazyNames),
    };
  }

  if (schema.kind === 'schema.literal') {
    const literal = schema as GraphLiteralDefinition;

    return {
      kind: 'literal',
      value: literal.value,
      ...(literal.description ? { description: literal.description } : {}),
    };
  }

  if (schema.kind === 'schema.union') {
    const union = schema as GraphUnionDefinition;

    return {
      kind: 'union',
      options: union.options.map(option => toGraphSchemaDescriptor(option, resolvingLazyNames)),
      ...(union.discriminator ? { discriminator: union.discriminator } : {}),
      ...(union.description ? { description: union.description } : {}),
    };
  }

  if (schema.kind === 'schema.record') {
    const record = schema as GraphRecordDefinition;

    return {
      kind: 'record',
      value: toGraphSchemaDescriptor(record.value, resolvingLazyNames),
      ...(record.description ? { description: record.description } : {}),
    };
  }

  if (schema.kind === 'schema.default') {
    const defaultSchema = schema as unknown as {
      item: GraphSchemaDefinition;
      defaultValue: unknown;
    };

    return {
      kind: 'default',
      item: toGraphSchemaDescriptor(defaultSchema.item, resolvingLazyNames),
      defaultValue: defaultSchema.defaultValue,
    };
  }

  if (schema.kind === 'schema.transform') {
    return {
      kind: 'transform',
      item: toGraphSchemaDescriptor((schema as GraphTransformDefinition).item, resolvingLazyNames),
    };
  }

  if (schema.kind === 'schema.refinement') {
    const refinement = schema as GraphRefinementDefinition;

    return {
      kind: 'refinement',
      item: toGraphSchemaDescriptor(refinement.item, resolvingLazyNames),
      message: refinement.message,
      ...(refinement.path ? { path: [...refinement.path] } : {}),
      ...(refinement.rule ? { rule: refinement.rule } : {}),
    };
  }

  if (schema.kind === 'schema.lazy') {
    const lazy = schema as GraphLazyDefinition;

    if (resolvingLazyNames.has(lazy.name)) {
      return { kind: 'lazy', name: lazy.name };
    }

    resolvingLazyNames.add(lazy.name);
    const item = toGraphSchemaDescriptor(lazy.resolve(), resolvingLazyNames);
    resolvingLazyNames.delete(lazy.name);

    return { kind: 'lazy', name: lazy.name, item };
  }

  if (schema.kind === 'schema.named') {
    const named = schema as GraphNamedDefinition;

    return {
      kind: 'named',
      name: named.name,
      item: toGraphSchemaDescriptor(named.item, resolvingLazyNames),
    };
  }

  if (schema.kind === 'schema.selection') {
    const selection = schema as GraphSelectionDefinition;
    const identityName = selection.entity.identityLocatorName;
    const identity = identityName ? selection.entity.refLocators[identityName] : undefined;

    return {
      kind: 'selection',
      entityName: selection.entity.name,
      cardinality: selection.cardinality,
      ...(identityName && identity?.fields
        ? { identity: { name: identityName, fields: [...identity.fields] } }
        : {}),
    };
  }

  return { kind: 'void' };
};

const scalarJsonSchema = (descriptor: GraphSchemaScalarDescriptor): GraphJsonSchema => {
  const stringConstraints = descriptor.stringConstraints;
  const numberConstraints = descriptor.numberConstraints;
  const isString = ['id', 'string', 'date', 'enum'].includes(descriptor.type);

  return {
    type:
      descriptor.type === 'number'
        ? numberConstraints?.integer
          ? 'integer'
          : 'number'
        : descriptor.type === 'boolean'
          ? 'boolean'
          : descriptor.type === 'json'
            ? undefined
            : 'string',
    ...(descriptor.enumValues ? { enum: descriptor.enumValues } : {}),
    ...(isString && stringConstraints?.minLength !== undefined
      ? { minLength: stringConstraints.minLength }
      : {}),
    ...(isString && stringConstraints?.maxLength !== undefined
      ? { maxLength: stringConstraints.maxLength }
      : {}),
    ...(isString && stringConstraints?.exclude
      ? {
          'x-ontahi-string-exclusion': {
            ...stringConstraints.exclude,
            ...(stringConstraints.messages?.exclude
              ? { message: stringConstraints.messages.exclude }
              : {}),
          },
        }
      : {}),
    ...(isString && stringConstraints?.pattern
      ? { pattern: stringConstraints.pattern.source }
      : {}),
    ...(isString && stringConstraints?.format ? { format: stringConstraints.format } : {}),
    ...(numberConstraints?.min !== undefined ? { minimum: numberConstraints.min } : {}),
    ...(numberConstraints?.max !== undefined ? { maximum: numberConstraints.max } : {}),
    ...(numberConstraints?.multipleOf !== undefined
      ? { multipleOf: numberConstraints.multipleOf }
      : {}),
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(descriptor.presentation ? { presentation: descriptor.presentation } : {}),
  };
};

const isRequiredDescriptor = (descriptor: GraphSchemaDescriptor) =>
  descriptor.kind !== 'optional' && descriptor.kind !== 'default';

type GraphJsonSchemaContext = {
  definitions: Record<string, GraphJsonSchema>;
  resolving: Set<string>;
};

const descriptorToJsonSchema = (
  descriptor: GraphSchemaDescriptor,
  context: GraphJsonSchemaContext,
): GraphJsonSchema => {
  if (descriptor.kind === 'scalar') {
    return scalarJsonSchema(descriptor);
  }

  if (descriptor.kind === 'entity-ref') {
    return {
      type: 'object',
      properties: {
        kind: { const: 'entity-ref' },
        entityName: { const: descriptor.entityName },
        locator: { type: 'object', additionalProperties: true },
      },
      required: ['kind', 'entityName', 'locator'],
      additionalProperties: false,
      ...(descriptor.description ? { description: descriptor.description } : {}),
      ...(descriptor.presentation ? { presentation: descriptor.presentation } : {}),
      'x-ontahi-entity-ref': {
        entityName: descriptor.entityName,
        ...(descriptor.identity ? { identity: descriptor.identity } : {}),
        ...(descriptor.resolution ? { resolution: descriptor.resolution } : {}),
      },
    };
  }

  if (descriptor.kind === 'object') {
    const entries = Object.entries(descriptor.fields);
    const required = entries
      .filter(([, fieldDescriptor]) => isRequiredDescriptor(fieldDescriptor))
      .map(([name]) => name);

    return {
      type: 'object',
      ...(descriptor.name ? { title: descriptor.name } : {}),
      ...(descriptor.description ? { description: descriptor.description } : {}),
      properties: Object.fromEntries(
        entries.map(([name, fieldDescriptor]) => [
          name,
          descriptorToJsonSchema(fieldDescriptor, context),
        ]),
      ),
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: descriptor.unknownKeys === 'passthrough',
    };
  }

  if (descriptor.kind === 'array') {
    return { type: 'array', items: descriptorToJsonSchema(descriptor.item, context) };
  }

  if (descriptor.kind === 'nullable') {
    return {
      anyOf: [descriptorToJsonSchema(descriptor.item, context), { type: 'null' }],
    };
  }

  if (descriptor.kind === 'optional') {
    return descriptorToJsonSchema(descriptor.item, context);
  }

  if (descriptor.kind === 'literal') {
    return {
      const: descriptor.value,
      ...(descriptor.description ? { description: descriptor.description } : {}),
    };
  }

  if (descriptor.kind === 'union') {
    return {
      anyOf: descriptor.options.map(option => descriptorToJsonSchema(option, context)),
      ...(descriptor.description ? { description: descriptor.description } : {}),
    };
  }

  if (descriptor.kind === 'record') {
    return {
      type: 'object',
      additionalProperties: descriptorToJsonSchema(descriptor.value, context),
      ...(descriptor.description ? { description: descriptor.description } : {}),
    };
  }

  if (descriptor.kind === 'default') {
    return {
      ...descriptorToJsonSchema(descriptor.item, context),
      default: descriptor.defaultValue,
    };
  }

  if (descriptor.kind === 'transform' || descriptor.kind === 'refinement') {
    return descriptorToJsonSchema(descriptor.item, context);
  }

  if (descriptor.kind === 'lazy') {
    if (descriptor.item && !context.resolving.has(descriptor.name)) {
      context.resolving.add(descriptor.name);
      context.definitions[descriptor.name] = descriptorToJsonSchema(descriptor.item, context);
      context.resolving.delete(descriptor.name);
    }

    return { $ref: `#/$defs/${descriptor.name}` };
  }

  if (descriptor.kind === 'named') {
    return {
      ...descriptorToJsonSchema(descriptor.item, context),
      title: descriptor.name,
    };
  }

  if (descriptor.kind === 'selection') {
    return {
      type: 'object',
      'x-ontahi-selection': {
        entityName: descriptor.entityName,
        cardinality: descriptor.cardinality,
        ...(descriptor.identity ? { identity: descriptor.identity } : {}),
      },
      properties: {
        kind: { const: 'selection' },
        entityName: { const: descriptor.entityName },
        expression: { type: 'object' },
      },
      required: ['kind', 'entityName', 'expression'],
      additionalProperties: false,
    };
  }

  return {};
};

export const graphSchemaDescriptorToJsonSchema = (
  descriptor: GraphSchemaDescriptor,
): GraphJsonSchema => {
  const context: GraphJsonSchemaContext = {
    definitions: {},
    resolving: new Set<string>(),
  };
  const schema = descriptorToJsonSchema(descriptor, context);

  return Object.keys(context.definitions).length > 0
    ? { ...schema, $defs: context.definitions }
    : schema;
};

export const toGraphJsonSchema = (schema: GraphSchemaDefinition): GraphJsonSchema =>
  graphSchemaDescriptorToJsonSchema(toGraphSchemaDescriptor(schema));
