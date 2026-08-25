import { Effect } from 'effect';

import type { AnyEntityDefinition, AnyReferenceFieldDefinition } from '../definitions.js';
import { isReferenceFieldDefinition } from '../definitions.js';
import { liftEntityReferenceValue, lowerEntityReferenceValue } from '../reference-field.js';
import { resolveDirectRelationConstraints } from '../relation-constraint.js';
import {
  appliedRelationshipCommand,
  notAppliedRelationshipCommand,
  type RelationshipCommandResult,
} from '../relationship-command-result.js';
import type { RelationshipCommand, RelationshipFact } from '../relationship-command.js';

import { InMemoryDataGraphError } from './command.js';
import type { InMemoryDataset } from './materialization.js';
import { applyEntitySelectionExpression } from './query.js';

const findEntity = (entities: readonly AnyEntityDefinition[], name: string) => {
  const entity = entities.find(candidate => candidate.name === name);
  if (!entity) {
    throw new InMemoryDataGraphError(`Unknown Entity ${name}.`, 'invalid_command');
  }
  return entity;
};

const matchesRef = (row: Record<string, unknown>, ref: RelationshipCommand['source']) =>
  Object.entries(ref.locator).every(([fieldName, value]) => row[fieldName] === value);

const assertRefEntity = (
  ref: RelationshipCommand['source'],
  entity: AnyEntityDefinition,
  role: string,
) => {
  if (ref.entityName !== entity.name) {
    throw new InMemoryDataGraphError(
      `Expected ${role} Ref for ${entity.name}, got ${ref.entityName}.`,
      'invalid_command',
    );
  }
};

const fact = (
  command: RelationshipCommand,
  target: RelationshipFact['target'],
): RelationshipFact => ({
  relation: command.relation,
  source: command.source,
  target,
});

const assertRelationConstraints = (
  dataset: InMemoryDataset,
  sourceEntity: AnyEntityDefinition,
  targetEntity: AnyEntityDefinition,
  command: RelationshipCommand,
) => {
  let constraints: ReturnType<typeof resolveDirectRelationConstraints>;
  try {
    constraints = resolveDirectRelationConstraints(command.relation, sourceEntity, targetEntity);
  } catch (cause) {
    throw new InMemoryDataGraphError(
      cause instanceof Error ? cause.message : 'Cannot resolve direct Relation constraints.',
      'invalid_command',
      cause,
    );
  }

  for (const constraint of constraints) {
    const participantRef = constraint.participant === 'source' ? command.source : command.target;
    if (!participantRef) continue;
    const participantRows = (dataset[constraint.entity.name] ?? []).filter(row =>
      matchesRef(row, participantRef),
    );
    const eligible =
      participantRows.length === 1 &&
      applyEntitySelectionExpression(constraint.entity, participantRows, constraint.selection)
        .length === 1;
    if (eligible) continue;

    throw new InMemoryDataGraphError(
      constraint.rejection.message,
      'relation_constraint_rejected',
      undefined,
      constraint.rejection,
    );
  }
};

type RelationshipMutationContext = {
  dataset: InMemoryDataset;
  command: RelationshipCommand;
  sourceEntity: AnyEntityDefinition;
  targetEntity: AnyEntityDefinition;
  sourceField: AnyReferenceFieldDefinition;
  rows: Record<string, unknown>[];
  rowIndex: number;
  row: Record<string, unknown>;
  currentValue: unknown;
  currentTarget?: RelationshipFact['target'];
};

const applyLink = (context: RelationshipMutationContext): RelationshipCommandResult => {
  const { command, dataset, targetEntity, sourceField, rows, rowIndex, row, currentValue } =
    context;
  if (!command.target) {
    throw new InMemoryDataGraphError('Link commands require a target Ref.', 'invalid_command');
  }
  if (
    command.precondition &&
    (!context.currentTarget ||
      currentValue !== lowerEntityReferenceValue(sourceField, command.precondition.currentTarget))
  ) {
    if (command.precondition?.onMismatch === 'skip') {
      return notAppliedRelationshipCommand(command);
    }
    throw new InMemoryDataGraphError(
      `Current target for ${command.relation.sourceEntityName}.${command.relation.fieldName} does not match the conditional assignment precondition.`,
      'relationship_precondition_failed',
    );
  }
  const targetMatches = (dataset[targetEntity.name] ?? []).filter(candidate =>
    matchesRef(candidate, command.target!),
  );
  if (targetMatches.length !== 1) {
    throw new InMemoryDataGraphError(
      `Expected exactly one ${targetEntity.name} target row, got ${targetMatches.length}.`,
      'cardinality_mismatch',
    );
  }
  assertRelationConstraints(dataset, context.sourceEntity, context.targetEntity, command);
  const nextValue = lowerEntityReferenceValue(sourceField, command.target);
  if (context.currentTarget && currentValue === nextValue) {
    return appliedRelationshipCommand({ added: [], removed: [] });
  }
  rows[rowIndex] = { ...row, [command.relation.fieldName]: nextValue };
  dataset[context.sourceEntity.name] = rows;
  return appliedRelationshipCommand({
    added: [fact(command, command.target)],
    removed: context.currentTarget ? [fact(command, context.currentTarget)] : [],
  });
};

const applyUnlink = (context: RelationshipMutationContext): RelationshipCommandResult => {
  const { command, dataset, sourceEntity, sourceField, rows, rowIndex, row, currentValue } =
    context;
  if (!sourceField.nullable && !sourceField.optional) {
    throw new InMemoryDataGraphError(
      `Required Relation ${sourceEntity.name}.${command.relation.fieldName} cannot be cleared.`,
      'invalid_command',
    );
  }
  if (!context.currentTarget) return appliedRelationshipCommand({ added: [], removed: [] });
  if (command.target && currentValue !== lowerEntityReferenceValue(sourceField, command.target)) {
    return appliedRelationshipCommand({ added: [], removed: [] });
  }
  rows[rowIndex] = { ...row, [command.relation.fieldName]: null };
  dataset[sourceEntity.name] = rows;
  return appliedRelationshipCommand({
    added: [],
    removed: [fact(command, context.currentTarget)],
  });
};

const execute = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: RelationshipCommand,
): RelationshipCommandResult => {
  const sourceEntity = findEntity(entities, command.relation.sourceEntityName);
  const targetEntity = findEntity(entities, command.relation.targetEntityName);
  const sourceField = sourceEntity.fields[command.relation.fieldName];
  if (!sourceField || !isReferenceFieldDefinition(sourceField)) {
    throw new InMemoryDataGraphError(
      `Relationship field ${sourceEntity.name}.${command.relation.fieldName} is not a Reference Field.`,
      'invalid_command',
    );
  }
  if (sourceField.target.name !== targetEntity.name) {
    throw new InMemoryDataGraphError(
      `Relationship field ${sourceEntity.name}.${command.relation.fieldName} does not target ${targetEntity.name}.`,
      'invalid_command',
    );
  }
  assertRefEntity(command.source, sourceEntity, 'source');
  if (command.target) assertRefEntity(command.target, targetEntity, 'target');
  if (command.precondition) {
    assertRefEntity(command.precondition.currentTarget, targetEntity, 'current target');
  }

  const rows = [...(dataset[sourceEntity.name] ?? [])];
  const matches = rows.flatMap((row, index) => (matchesRef(row, command.source) ? [index] : []));
  if (matches.length !== 1) {
    throw new InMemoryDataGraphError(
      `Expected exactly one ${sourceEntity.name} source row, got ${matches.length}.`,
      'cardinality_mismatch',
    );
  }

  const rowIndex = matches[0]!;
  const row = rows[rowIndex]!;
  const currentValue = row[command.relation.fieldName];
  const hasCurrent = currentValue !== null && currentValue !== undefined;
  const currentTarget = hasCurrent
    ? liftEntityReferenceValue(sourceField, currentValue)
    : undefined;
  const context: RelationshipMutationContext = {
    dataset,
    command,
    sourceEntity,
    targetEntity,
    sourceField,
    rows,
    rowIndex,
    row,
    currentValue,
    ...(currentTarget ? { currentTarget } : {}),
  };
  return command.action === 'link' ? applyLink(context) : applyUnlink(context);
};

export const executeInMemoryRelationshipCommandEffect = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: RelationshipCommand,
): Effect.Effect<RelationshipCommandResult, InMemoryDataGraphError> =>
  Effect.try({
    try: () => execute(dataset, entities, command),
    catch: cause =>
      cause instanceof InMemoryDataGraphError
        ? cause
        : new InMemoryDataGraphError(
            'Failed to execute in-memory Relationship Command.',
            'mutation_failed',
            cause,
          ),
  });
