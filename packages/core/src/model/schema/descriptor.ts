import type { GraphSchemaPresentation } from '../../value/schema/presentation.js';
import type { DerivedFieldMetadata } from '../entity/field.js';
import type { EntityVariantDescriptor } from '../entity/variant-contract.js';

export type GraphSchemaScalarType =
  | 'id'
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
  | 'enum';

export type GraphSchemaFieldSource =
  | 'caller-required'
  | 'caller-optional'
  | 'defaulted'
  | 'generated'
  | 'derived';

export type GraphSchemaFieldSemantics = {
  source: GraphSchemaFieldSource;
  nullable: boolean;
};

export type GraphSchemaDescriptor = (
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
  | GraphSchemaVoidDescriptor
) & {
  /** Present when this schema node was reflected from an Entity or Value Field declaration. */
  field?: GraphSchemaFieldSemantics;
};

export type GraphSchemaScalarDescriptor = {
  kind: 'scalar';
  type: GraphSchemaScalarType;
  valueType?: string;
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
  readOnly?: true;
  derived?: DerivedFieldMetadata;
  generatedBy?: string;
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
  mutationRequirement?: 'existing';
  variant?: EntityVariantDescriptor;
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
  minItems?: number;
  maxItems?: number;
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
  readOnly?: boolean;
  'x-ontahi-derived'?: DerivedFieldMetadata;
  'x-ontahi-generated-by'?: string;
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
    mutationRequirement?: 'existing';
    variant?: EntityVariantDescriptor;
  };
};

const scalarJsonSchema = (descriptor: GraphSchemaScalarDescriptor): GraphJsonSchema => {
  const stringConstraints = descriptor.stringConstraints;
  const numberConstraints = descriptor.numberConstraints;
  const isString = ['id', 'string', 'date', 'enum'].includes(descriptor.type);

  return {
    ...(descriptor.valueType ? { title: descriptor.valueType } : {}),
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
    ...(descriptor.readOnly ? { readOnly: true } : {}),
    ...(descriptor.derived ? { 'x-ontahi-derived': descriptor.derived } : {}),
    ...(descriptor.generatedBy ? { 'x-ontahi-generated-by': descriptor.generatedBy } : {}),
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
        ...(descriptor.mutationRequirement
          ? { mutationRequirement: descriptor.mutationRequirement }
          : {}),
        ...(descriptor.variant ? { variant: structuredClone(descriptor.variant) } : {}),
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
    return {
      type: 'array',
      items: descriptorToJsonSchema(descriptor.item, context),
      ...(descriptor.minItems === undefined ? {} : { minItems: descriptor.minItems }),
      ...(descriptor.maxItems === undefined ? {} : { maxItems: descriptor.maxItems }),
    };
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
