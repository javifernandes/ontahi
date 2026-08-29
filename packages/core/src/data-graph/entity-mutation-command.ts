import { isJsonValue } from '../value/json.js';
import { isRecord } from '../value/object.js';

import type { GraphCommandSpec } from './command.js';
import {
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type InferEntityMutationRecord,
  type RelationConstraintRejection,
} from './definitions.js';
import { createEntityIdentityRef, isEntityRef, type AnyEntityRef } from './ref/index.js';
import { isRelationConstraintRejection } from './relationship-command-result.js';
import { selectionNone, selectionReferences } from './selection-ast.js';

export type EntityMutationFact = {
  entityName: string;
  ref?: AnyEntityRef;
  values: Record<string, unknown>;
};

export type EntityMutationDelta = {
  created: EntityMutationFact[];
  updated: EntityMutationFact[];
  deleted: EntityMutationFact[];
};

const isEntityMutationFact = (value: unknown): value is EntityMutationFact =>
  isRecord(value) &&
  typeof value.entityName === 'string' &&
  (value.ref === undefined || isEntityRef(value.ref)) &&
  isRecord(value.values) &&
  isJsonValue(value.values);

export const isEntityMutationDelta = (value: unknown): value is EntityMutationDelta =>
  isRecord(value) &&
  Array.isArray(value.created) &&
  value.created.every(isEntityMutationFact) &&
  Array.isArray(value.updated) &&
  value.updated.every(isEntityMutationFact) &&
  Array.isArray(value.deleted) &&
  value.deleted.every(isEntityMutationFact);

export const isExactEntityMutationDelta = (
  value: unknown,
  command: EntityMutationCommand,
): value is EntityMutationDelta => {
  if (!isEntityMutationDelta(value)) return false;
  const expected =
    command.action === 'create'
      ? value.created
      : command.action === 'update'
        ? value.updated
        : value.deleted;
  const unexpected =
    command.action === 'create'
      ? [...value.updated, ...value.deleted]
      : command.action === 'update'
        ? [...value.created, ...value.deleted]
        : [...value.created, ...value.updated];
  return (
    expected.length === 1 &&
    unexpected.length === 0 &&
    expected[0]?.entityName === command.entityName &&
    (expected[0].ref === undefined || expected[0].ref.entityName === command.entityName)
  );
};

export type EntityMutationCommandDiagnostic = {
  readonly reason: 'entity_mutation_cardinality_mismatch';
  readonly rejection: RelationConstraintRejection;
};

export const isEntityMutationCommandDiagnostic = (
  value: unknown,
): value is EntityMutationCommandDiagnostic =>
  isRecord(value) &&
  value.reason === 'entity_mutation_cardinality_mismatch' &&
  isRelationConstraintRejection(value.rejection);

export const entityMutationCardinalityDiagnostic = (
  command: EntityMutationCommand,
): EntityMutationCommandDiagnostic => ({
  reason: 'entity_mutation_cardinality_mismatch',
  rejection: {
    version: 1,
    code: 'entity_mutation_cardinality_mismatch',
    message: 'Entity mutation target did not resolve exactly once.',
    parameters: { entityName: command.entityName, action: command.action },
  },
});

const ownDataProperty = (record: object, key: PropertyKey): unknown => {
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(record, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
};

const ownPropertyKeys = (record: object): PropertyKey[] => {
  try {
    return Reflect.ownKeys(record);
  } catch {
    return [];
  }
};

export const entityMutationCommandDiagnosticFromError = (
  error: unknown,
  command: EntityMutationCommand,
): EntityMutationCommandDiagnostic | undefined => {
  const seen = new Set<unknown>();
  const pending: unknown[] = [error];
  while (pending.length > 0 && seen.size < 64) {
    const current = pending.shift();
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    const diagnostic = ownDataProperty(current, 'diagnostic');
    if (isEntityMutationCommandDiagnostic(diagnostic)) return diagnostic;
    if (
      ownDataProperty(current, 'reason') === 'cardinality_mismatch' &&
      command.action !== 'create'
    ) {
      return entityMutationCardinalityDiagnostic(command);
    }
    for (const key of ownPropertyKeys(current)) {
      const nested = ownDataProperty(current, key);
      if (isRecord(nested) && !seen.has(nested)) pending.push(nested);
    }
  }
  return undefined;
};

export type EntityMutationCommand =
  | {
      kind: 'entity-mutation-command';
      action: 'create';
      entityName: string;
      values: Record<string, unknown>;
    }
  | {
      kind: 'entity-mutation-command';
      action: 'update';
      entityName: string;
      target: AnyEntityRef;
      values: Record<string, unknown>;
    }
  | {
      kind: 'entity-mutation-command';
      action: 'delete';
      entityName: string;
      target: AnyEntityRef;
    };

export interface EntityMutationCommandExecutionRuntime<TError = never, TOptions = undefined> {
  runEntityMutationCommand(
    command: EntityMutationCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<EntityMutationDelta, TError>;
}

const storedEntityFieldNames = (entity: AnyEntityDefinition) =>
  Object.entries(entity.fields)
    .filter(([, field]) => !isDerivedFieldDefinition(field))
    .map(([fieldName]) => fieldName);

export const toEntityMutationGraphCommand = (
  entity: AnyEntityDefinition,
  command: EntityMutationCommand,
): GraphCommandSpec<any, any, Record<string, unknown>> => {
  if (command.entityName !== entity.name) {
    throw new Error(
      `Expected Entity mutation command for ${entity.name}, got ${command.entityName}.`,
    );
  }
  if ('target' in command && command.target.entityName !== entity.name) {
    throw new Error(
      `Expected Entity mutation target Ref for ${entity.name}, got ${command.target.entityName}.`,
    );
  }
  return {
    kind: 'command',
    operation:
      command.action === 'create' ? 'insert' : command.action === 'update' ? 'update' : 'delete',
    root: entity,
    selection: 'target' in command ? selectionReferences([command.target]) : selectionNone(),
    ...('values' in command ? { payload: command.values } : {}),
    returning: storedEntityFieldNames(entity),
    cardinality: 'one',
  };
};

export const materializeEntityMutationDelta = (
  entity: AnyEntityDefinition,
  command: EntityMutationCommand,
  values: Record<string, unknown>,
): EntityMutationDelta => {
  const portableValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
  const fact: EntityMutationFact = {
    entityName: entity.name,
    ...(createEntityIdentityRef(entity, portableValues)
      ? { ref: createEntityIdentityRef(entity, portableValues) }
      : {}),
    values: portableValues,
  };
  const delta: EntityMutationDelta = { created: [], updated: [], deleted: [] };
  if (command.action === 'create') delta.created.push(fact);
  else if (command.action === 'update') delta.updated.push(fact);
  else delta.deleted.push(fact);
  return delta;
};

const assertTarget = (entity: AnyEntityDefinition, target: AnyEntityRef) => {
  if (target.entityName !== entity.name) {
    throw new Error(
      `Expected Entity mutation target Ref for ${entity.name}, got ${target.entityName}.`,
    );
  }
};

export const mutateEntity = <TEntity extends AnyEntityDefinition>(entity: TEntity) => ({
  create: (values: InferEntityMutationRecord<TEntity['fields']>): EntityMutationCommand => ({
    kind: 'entity-mutation-command',
    action: 'create',
    entityName: entity.name,
    values,
  }),
  update: (
    target: AnyEntityRef,
    values: Partial<InferEntityMutationRecord<TEntity['fields']>>,
  ): EntityMutationCommand => {
    assertTarget(entity, target);
    return {
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: entity.name,
      target,
      values,
    };
  },
  delete: (target: AnyEntityRef): EntityMutationCommand => {
    assertTarget(entity, target);
    return {
      kind: 'entity-mutation-command',
      action: 'delete',
      entityName: entity.name,
      target,
    };
  },
});
