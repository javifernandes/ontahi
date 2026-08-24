import type {
  AnyEntityDefinition,
  GraphSchemaFields,
  GraphSchemaLike,
  ReferenceFieldDefinition,
} from '../../data-graph/definitions.js';
import {
  bindEntityRefInputResolver,
  getGraphSchemaReferenceResolver,
  isEntityRef,
  type EntityRefInputResolutionScope,
  type EntityRefInputResolver,
} from '../../data-graph/ref/index.js';

type DefaultOperationRefResolver = (
  entity: AnyEntityDefinition,
) => EntityRefInputResolver<string, unknown>;

const unwrapTopLevelRef = (schema: GraphSchemaLike): ReferenceFieldDefinition | undefined => {
  let current = schema as GraphSchemaLike & Record<string, unknown>;

  while (current.kind === 'schema.optional' || current.kind === 'schema.nullable') {
    current = current.item as GraphSchemaLike & Record<string, unknown>;
  }

  return current.kind === 'field' && current.fieldType === 'reference'
    ? (current as ReferenceFieldDefinition)
    : undefined;
};

export const hydrateSchemaNativeOperationRefs = <TInput extends object>(
  schema: GraphSchemaLike,
  input: TInput,
  defaultResolver: DefaultOperationRefResolver,
  resolutionScope?: EntityRefInputResolutionScope,
): TInput => {
  const definition = schema as GraphSchemaLike & {
    fields?: GraphSchemaFields;
  };
  if ((definition.kind !== 'schema.object' && definition.kind !== 'value') || !definition.fields) {
    return input;
  }

  let hydrated: Record<string, unknown> | undefined;
  for (const [path, fieldSchema] of Object.entries(definition.fields)) {
    const reference = unwrapTopLevelRef(fieldSchema);
    const value = (input as Record<string, unknown>)[path];
    if (!reference || !isEntityRef(value) || value.entityName !== reference.target.name) continue;

    hydrated ??= { ...(input as Record<string, unknown>) };
    hydrated[path] = bindEntityRefInputResolver(
      value,
      getGraphSchemaReferenceResolver(reference) ?? defaultResolver(reference.target),
      resolutionScope,
    );
  }

  return (hydrated ?? input) as TInput;
};
