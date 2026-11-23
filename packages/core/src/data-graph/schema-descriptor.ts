import type { AnyEntityDefinition } from '../model/entity/definition.js';
import type { AnyFieldDefinition } from '../model/entity/field.js';
import {
  isReferenceFieldDefinition,
  type AnyReferenceFieldDefinition,
} from '../model/entity/reference-field.js';
import type {
  AnyEntityViewDefinition,
  AnyGraphObjectDefinition,
  AnyValueDefinition,
  GraphArrayDefinition,
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
} from '../model/schema/definition.js';
import { graphSchemaDescriptorToJsonSchema } from '../model/schema/descriptor.js';
import type {
  GraphJsonSchema,
  GraphSchemaDescriptor,
  GraphSchemaFieldSemantics,
  GraphSchemaObjectDescriptor,
  GraphSchemaReferenceDescriptor,
  GraphSchemaScalarDescriptor,
  GraphSchemaScalarType,
} from '../model/schema/descriptor.js';
import type { GraphLiteralDefinition } from '../value/schema/definition.js';

export { graphSchemaDescriptorToJsonSchema } from '../model/schema/descriptor.js';
export type {
  GraphJsonSchema,
  GraphSchemaArrayDescriptor,
  GraphSchemaDefaultDescriptor,
  GraphSchemaDescriptor,
  GraphSchemaFieldSemantics,
  GraphSchemaFieldSource,
  GraphSchemaLazyDescriptor,
  GraphSchemaLiteralDescriptor,
  GraphSchemaNamedDescriptor,
  GraphSchemaNullableDescriptor,
  GraphSchemaObjectDescriptor,
  GraphSchemaOptionalDescriptor,
  GraphSchemaRecordDescriptor,
  GraphSchemaReferenceDescriptor,
  GraphSchemaRefinementDescriptor,
  GraphSchemaScalarDescriptor,
  GraphSchemaScalarType,
  GraphSchemaTransformDescriptor,
  GraphSchemaUnionDescriptor,
  GraphSchemaVoidDescriptor,
  GraphSelectionDescriptor,
} from '../model/schema/descriptor.js';

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
    ...(field.referenceRequirement === 'existing'
      ? { resolution: field.referenceRequirement }
      : {}),
    ...(field.mutationRequirement ? { mutationRequirement: field.mutationRequirement } : {}),
    ...(field.variant ? { variant: structuredClone(field.variant) } : {}),
  };
};

const describeField = (field: AnyFieldDefinition): GraphSchemaDescriptor => {
  const descriptor: GraphSchemaScalarDescriptor | GraphSchemaReferenceDescriptor =
    isReferenceFieldDefinition(field)
      ? describeReferenceField(field)
      : {
          kind: 'scalar',
          type: field.fieldType as GraphSchemaScalarType,
          ...(field.valueType ? { valueType: field.valueType } : {}),
          ...(field.enumValues ? { enumValues: [...field.enumValues] } : {}),
          ...(field.stringConstraints ? { stringConstraints: { ...field.stringConstraints } } : {}),
          ...(field.numberConstraints ? { numberConstraints: { ...field.numberConstraints } } : {}),
          ...(field.description ? { description: field.description } : {}),
          ...(field.presentation ? { presentation: field.presentation } : {}),
          ...(field.derived ? { readOnly: true, derived: field.derived } : {}),
          ...(field.generatedBy ? { readOnly: true, generatedBy: field.generatedBy } : {}),
        };

  return Object.prototype.hasOwnProperty.call(field, 'defaultValue')
    ? { kind: 'default', item: descriptor, defaultValue: field.defaultValue }
    : descriptor;
};

const describeFieldSemantics = (field: AnyFieldDefinition): GraphSchemaFieldSemantics => ({
  source: field.derived
    ? 'derived'
    : field.generatedBy
      ? 'generated'
      : Object.prototype.hasOwnProperty.call(field, 'defaultValue')
        ? 'defaulted'
        : field.optional
          ? 'caller-optional'
          : 'caller-required',
  nullable: field.nullable === true,
});

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
    const reflected = schema.optional
      ? ({ kind: 'optional', item: nullableDescriptor } as const)
      : nullableDescriptor;

    return { ...reflected, field: describeFieldSemantics(schema) };
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
    const array = schema as GraphArrayDefinition;
    return {
      kind: 'array',
      item: toGraphSchemaDescriptor(array.item, resolvingLazyNames),
      ...(array.minItems === undefined ? {} : { minItems: array.minItems }),
      ...(array.maxItems === undefined ? {} : { maxItems: array.maxItems }),
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

export const toGraphJsonSchema = (schema: GraphSchemaDefinition): GraphJsonSchema =>
  graphSchemaDescriptorToJsonSchema(toGraphSchemaDescriptor(schema));
