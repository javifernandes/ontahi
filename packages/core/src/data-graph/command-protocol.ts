import { cloneJson, isJsonValue } from '../value/json.js';
import { isRecord } from '../value/object.js';

import {
  graphSchema,
  isDerivedFieldDefinition,
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
} from './definitions.js';
import type { EntityMutationCommand } from './entity-mutation-command.js';
import { validateGraphReadSelection } from './read-protocol.js';
import { isEntityRef, type AnyEntityRef } from './ref/index.js';
import type {
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipEndpointSelection,
} from './relationship-command.js';
import { safeParseGraphSchema } from './schema.js';

type AnyGraphCommand = EntityMutationCommand | RelationshipCommand | ManyToManyRelationshipCommand;

export type GraphCommandRequestV1 = {
  readonly version: 1;
  readonly kind: 'graph-command';
  readonly command: AnyGraphCommand;
};

export type GraphCommandProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'unknown_entity'
  | 'invalid_relation'
  | 'invalid_reference'
  | 'invalid_payload'
  | 'invalid_selection'
  | 'access_denied'
  | 'execution_unavailable';

export type GraphCommandProtocolError = {
  readonly kind: 'protocol-error';
  readonly error: {
    readonly code: GraphCommandProtocolErrorCode;
    readonly message: string;
  };
};

export type GraphCommandRequestParseResult =
  | { readonly success: true; readonly request: GraphCommandRequestV1 }
  | { readonly success: false; readonly error: GraphCommandProtocolError };

export type GraphCommandRequestResolveResult =
  | {
      readonly success: true;
      readonly request: GraphCommandRequestV1;
      readonly command: AnyGraphCommand;
    }
  | { readonly success: false; readonly error: GraphCommandProtocolError };

const graphCommandProtocolErrorCodes = new Set<GraphCommandProtocolErrorCode>([
  'invalid_request',
  'unsupported_version',
  'unknown_entity',
  'invalid_relation',
  'invalid_reference',
  'invalid_payload',
  'invalid_selection',
  'access_denied',
  'execution_unavailable',
]);

export const isGraphCommandProtocolError = (value: unknown): value is GraphCommandProtocolError =>
  isRecord(value) &&
  value.kind === 'protocol-error' &&
  isRecord(value.error) &&
  typeof value.error.code === 'string' &&
  graphCommandProtocolErrorCodes.has(value.error.code as GraphCommandProtocolErrorCode) &&
  typeof value.error.message === 'string';

export const graphCommandProtocolError = (
  code: GraphCommandProtocolErrorCode,
  message: string,
): GraphCommandProtocolError => ({ kind: 'protocol-error', error: { code, message } });

export const toGraphCommandRequest = (command: AnyGraphCommand): GraphCommandRequestV1 => {
  const request = { version: 1, kind: 'graph-command', command } satisfies GraphCommandRequestV1;
  if (!isJsonValue(request)) throw new Error('Data graph Command request must be JSON-safe.');
  return cloneJson(request);
};

export const parseGraphCommandRequest = (value: unknown): GraphCommandRequestParseResult => {
  if (!isRecord(value)) {
    return {
      success: false,
      error: graphCommandProtocolError(
        'invalid_request',
        'Data graph Command request must be an object.',
      ),
    };
  }
  if (value.version !== 1) {
    return {
      success: false,
      error: graphCommandProtocolError(
        'unsupported_version',
        `Unsupported data graph Command protocol version: ${String(value.version)}.`,
      ),
    };
  }
  if (value.kind !== 'graph-command' || !isRecord(value.command)) {
    return {
      success: false,
      error: graphCommandProtocolError(
        'invalid_request',
        'Data graph Command request kind must be "graph-command" and include a command object.',
      ),
    };
  }

  const command = value.command;
  if (command.kind === 'entity-mutation-command') {
    if (
      typeof command.entityName !== 'string' ||
      (command.action !== 'create' && command.action !== 'update' && command.action !== 'delete') ||
      (command.action !== 'delete' && !isRecord(command.values)) ||
      (command.action !== 'create' && !isEntityRef(command.target)) ||
      !isJsonValue(value)
    ) {
      return {
        success: false,
        error: graphCommandProtocolError(
          'invalid_request',
          'Entity Mutation Command request is invalid.',
        ),
      };
    }

    const canonicalCommand: EntityMutationCommand =
      command.action === 'create'
        ? {
            kind: 'entity-mutation-command',
            action: 'create',
            entityName: command.entityName,
            values: command.values as Record<string, unknown>,
          }
        : command.action === 'update'
          ? {
              kind: 'entity-mutation-command',
              action: 'update',
              entityName: command.entityName,
              target: command.target as AnyEntityRef,
              values: command.values as Record<string, unknown>,
            }
          : {
              kind: 'entity-mutation-command',
              action: 'delete',
              entityName: command.entityName,
              target: command.target as AnyEntityRef,
            };
    return {
      success: true,
      request: cloneJson({
        version: 1,
        kind: 'graph-command',
        command: canonicalCommand,
      }) as GraphCommandRequestV1,
    };
  }

  if (command.kind === 'relationship-command') {
    if (
      (command.action !== 'link' && command.action !== 'unlink') ||
      !isRecord(command.relation) ||
      typeof command.relation.sourceEntityName !== 'string' ||
      typeof command.relation.fieldName !== 'string' ||
      typeof command.relation.targetEntityName !== 'string' ||
      !isEntityRef(command.source) ||
      (command.target !== undefined && !isEntityRef(command.target)) ||
      (command.precondition !== undefined && command.action !== 'link') ||
      (command.precondition !== undefined &&
        (!isRecord(command.precondition) ||
          !isEntityRef(command.precondition.currentTarget) ||
          (command.precondition.onMismatch !== undefined &&
            command.precondition.onMismatch !== 'fail' &&
            command.precondition.onMismatch !== 'skip'))) ||
      (command.action === 'link' && command.target === undefined) ||
      !isJsonValue(value)
    ) {
      return {
        success: false,
        error: graphCommandProtocolError(
          'invalid_request',
          'Relationship Command request is invalid.',
        ),
      };
    }

    return {
      success: true,
      request: cloneJson({
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'relationship-command',
          action: command.action,
          relation: {
            sourceEntityName: command.relation.sourceEntityName,
            fieldName: command.relation.fieldName,
            targetEntityName: command.relation.targetEntityName,
          },
          source: command.source,
          ...(command.target === undefined ? {} : { target: command.target }),
          ...(command.precondition === undefined
            ? {}
            : {
                precondition: {
                  currentTarget: command.precondition.currentTarget,
                  ...(command.precondition.onMismatch === undefined
                    ? {}
                    : { onMismatch: command.precondition.onMismatch }),
                },
              }),
        },
      }) as GraphCommandRequestV1,
    };
  }

  if (
    command.kind !== 'many-to-many-relationship-command' ||
    (command.action !== 'link' && command.action !== 'unlink') ||
    !isRecord(command.relation) ||
    command.relation.cardinality !== 'many-to-many' ||
    typeof command.relation.sourceEntityName !== 'string' ||
    typeof command.relation.relationName !== 'string' ||
    typeof command.relation.targetEntityName !== 'string' ||
    !isRecord(command.sources) ||
    typeof command.sources.entityName !== 'string' ||
    !isRecord(command.sources.selection) ||
    !isRecord(command.targets) ||
    typeof command.targets.entityName !== 'string' ||
    !isRecord(command.targets.selection) ||
    !isJsonValue(value)
  ) {
    return {
      success: false,
      error: graphCommandProtocolError(
        'invalid_request',
        'Many-to-many Relationship Command request is invalid.',
      ),
    };
  }

  return {
    success: true,
    request: cloneJson({
      version: 1,
      kind: 'graph-command',
      command: {
        kind: 'many-to-many-relationship-command',
        action: command.action,
        relation: {
          sourceEntityName: command.relation.sourceEntityName,
          relationName: command.relation.relationName,
          targetEntityName: command.relation.targetEntityName,
          cardinality: 'many-to-many',
        },
        sources: {
          entityName: command.sources.entityName,
          selection: command.sources.selection,
        },
        targets: {
          entityName: command.targets.entityName,
          selection: command.targets.selection,
        },
      },
    }) as GraphCommandRequestV1,
  };
};

const findEntity = (entities: readonly AnyEntityDefinition[], name: string) =>
  entities.find(entity => entity.name === name);

const hasDeclaredLocator = (entity: AnyEntityDefinition, ref: AnyEntityRef) => {
  const fields = Object.keys(ref.locator).sort((left, right) => left.localeCompare(right));
  return Object.values(entity.refLocators).some(locator => {
    const locatorFields =
      'fields' in locator && locator.fields
        ? [...locator.fields].sort((left, right) => left.localeCompare(right))
        : [];
    return (
      locatorFields.length === fields.length &&
      locatorFields.every((fieldName, index) => fieldName === fields[index])
    );
  });
};

const resolutionFailure = (
  code: GraphCommandProtocolErrorCode,
  message: string,
): GraphCommandRequestResolveResult => ({
  success: false,
  error: graphCommandProtocolError(code, message),
});

const resolveEntities = (
  entities: readonly AnyEntityDefinition[],
  sourceName: string,
  targetName: string,
):
  | { sourceEntity: AnyEntityDefinition; targetEntity: AnyEntityDefinition }
  | GraphCommandRequestResolveResult => {
  const sourceEntity = findEntity(entities, sourceName);
  const targetEntity = findEntity(entities, targetName);
  if (!sourceEntity || !targetEntity) {
    return resolutionFailure(
      'unknown_entity',
      `Unknown data graph Entity: ${sourceEntity ? targetName : sourceName}.`,
    );
  }
  return { sourceEntity, targetEntity };
};

const validateEndpointSelection = (
  endpoint: RelationshipEndpointSelection,
  entity: AnyEntityDefinition,
  role: 'source' | 'target',
): GraphCommandProtocolError | undefined => {
  if (endpoint.entityName !== entity.name) {
    return graphCommandProtocolError(
      'invalid_selection',
      `Relationship ${role} Selection must target ${entity.name}.`,
    );
  }
  const selectionError = validateGraphReadSelection(endpoint.selection, entity);
  if (selectionError) {
    return graphCommandProtocolError('invalid_selection', selectionError.error.message);
  }
  if (endpoint.selection.kind !== 'references') return undefined;
  const invalidRef = endpoint.selection.refs.find(ref => !hasDeclaredLocator(entity, ref));
  return invalidRef
    ? graphCommandProtocolError(
        'invalid_reference',
        `Relationship ${role} Ref does not use a declared ${entity.name} locator.`,
      )
    : undefined;
};

const resolveManyToManyCommand = (
  request: GraphCommandRequestV1,
  command: ManyToManyRelationshipCommand,
  entities: readonly AnyEntityDefinition[],
): GraphCommandRequestResolveResult => {
  const resolvedEntities = resolveEntities(
    entities,
    command.relation.sourceEntityName,
    command.relation.targetEntityName,
  );
  if ('success' in resolvedEntities) return resolvedEntities;
  const { sourceEntity, targetEntity } = resolvedEntities;
  const relation = sourceEntity.relations[command.relation.relationName];
  if (
    !relation ||
    relation.relationKind !== 'manyToMany' ||
    relation.target.name !== targetEntity.name
  ) {
    return resolutionFailure(
      'invalid_relation',
      `Unknown many-to-many Relation ${sourceEntity.name}.${command.relation.relationName} -> ${targetEntity.name}.`,
    );
  }
  const sourceError = validateEndpointSelection(command.sources, sourceEntity, 'source');
  if (sourceError) return { success: false, error: sourceError };
  const targetError = validateEndpointSelection(command.targets, targetEntity, 'target');
  if (targetError) return { success: false, error: targetError };
  return { success: true, request, command };
};

const resolveDirectRelationshipCommand = (
  request: GraphCommandRequestV1,
  command: RelationshipCommand,
  entities: readonly AnyEntityDefinition[],
): GraphCommandRequestResolveResult => {
  const resolvedEntities = resolveEntities(
    entities,
    command.relation.sourceEntityName,
    command.relation.targetEntityName,
  );
  if ('success' in resolvedEntities) return resolvedEntities;
  const { sourceEntity, targetEntity } = resolvedEntities;
  const field = sourceEntity.fields[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field) || field.target.name !== targetEntity.name) {
    return resolutionFailure(
      'invalid_relation',
      `Unknown canonical Relation ${sourceEntity.name}.${command.relation.fieldName} -> ${targetEntity.name}.`,
    );
  }
  if (command.action === 'unlink' && !field.nullable && !field.optional) {
    return resolutionFailure(
      'invalid_relation',
      `Required Relation ${sourceEntity.name}.${command.relation.fieldName} cannot be cleared.`,
    );
  }
  const sourceError = validateRef(command.source, sourceEntity, 'source');
  if (sourceError) return { success: false, error: sourceError };
  const targetError = command.target
    ? validateRef(command.target, targetEntity, 'target')
    : undefined;
  const preconditionError = command.precondition
    ? validateRef(command.precondition.currentTarget, targetEntity, 'current target')
    : undefined;
  return targetError || preconditionError
    ? { success: false, error: targetError ?? preconditionError! }
    : { success: true, request, command };
};

const validateRef = (
  ref: AnyEntityRef,
  entity: AnyEntityDefinition,
  role: string,
): GraphCommandProtocolError | undefined => {
  if (ref.entityName !== entity.name) {
    return graphCommandProtocolError(
      'invalid_reference',
      `Data graph Command ${role} Ref must target ${entity.name}.`,
    );
  }
  if (!hasDeclaredLocator(entity, ref)) {
    return graphCommandProtocolError(
      'invalid_reference',
      `Data graph Command ${role} Ref does not use a declared ${entity.name} locator.`,
    );
  }
  const selectionError = validateGraphReadSelection({ kind: 'references', refs: [ref] }, entity);
  if (selectionError) {
    return graphCommandProtocolError(
      'invalid_reference',
      `Data graph Command ${role} Ref is invalid for ${entity.name}.`,
    );
  }
  const invalidLocatorValue = Object.entries(ref.locator).find(([fieldName, value]) => {
    const field = entity.fields[fieldName];
    return !field || !safeParseGraphSchema(field, value).success;
  });
  if (invalidLocatorValue) {
    return graphCommandProtocolError(
      'invalid_reference',
      `Data graph Command ${role} Ref has an invalid ${entity.name}.${invalidLocatorValue[0]} value.`,
    );
  }
  return undefined;
};

const invalidEntityMutationPayload = (message: string): GraphCommandRequestResolveResult =>
  resolutionFailure('invalid_payload', message);

const resolveEntityMutationValues = (
  command: Extract<EntityMutationCommand, { action: 'create' | 'update' }>,
  entity: AnyEntityDefinition,
):
  | { readonly valid: true; readonly values: Record<string, unknown> }
  | GraphCommandRequestResolveResult => {
  const storedFields = Object.fromEntries(
    Object.entries(entity.fields).filter(([, field]) => !isDerivedFieldDefinition(field)),
  );
  const payloadFields = Object.keys(command.values);
  const invalidField = payloadFields.find(fieldName => !(fieldName in storedFields));
  if (invalidField) {
    return invalidEntityMutationPayload(
      `Entity Mutation Command cannot assign ${entity.name}.${invalidField}.`,
    );
  }
  if (command.action === 'update' && payloadFields.length === 0) {
    return invalidEntityMutationPayload('Entity Mutation Command update payload cannot be empty.');
  }

  const schema =
    command.action === 'create'
      ? graphSchema.object(storedFields, { unknownKeys: 'strict' })
      : graphSchema.object(
          Object.fromEntries(payloadFields.map(fieldName => [fieldName, storedFields[fieldName]!])),
          { unknownKeys: 'strict' },
        );
  const parsed = safeParseGraphSchema(schema, command.values);
  return parsed.success
    ? { valid: true, values: parsed.data as Record<string, unknown> }
    : invalidEntityMutationPayload(
        parsed.issues[0]?.message ?? 'Entity Mutation Command payload is invalid.',
      );
};

const resolveEntityMutationCommand = (
  request: GraphCommandRequestV1,
  command: EntityMutationCommand,
  entities: readonly AnyEntityDefinition[],
): GraphCommandRequestResolveResult => {
  const entity = findEntity(entities, command.entityName);
  if (!entity) {
    return resolutionFailure('unknown_entity', `Unknown data graph Entity: ${command.entityName}.`);
  }
  if ('target' in command) {
    const targetError = validateRef(command.target, entity, 'target');
    if (targetError) return { success: false, error: targetError };
  }
  if (command.action === 'delete') return { success: true, request, command };

  const values = resolveEntityMutationValues(command, entity);
  if (!('valid' in values)) return values;
  return { success: true, request, command: { ...command, values: values.values } };
};

export const resolveGraphCommandRequest = (
  request: GraphCommandRequestV1,
  options: { readonly entities: readonly AnyEntityDefinition[] },
): GraphCommandRequestResolveResult => {
  const { command } = request;
  if (command.kind === 'entity-mutation-command') {
    return resolveEntityMutationCommand(request, command, options.entities);
  }
  return command.kind === 'many-to-many-relationship-command'
    ? resolveManyToManyCommand(request, command, options.entities)
    : resolveDirectRelationshipCommand(request, command, options.entities);
};
