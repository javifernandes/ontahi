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
  getEntityIdentityLocator,
  getGraphSchemaReferenceResolver,
  isEntityRef,
  type EntityRefInputResolutionScope,
  type EntityRefInputResolver,
  type EntityRef,
} from '../../data-graph/ref/index.js';
import { variantReferenceInputError } from '../../data-graph/ref/variant-input.js';
import { safeParseUnknownGraphSchema } from '../../data-graph/schema.js';
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

const matchesVariantParticipant = (
  reference: ReferenceFieldDefinition,
  participant: unknown,
  portableRef: EntityRef,
) => {
  const variant = reference.variant;
  if (!variant) return true;
  if (!isPlainObject(participant)) return false;
  const fields = getEntityIdentityLocator(reference.target)?.locator.fields;
  return (
    participant[variant.discriminator.fieldName] === variant.discriminator.value &&
    !!fields?.length &&
    fields.every(field => participant[field] === portableRef.locator[field])
  );
};

const resolveExistingParticipant = (
  reference: ReferenceFieldDefinition,
  portableRef: EntityRef,
  resolve: () => unknown,
  path: string,
) =>
  Effect.gen(function* () {
    const participant = yield* toEffect(resolve);
    const variant = reference.variant;
    if (participant == null || !matchesVariantParticipant(reference, participant, portableRef)) {
      return yield* failOperation(
        'entity_not_found',
        `Referenced ${variant?.name ?? reference.target.name} was not found.`,
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
    if (variant && !safeParseUnknownGraphSchema(reference.target, participant).success) {
      return yield* Effect.die(
        new Error(
          `Existing Ref resolver for ${variant.name} returned an invalid base Entity record.`,
        ),
      );
    }
    const projected = { ...participant };
    Object.defineProperty(projected, 'ref', {
      configurable: false,
      enumerable: false,
      value: portableRef,
      writable: false,
    });
    return projected;
  });

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

      const inputError = variantReferenceInputError(reference, portableRef);
      if (inputError)
        return yield* failOperation('invalid_input', inputError, {
          entityName: reference.target.name,
          inputPath: path,
        });

      const hydratedRef = (hydrated as Record<string, unknown>)[path] as {
        resolve?: () => unknown;
      };
      if (!isEntityRef(portableRef) || typeof hydratedRef?.resolve !== 'function') continue;

      const participant = yield* resolveExistingParticipant(
        reference,
        portableRef,
        () => hydratedRef.resolve?.(),
        path,
      );
      materialized ??= { ...(hydrated as Record<string, unknown>) };
      materialized[path] = participant;
    }

    return (materialized ?? hydrated) as TInput;
  });
