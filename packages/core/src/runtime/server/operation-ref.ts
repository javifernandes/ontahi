import { Effect } from 'effect';

import { toEffect } from '../../computation/effect.js';
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
import { isPlainObject } from '../../value/object.js';

import { failOperation } from './failures.js';

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

const hasExistingReference = (schema: GraphSchemaLike): boolean => {
  const definition = schema as GraphSchemaLike & {
    fields?: GraphSchemaFields;
    item?: GraphSchemaLike;
    options?: readonly GraphSchemaLike[];
    value?: GraphSchemaLike;
  };
  if (
    definition.kind === 'field' &&
    (definition as ReferenceFieldDefinition).referenceRequirement === 'existing'
  ) {
    return true;
  }
  if (definition.fields) {
    return Object.values(definition.fields).some(hasExistingReference);
  }
  if (definition.item && hasExistingReference(definition.item)) {
    return true;
  }
  if (definition.value && hasExistingReference(definition.value)) {
    return true;
  }
  return definition.options?.some(hasExistingReference) ?? false;
};

export const hasExistingOperationRefs = (schema: GraphSchemaLike): boolean =>
  hasExistingReference(schema);

export const assertSupportedExistingOperationRefs = (schema: GraphSchemaLike): void => {
  const definition = schema as GraphSchemaLike & { fields?: GraphSchemaFields };
  if ((definition.kind !== 'schema.object' && definition.kind !== 'value') || !definition.fields) {
    if (hasExistingReference(schema)) {
      throw new Error(
        'graphSchema.existingRef(...) is supported only as a direct field of an Operation object or Value input.',
      );
    }
    return;
  }

  for (const [path, fieldSchema] of Object.entries(definition.fields)) {
    const reference = unwrapTopLevelRef(fieldSchema);
    if (reference?.referenceRequirement === 'existing') continue;
    if (hasExistingReference(fieldSchema)) {
      throw new Error(
        `Operation input field "${path}" nests graphSchema.existingRef(...); only direct top-level fields are supported.`,
      );
    }
  }
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

export const materializeExistingOperationRefs = <TInput extends object>(
  schema: GraphSchemaLike,
  input: TInput,
  defaultResolver: DefaultOperationRefResolver,
  resolutionScope?: EntityRefInputResolutionScope,
) =>
  Effect.gen(function* () {
    const hydrated = hydrateSchemaNativeOperationRefs(
      schema,
      input,
      defaultResolver,
      resolutionScope,
    );
    const definition = schema as GraphSchemaLike & { fields?: GraphSchemaFields };
    if (
      (definition.kind !== 'schema.object' && definition.kind !== 'value') ||
      !definition.fields
    ) {
      return hydrated;
    }

    let materialized: Record<string, unknown> | undefined;
    for (const [path, fieldSchema] of Object.entries(definition.fields)) {
      const reference = unwrapTopLevelRef(fieldSchema);
      if (reference?.referenceRequirement !== 'existing') continue;

      const portableRef = (input as Record<string, unknown>)[path];
      if (portableRef == null) continue;

      const hydratedRef = (hydrated as Record<string, unknown>)[path] as {
        resolve?: () => unknown;
      };
      if (!isEntityRef(portableRef) || typeof hydratedRef?.resolve !== 'function') continue;

      const participant = yield* toEffect(() => hydratedRef.resolve?.());
      if (participant == null) {
        return yield* failOperation(
          'entity_not_found',
          `Referenced ${reference.target.name} was not found.`,
          { entityName: reference.target.name, inputPath: path },
        );
      }
      if (!isPlainObject(participant)) {
        return yield* Effect.die(
          new Error(
            `Existing Ref resolver for ${reference.target.name} must return an Entity record or null.`,
          ),
        );
      }

      const projectedParticipant = { ...participant };
      Object.defineProperty(projectedParticipant, 'ref', {
        configurable: false,
        enumerable: false,
        value: portableRef,
        writable: false,
      });
      materialized ??= { ...(hydrated as Record<string, unknown>) };
      materialized[path] = projectedParticipant;
    }

    return (materialized ?? hydrated) as TInput;
  });
