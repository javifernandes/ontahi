import { Effect } from 'effect';

import type { AnyEntityDefinition } from '../definitions.js';
import { isReferenceFieldDefinition } from '../definitions.js';
import { liftEntityReferenceValue, lowerEntityReferenceValue } from '../reference-field.js';
import type {
  RelationshipCommand,
  RelationshipDelta,
  RelationshipFact,
} from '../relationship-command.js';

import { InMemoryDataGraphError } from './command.js';
import type { InMemoryDataset } from './materialization.js';

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

const execute = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: RelationshipCommand,
): RelationshipDelta => {
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

  if (command.action === 'link') {
    if (!command.target) {
      throw new InMemoryDataGraphError('Link commands require a target Ref.', 'invalid_command');
    }
    const targetMatches = (dataset[targetEntity.name] ?? []).filter(row =>
      matchesRef(row, command.target!),
    );
    if (targetMatches.length !== 1) {
      throw new InMemoryDataGraphError(
        `Expected exactly one ${targetEntity.name} target row, got ${targetMatches.length}.`,
        'cardinality_mismatch',
      );
    }
    const nextValue = lowerEntityReferenceValue(sourceField, command.target);
    if (hasCurrent && currentValue === nextValue) return { added: [], removed: [] };

    rows[rowIndex] = { ...row, [command.relation.fieldName]: nextValue };
    dataset[sourceEntity.name] = rows;
    return {
      added: [fact(command, command.target)],
      removed: currentTarget ? [fact(command, currentTarget)] : [],
    };
  }

  if (!sourceField.nullable && !sourceField.optional) {
    throw new InMemoryDataGraphError(
      `Required Relation ${sourceEntity.name}.${command.relation.fieldName} cannot be cleared.`,
      'invalid_command',
    );
  }
  if (!currentTarget) return { added: [], removed: [] };
  if (command.target && currentValue !== lowerEntityReferenceValue(sourceField, command.target)) {
    return { added: [], removed: [] };
  }

  rows[rowIndex] = { ...row, [command.relation.fieldName]: null };
  dataset[sourceEntity.name] = rows;
  return { added: [], removed: [fact(command, currentTarget)] };
};

export const executeInMemoryRelationshipCommandEffect = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: RelationshipCommand,
): Effect.Effect<RelationshipDelta, InMemoryDataGraphError> =>
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
