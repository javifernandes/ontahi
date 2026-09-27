import { isJsonValue } from '../value/json.js';
import { isRecord } from '../value/object.js';

import type { GraphCommandSpec } from './command.js';
import {
  isDerivedFieldDefinition,
  type AnyEntityDefinition,
  type InferEntityMutationRecord,
  type RelationConstraintRejection,
} from './definitions.js';
import {
  createEntityIdentityRef,
  createEntityRef,
  entityRefsEqual,
  isEntityRef,
  type AnyEntityRef,
  type EntityRef,
} from './ref/index.js';
import { isRelationConstraintRejection } from './relationship-command-result.js';
import {
  assertNoRelationImage,
  selectionAnd,
  selectionNone,
  selectionReferences,
  type SelectionAst,
  type SelectionExpression,
} from './selection-ast.js';

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
  const exactFact = expected[0];
  const targetMatches =
    command.action === 'create'
      ? exactFact?.ref === undefined || exactFact.ref.entityName === command.entityName
      : isEntityRef(command.target) &&
        exactFact?.ref !== undefined &&
        entityRefsEqual(exactFact.ref, command.target);
  return (
    expected.length === 1 &&
    unexpected.length === 0 &&
    exactFact?.entityName === command.entityName &&
    targetMatches
  );
};

export const isEntityMutationDeltaForCommand = (
  value: unknown,
  command: EntityMutationCommand,
): value is EntityMutationDelta => {
  if (!isEntityMutationDelta(value)) return false;
  if (command.action === 'create' || isEntityRef(command.target))
    return isExactEntityMutationDelta(value, command);
  const expected = command.action === 'update' ? value.updated : value.deleted;
  const unexpected =
    command.action === 'update'
      ? [...value.created, ...value.deleted]
      : [...value.created, ...value.updated];
  return (
    unexpected.length === 0 &&
    expected.every(
      fact => fact.entityName === command.entityName && fact.ref?.entityName === command.entityName,
    )
  );
};

export type EntityMutationCommandDiagnostic = {
  readonly reason: 'entity_mutation_cardinality_mismatch' | 'entity_mutation_condition_not_met';
  readonly rejection: RelationConstraintRejection;
};

export const isEntityMutationCommandDiagnostic = (
  value: unknown,
): value is EntityMutationCommandDiagnostic =>
  isRecord(value) &&
  (value.reason === 'entity_mutation_cardinality_mismatch' ||
    value.reason === 'entity_mutation_condition_not_met') &&
  isRelationConstraintRejection(value.rejection) &&
  value.rejection.code === value.reason;

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

export const entityMutationConditionNotMetDiagnostic = (
  command: EntityMutationCommand,
): EntityMutationCommandDiagnostic => ({
  reason: 'entity_mutation_condition_not_met',
  rejection: {
    version: 1,
    code: 'entity_mutation_condition_not_met',
    message: 'Entity mutation condition was not satisfied.',
    parameters: { entityName: command.entityName, action: command.action },
  },
});

export const hasEntityMutationCondition = (
  command: EntityMutationCommand,
): command is (UpdateEntityMutationCommand | DeleteEntityMutationCommand) & {
  if: Record<string, unknown>;
} => command.action !== 'create' && command.if !== undefined;

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
    const reason = ownDataProperty(current, 'reason');
    if (reason === 'entity_mutation_condition_not_met' && command.action !== 'create') {
      return entityMutationConditionNotMetDiagnostic(command);
    }
    if (reason === 'cardinality_mismatch' && command.action !== 'create') {
      return entityMutationCardinalityDiagnostic(command);
    }
    for (const key of ownPropertyKeys(current)) {
      const nested = ownDataProperty(current, key);
      if (isRecord(nested) && !seen.has(nested)) pending.push(nested);
    }
  }
  return undefined;
};

export type CreateEntityMutationCommand<TEntityName extends string = string> = {
  kind: 'entity-mutation-command';
  action: 'create';
  entityName: TEntityName;
  values: Record<string, unknown>;
};

export type UpdateEntityMutationCommand<TEntityName extends string = string> = {
  kind: 'entity-mutation-command';
  action: 'update';
  entityName: TEntityName;
  target: EntityRef<TEntityName> | SelectionAst<TEntityName>;
  values: Record<string, unknown>;
  if?: Record<string, unknown>;
};

export type DeleteEntityMutationCommand<TEntityName extends string = string> = {
  kind: 'entity-mutation-command';
  action: 'delete';
  entityName: TEntityName;
  target: EntityRef<TEntityName> | SelectionAst<TEntityName>;
  if?: Record<string, unknown>;
};

export type EntityMutationCommand =
  | CreateEntityMutationCommand
  | UpdateEntityMutationCommand
  | DeleteEntityMutationCommand;

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

const toEntityMutationConditionSelection = (values: Record<string, unknown>): SelectionExpression =>
  selectionAnd(
    ...Object.entries(values).map(([fieldName, value]) =>
      value === null
        ? { kind: 'predicate' as const, operator: 'isNull' as const, fieldName }
        : { kind: 'predicate' as const, operator: 'eq' as const, fieldName, value },
    ),
  );

const assertEntityMutationCondition = (
  entity: AnyEntityDefinition,
  command: EntityMutationCommand,
) => {
  if (!hasEntityMutationCondition(command)) return;
  const fieldNames = Object.keys(command.if);
  if (fieldNames.length === 0) {
    throw new Error('Entity mutation condition cannot be empty.');
  }
  const invalidField = fieldNames.find(fieldName => {
    const field = entity.fields[fieldName];
    return !field || isDerivedFieldDefinition(field);
  });
  if (invalidField) {
    throw new Error(`Entity mutation condition cannot test ${entity.name}.${invalidField}.`);
  }
};

export const toEntityMutationGraphCommand = (
  entity: AnyEntityDefinition,
  command: EntityMutationCommand,
): GraphCommandSpec<any, any, Record<string, unknown> | readonly Record<string, unknown>[]> => {
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
  if ('target' in command && !isEntityRef(command.target)) {
    assertNoRelationImage(command.target.expression, 'Entity Selection mutation');
    if (hasEntityMutationCondition(command))
      throw new Error('Entity Selection mutations do not support exact mutation conditions.');
  }
  assertEntityMutationCondition(entity, command);
  return {
    kind: 'command',
    operation:
      command.action === 'create' ? 'insert' : command.action === 'update' ? 'update' : 'delete',
    root: entity,
    selection:
      'target' in command
        ? selectionAnd(
            isEntityRef(command.target)
              ? selectionReferences([command.target])
              : command.target.expression,
            ...(hasEntityMutationCondition(command)
              ? [toEntityMutationConditionSelection(command.if)]
              : []),
          )
        : selectionNone(),
    ...('values' in command ? { payload: command.values } : {}),
    returning: storedEntityFieldNames(entity),
    cardinality:
      command.action === 'create' || ('target' in command && isEntityRef(command.target))
        ? 'one'
        : undefined,
  };
};

export const materializeEntityMutationDelta = (
  entity: AnyEntityDefinition,
  command: EntityMutationCommand,
  values: Record<string, unknown> | readonly Record<string, unknown>[],
): EntityMutationDelta => {
  const rows = Array.isArray(values) ? values : [values];
  const facts = rows.map(row => {
    const portableValues = Object.fromEntries(
      Object.entries(row).filter(([, value]) => value !== undefined),
    );
    const ref =
      command.action !== 'create' && isEntityRef(command.target)
        ? createEntityRef(command.target.entityName, command.target.locator)
        : createEntityIdentityRef(entity, portableValues);
    return {
      entityName: entity.name,
      ...(ref ? { ref } : {}),
      values: portableValues,
    };
  });
  const delta: EntityMutationDelta = { created: [], updated: [], deleted: [] };
  if (command.action === 'create') delta.created.push(...facts);
  else if (command.action === 'update') delta.updated.push(...facts);
  else delta.deleted.push(...facts);
  return delta;
};

const assertTarget = (entity: AnyEntityDefinition, target: AnyEntityRef) => {
  if (target.entityName !== entity.name) {
    throw new Error(
      `Expected Entity mutation target Ref for ${entity.name}, got ${target.entityName}.`,
    );
  }
};

export type EntityMutationCondition<TEntity extends AnyEntityDefinition> = Partial<
  InferEntityMutationRecord<TEntity['fields']>
>;

export type EntityMutationConditionOptions<TEntity extends AnyEntityDefinition> = {
  readonly if: EntityMutationCondition<TEntity>;
};

const conditionFields = <TEntity extends AnyEntityDefinition>(
  options?: EntityMutationConditionOptions<TEntity>,
) => {
  if (!options) return undefined;
  if (Object.keys(options.if).length === 0) {
    throw new Error('Entity mutation condition cannot be empty.');
  }
  return options.if as Record<string, unknown>;
};

export const mutateEntity = <TEntity extends AnyEntityDefinition>(entity: TEntity) => ({
  create: (
    values: InferEntityMutationRecord<TEntity['fields']>,
  ): CreateEntityMutationCommand<TEntity['name']> => ({
    kind: 'entity-mutation-command',
    action: 'create',
    entityName: entity.name,
    values,
  }),
  update: (
    target: EntityRef<TEntity['name']>,
    values: Partial<InferEntityMutationRecord<TEntity['fields']>>,
    options?: EntityMutationConditionOptions<TEntity>,
  ): UpdateEntityMutationCommand<TEntity['name']> => {
    assertTarget(entity, target);
    const condition = conditionFields(options);
    return {
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: entity.name,
      target,
      values,
      ...(condition ? { if: condition } : {}),
    };
  },
  delete: (
    target: EntityRef<TEntity['name']>,
    options?: EntityMutationConditionOptions<TEntity>,
  ): DeleteEntityMutationCommand<TEntity['name']> => {
    assertTarget(entity, target);
    const condition = conditionFields(options);
    return {
      kind: 'entity-mutation-command',
      action: 'delete',
      entityName: entity.name,
      target,
      ...(condition ? { if: condition } : {}),
    };
  },
  updateSelection: (
    target: SelectionAst<TEntity['name']>,
    values: Partial<InferEntityMutationRecord<TEntity['fields']>>,
  ): UpdateEntityMutationCommand<TEntity['name']> => ({
    kind: 'entity-mutation-command',
    action: 'update',
    entityName: entity.name,
    target,
    values,
  }),
  deleteSelection: (
    target: SelectionAst<TEntity['name']>,
  ): DeleteEntityMutationCommand<TEntity['name']> => ({
    kind: 'entity-mutation-command',
    action: 'delete',
    entityName: entity.name,
    target,
  }),
});
