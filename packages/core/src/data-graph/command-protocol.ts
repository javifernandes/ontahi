import { cloneJson, isJsonValue } from '../value/json.js';
import { hasOwn, isRecord } from '../value/object.js';

import {
  graphSchema,
  isDerivedFieldDefinition,
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
} from './definitions.js';
import {
  hasEntityMutationCondition,
  type EntityMutationCommand,
} from './entity-mutation-command.js';
import { validateGraphReadSelection } from './read-protocol.js';
import { isEntityRef, type AnyEntityRef } from './ref/index.js';
import type {
  ManyToManyRelationshipCommand,
  OrderedRelationshipCommand,
  OrderedRelationshipPlacement,
  OrderedRelationshipPosition,
  RelationshipCommand,
  RelationshipEndpointSelection,
} from './relationship-command.js';
import { safeParseGraphSchema } from './schema.js';

type AnyGraphCommand =
  | EntityMutationCommand
  | RelationshipCommand
  | ManyToManyRelationshipCommand
  | OrderedRelationshipCommand;
type GraphCommandV1 = Exclude<AnyGraphCommand, OrderedRelationshipCommand>;

export type GraphCommandRequestV1 = {
  readonly version: 1;
  readonly kind: 'graph-command';
  readonly command: GraphCommandV1;
};

export type GraphCommandRequestV2 = {
  readonly version: 2;
  readonly kind: 'graph-command';
  readonly command: AnyGraphCommand;
};

export type GraphCommandRequest = GraphCommandRequestV1 | GraphCommandRequestV2;

export type GraphCommandProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'unknown_entity'
  | 'invalid_relation'
  | 'invalid_reference'
  | 'invalid_payload'
  | 'invalid_condition'
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
  | { readonly success: true; readonly request: GraphCommandRequest }
  | { readonly success: false; readonly error: GraphCommandProtocolError };

export type GraphCommandRequestResolveResult =
  | {
      readonly success: true;
      readonly request: GraphCommandRequest;
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
  'invalid_condition',
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

export const toGraphCommandRequest = (command: AnyGraphCommand): GraphCommandRequest => {
  const request: GraphCommandRequest =
    command.kind === 'ordered-relationship-command' ||
    (command.kind === 'entity-mutation-command' && hasEntityMutationCondition(command))
      ? { version: 2, kind: 'graph-command', command }
      : { version: 1, kind: 'graph-command', command };
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
  if (value.version !== 1 && value.version !== 2) {
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
      (command.if !== undefined &&
        (value.version !== 2 ||
          command.action === 'create' ||
          !isRecord(command.if) ||
          Object.keys(command.if).length === 0)) ||
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
              ...(command.if === undefined ? {} : { if: command.if as Record<string, unknown> }),
            }
          : {
              kind: 'entity-mutation-command',
              action: 'delete',
              entityName: command.entityName,
              target: command.target as AnyEntityRef,
              ...(command.if === undefined ? {} : { if: command.if as Record<string, unknown> }),
            };
    return {
      success: true,
      request: cloneJson({
        version: value.version,
        kind: 'graph-command',
        command: canonicalCommand,
      }) as GraphCommandRequest,
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
        version: value.version,
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
      }) as GraphCommandRequest,
    };
  }

  if (command.kind === 'ordered-relationship-command') {
    const relation = command.relation;
    const position = parseOrderedPlacement(command.position);
    const preconditionPosition = isRecord(command.precondition)
      ? parseOrderedPosition(command.precondition.position)
      : undefined;
    if (
      value.version !== 2 ||
      command.action !== 'move' ||
      !isRecord(relation) ||
      relation.cardinality !== 'ordered-many' ||
      typeof relation.sourceEntityName !== 'string' ||
      typeof relation.relationName !== 'string' ||
      typeof relation.targetEntityName !== 'string' ||
      !isEntityRef(command.source) ||
      !isEntityRef(command.member) ||
      !position ||
      (command.precondition !== undefined &&
        (!isRecord(command.precondition) ||
          !preconditionPosition ||
          (command.precondition.onMismatch !== undefined &&
            command.precondition.onMismatch !== 'fail' &&
            command.precondition.onMismatch !== 'skip'))) ||
      !isJsonValue(value)
    ) {
      return {
        success: false,
        error: graphCommandProtocolError(
          'invalid_request',
          'Ordered Relationship Command request is invalid.',
        ),
      };
    }

    const canonicalCommand: OrderedRelationshipCommand = {
      kind: 'ordered-relationship-command',
      action: 'move',
      relation: {
        sourceEntityName: relation.sourceEntityName as string,
        relationName: relation.relationName as string,
        targetEntityName: relation.targetEntityName as string,
        cardinality: 'ordered-many',
      },
      source: command.source,
      member: command.member,
      position,
      ...(preconditionPosition
        ? {
            precondition: {
              position: preconditionPosition,
              ...(command.precondition!.onMismatch === undefined
                ? {}
                : { onMismatch: command.precondition!.onMismatch as 'fail' | 'skip' }),
            },
          }
        : {}),
    };
    return {
      success: true,
      request: cloneJson({ version: 2, kind: 'graph-command', command: canonicalCommand }),
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
      version: value.version,
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
    }) as GraphCommandRequest,
  };
};

const parseOrderedPosition = (value: unknown): OrderedRelationshipPosition | undefined => {
  if (
    !isRecord(value) ||
    !hasOwn(value, 'before') ||
    !hasOwn(value, 'after') ||
    (value.before !== null && !isEntityRef(value.before)) ||
    (value.after !== null && !isEntityRef(value.after))
  ) {
    return undefined;
  }
  return { before: value.before, after: value.after };
};

const parseOrderedPlacement = (value: unknown): OrderedRelationshipPlacement | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.at === 'start' || value.at === 'end') {
    return Object.keys(value).length === 1 ? { at: value.at } : undefined;
  }
  if (isEntityRef(value.before)) {
    return Object.keys(value).length === 1 ? { before: value.before } : undefined;
  }
  if (isEntityRef(value.after)) {
    return Object.keys(value).length === 1 ? { after: value.after } : undefined;
  }
  return undefined;
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
  request: GraphCommandRequest,
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
  request: GraphCommandRequest,
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

const resolveOrderedRelationshipCommand = (
  request: GraphCommandRequest,
  command: OrderedRelationshipCommand,
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
  const targetField = relation?.targetField ? targetEntity.fields[relation.targetField] : undefined;
  if (
    !relation ||
    relation.relationKind !== 'hasMany' ||
    !relation.ordered ||
    relation.target.name !== targetEntity.name ||
    !relation.targetField ||
    !targetField ||
    !isReferenceFieldDefinition(targetField) ||
    targetField.target.name !== sourceEntity.name ||
    targetField.nullable ||
    targetField.optional
  ) {
    return resolutionFailure(
      'invalid_relation',
      `Unknown ordered Relation ${sourceEntity.name}.${command.relation.relationName} -> ${targetEntity.name}.`,
    );
  }

  const refs: Array<{ ref: AnyEntityRef; role: string; entity: AnyEntityDefinition }> = [
    { ref: command.source, role: 'source', entity: sourceEntity },
    { ref: command.member, role: 'member', entity: targetEntity },
  ];
  if ('before' in command.position) {
    refs.push({ ref: command.position.before, role: 'anchor', entity: targetEntity });
  } else if ('after' in command.position) {
    refs.push({ ref: command.position.after, role: 'anchor', entity: targetEntity });
  }
  for (const [role, ref] of [
    ['previous neighbor', command.precondition?.position.after],
    ['next neighbor', command.precondition?.position.before],
  ] as const) {
    if (ref) refs.push({ ref, role, entity: targetEntity });
  }
  for (const candidate of refs) {
    const error = validateRef(candidate.ref, candidate.entity, candidate.role);
    if (error) return { success: false, error };
  }
  return { success: true, request, command };
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

const invalidEntityMutationCondition = (message: string): GraphCommandRequestResolveResult =>
  resolutionFailure('invalid_condition', message);

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

const resolveEntityMutationCondition = (
  command: Exclude<EntityMutationCommand, { action: 'create' }>,
  entity: AnyEntityDefinition,
):
  | { readonly valid: true; readonly values?: Record<string, unknown> }
  | GraphCommandRequestResolveResult => {
  if (!hasEntityMutationCondition(command)) return { valid: true };
  const conditionFields = Object.keys(command.if);
  if (conditionFields.length === 0) {
    return invalidEntityMutationCondition('Entity Mutation Command condition cannot be empty.');
  }
  const storedFields = Object.fromEntries(
    Object.entries(entity.fields).filter(([, field]) => !isDerivedFieldDefinition(field)),
  );
  const invalidField = conditionFields.find(fieldName => !(fieldName in storedFields));
  if (invalidField) {
    return invalidEntityMutationCondition(
      `Entity Mutation Command cannot test ${entity.name}.${invalidField}.`,
    );
  }
  const schema = graphSchema.object(
    Object.fromEntries(conditionFields.map(fieldName => [fieldName, storedFields[fieldName]!])),
    { unknownKeys: 'strict' },
  );
  const parsed = safeParseGraphSchema(schema, command.if);
  return parsed.success
    ? { valid: true, values: parsed.data as Record<string, unknown> }
    : invalidEntityMutationCondition(
        parsed.issues[0]?.message ?? 'Entity Mutation Command condition is invalid.',
      );
};

const resolveEntityMutationCommand = (
  request: GraphCommandRequest,
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
  if (command.action === 'delete') {
    const condition = resolveEntityMutationCondition(command, entity);
    if (!('valid' in condition)) return condition;
    return {
      success: true,
      request,
      command: condition.values ? { ...command, if: condition.values } : command,
    };
  }

  const values = resolveEntityMutationValues(command, entity);
  if (!('valid' in values)) return values;
  if (command.action === 'create') {
    return { success: true, request, command: { ...command, values: values.values } };
  }
  const condition = resolveEntityMutationCondition(command, entity);
  if (!('valid' in condition)) return condition;
  return {
    success: true,
    request,
    command: {
      ...command,
      values: values.values,
      ...(condition.values ? { if: condition.values } : {}),
    },
  };
};

export const resolveGraphCommandRequest = (
  request: GraphCommandRequest,
  options: { readonly entities: readonly AnyEntityDefinition[] },
): GraphCommandRequestResolveResult => {
  const { command } = request;
  if (command.kind === 'entity-mutation-command') {
    return resolveEntityMutationCommand(request, command, options.entities);
  }
  if (command.kind === 'ordered-relationship-command') {
    return resolveOrderedRelationshipCommand(request, command, options.entities);
  }
  return command.kind === 'many-to-many-relationship-command'
    ? resolveManyToManyCommand(request, command, options.entities)
    : resolveDirectRelationshipCommand(request, command, options.entities);
};
