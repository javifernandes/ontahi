import { cloneJson, isJsonValue } from '../value/json.js';
import { isRecord } from '../value/object.js';

import { isReferenceFieldDefinition, type AnyEntityDefinition } from './definitions.js';
import { isEntityRef, type AnyEntityRef } from './ref.js';
import type { RelationshipCommand } from './relationship-command.js';

export type GraphCommandRequestV1 = {
  readonly version: 1;
  readonly kind: 'graph-command';
  readonly command: RelationshipCommand;
};

export type GraphCommandProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'unknown_entity'
  | 'invalid_relation'
  | 'invalid_reference';

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
      readonly command: RelationshipCommand;
    }
  | { readonly success: false; readonly error: GraphCommandProtocolError };

const protocolError = (
  code: GraphCommandProtocolErrorCode,
  message: string,
): GraphCommandProtocolError => ({ kind: 'protocol-error', error: { code, message } });

export const toGraphCommandRequest = (command: RelationshipCommand): GraphCommandRequestV1 => {
  const request = { version: 1, kind: 'graph-command', command } satisfies GraphCommandRequestV1;
  if (!isJsonValue(request)) throw new Error('Data graph Command request must be JSON-safe.');
  return cloneJson(request);
};

export const parseGraphCommandRequest = (value: unknown): GraphCommandRequestParseResult => {
  if (!isRecord(value)) {
    return {
      success: false,
      error: protocolError('invalid_request', 'Data graph Command request must be an object.'),
    };
  }
  if (value.version !== 1) {
    return {
      success: false,
      error: protocolError(
        'unsupported_version',
        `Unsupported data graph Command protocol version: ${String(value.version)}.`,
      ),
    };
  }
  if (value.kind !== 'graph-command' || !isRecord(value.command)) {
    return {
      success: false,
      error: protocolError(
        'invalid_request',
        'Data graph Command request kind must be "graph-command" and include a command object.',
      ),
    };
  }

  const command = value.command;
  if (
    command.kind !== 'relationship-command' ||
    (command.action !== 'link' && command.action !== 'unlink') ||
    !isRecord(command.relation) ||
    typeof command.relation.sourceEntityName !== 'string' ||
    typeof command.relation.fieldName !== 'string' ||
    typeof command.relation.targetEntityName !== 'string' ||
    !isEntityRef(command.source) ||
    (command.target !== undefined && !isEntityRef(command.target)) ||
    (command.action === 'link' && command.target === undefined) ||
    !isJsonValue(value)
  ) {
    return {
      success: false,
      error: protocolError('invalid_request', 'Relationship Command request is invalid.'),
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
      },
    }) as GraphCommandRequestV1,
  };
};

const findEntity = (entities: readonly AnyEntityDefinition[], name: string) =>
  entities.find(entity => entity.name === name);

const hasDeclaredLocator = (entity: AnyEntityDefinition, ref: AnyEntityRef) => {
  const fields = Object.keys(ref.locator).sort();
  return Object.values(entity.refLocators).some(locator => {
    const locatorFields = 'fields' in locator && locator.fields ? [...locator.fields].sort() : [];
    return (
      locatorFields.length === fields.length &&
      locatorFields.every((fieldName, index) => fieldName === fields[index])
    );
  });
};

const validateRef = (
  ref: AnyEntityRef,
  entity: AnyEntityDefinition,
  role: string,
): GraphCommandProtocolError | undefined => {
  if (ref.entityName !== entity.name) {
    return protocolError(
      'invalid_reference',
      `Relationship Command ${role} Ref must target ${entity.name}.`,
    );
  }
  if (!hasDeclaredLocator(entity, ref)) {
    return protocolError(
      'invalid_reference',
      `Relationship Command ${role} Ref does not use a declared ${entity.name} locator.`,
    );
  }
  return undefined;
};

export const resolveGraphCommandRequest = (
  request: GraphCommandRequestV1,
  options: { readonly entities: readonly AnyEntityDefinition[] },
): GraphCommandRequestResolveResult => {
  const { command } = request;
  const sourceEntity = findEntity(options.entities, command.relation.sourceEntityName);
  const targetEntity = findEntity(options.entities, command.relation.targetEntityName);
  if (!sourceEntity || !targetEntity) {
    const name = !sourceEntity
      ? command.relation.sourceEntityName
      : command.relation.targetEntityName;
    return {
      success: false,
      error: protocolError('unknown_entity', `Unknown data graph Entity: ${name}.`),
    };
  }

  const field = sourceEntity.fields[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field) || field.target.name !== targetEntity.name) {
    return {
      success: false,
      error: protocolError(
        'invalid_relation',
        `Unknown canonical Relation ${sourceEntity.name}.${command.relation.fieldName} -> ${targetEntity.name}.`,
      ),
    };
  }
  if (command.action === 'unlink' && !field.nullable && !field.optional) {
    return {
      success: false,
      error: protocolError(
        'invalid_relation',
        `Required Relation ${sourceEntity.name}.${command.relation.fieldName} cannot be cleared.`,
      ),
    };
  }

  const sourceError = validateRef(command.source, sourceEntity, 'source');
  if (sourceError) return { success: false, error: sourceError };
  if (command.target) {
    const targetError = validateRef(command.target, targetEntity, 'target');
    if (targetError) return { success: false, error: targetError };
  }

  return { success: true, request, command };
};
