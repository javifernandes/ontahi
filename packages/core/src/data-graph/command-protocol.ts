import { cloneJson, isJsonValue } from '../value/json.js';
import { isRecord } from '../value/object.js';

import { isReferenceFieldDefinition, type AnyEntityDefinition } from './definitions.js';
import { validateGraphReadSelection } from './read-protocol.js';
import { isEntityRef, type AnyEntityRef } from './ref.js';
import type {
  ManyToManyRelationshipCommand,
  RelationshipCommand,
  RelationshipEndpointSelection,
} from './relationship-command.js';

type AnyRelationshipCommand = RelationshipCommand | ManyToManyRelationshipCommand;

export type GraphCommandRequestV1 = {
  readonly version: 1;
  readonly kind: 'graph-command';
  readonly command: AnyRelationshipCommand;
};

export type GraphCommandProtocolErrorCode =
  | 'invalid_request'
  | 'unsupported_version'
  | 'unknown_entity'
  | 'invalid_relation'
  | 'invalid_reference'
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
      readonly command: AnyRelationshipCommand;
    }
  | { readonly success: false; readonly error: GraphCommandProtocolError };

const graphCommandProtocolErrorCodes = new Set<GraphCommandProtocolErrorCode>([
  'invalid_request',
  'unsupported_version',
  'unknown_entity',
  'invalid_relation',
  'invalid_reference',
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

export const toGraphCommandRequest = (command: AnyRelationshipCommand): GraphCommandRequestV1 => {
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
  if (command.kind === 'relationship-command') {
    if (
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
    return graphCommandProtocolError(
      'invalid_reference',
      `Relationship Command ${role} Ref must target ${entity.name}.`,
    );
  }
  if (!hasDeclaredLocator(entity, ref)) {
    return graphCommandProtocolError(
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
  if (command.kind === 'many-to-many-relationship-command') {
    const sourceEntity = findEntity(options.entities, command.relation.sourceEntityName);
    const targetEntity = findEntity(options.entities, command.relation.targetEntityName);
    if (!sourceEntity || !targetEntity) {
      const name = !sourceEntity
        ? command.relation.sourceEntityName
        : command.relation.targetEntityName;
      return {
        success: false,
        error: graphCommandProtocolError('unknown_entity', `Unknown data graph Entity: ${name}.`),
      };
    }
    const relation = sourceEntity.relations[command.relation.relationName];
    if (
      !relation ||
      relation.relationKind !== 'manyToMany' ||
      relation.target.name !== targetEntity.name
    ) {
      return {
        success: false,
        error: graphCommandProtocolError(
          'invalid_relation',
          `Unknown many-to-many Relation ${sourceEntity.name}.${command.relation.relationName} -> ${targetEntity.name}.`,
        ),
      };
    }
    const endpoints: Array<
      [RelationshipEndpointSelection, AnyEntityDefinition, 'source' | 'target']
    > = [
      [command.sources, sourceEntity, 'source'],
      [command.targets, targetEntity, 'target'],
    ];
    for (const [endpoint, entity, role] of endpoints) {
      if (endpoint.entityName !== entity.name) {
        return {
          success: false,
          error: graphCommandProtocolError(
            'invalid_selection',
            `Relationship ${role} Selection must target ${entity.name}.`,
          ),
        };
      }
      const selectionError = validateGraphReadSelection(endpoint.selection, entity);
      if (selectionError) {
        return {
          success: false,
          error: graphCommandProtocolError('invalid_selection', selectionError.error.message),
        };
      }
      if (endpoint.selection.kind === 'references') {
        for (const ref of endpoint.selection.refs) {
          if (!hasDeclaredLocator(entity, ref)) {
            return {
              success: false,
              error: graphCommandProtocolError(
                'invalid_reference',
                `Relationship ${role} Ref does not use a declared ${entity.name} locator.`,
              ),
            };
          }
        }
      }
    }
    return { success: true, request, command };
  }

  const sourceEntity = findEntity(options.entities, command.relation.sourceEntityName);
  const targetEntity = findEntity(options.entities, command.relation.targetEntityName);
  if (!sourceEntity || !targetEntity) {
    const name = !sourceEntity
      ? command.relation.sourceEntityName
      : command.relation.targetEntityName;
    return {
      success: false,
      error: graphCommandProtocolError('unknown_entity', `Unknown data graph Entity: ${name}.`),
    };
  }

  const field = sourceEntity.fields[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field) || field.target.name !== targetEntity.name) {
    return {
      success: false,
      error: graphCommandProtocolError(
        'invalid_relation',
        `Unknown canonical Relation ${sourceEntity.name}.${command.relation.fieldName} -> ${targetEntity.name}.`,
      ),
    };
  }
  if (command.action === 'unlink' && !field.nullable && !field.optional) {
    return {
      success: false,
      error: graphCommandProtocolError(
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
