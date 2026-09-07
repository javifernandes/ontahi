import { Effect } from 'effect';

import {
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type RelationDefinition,
} from '../definitions.js';
import { createEntityIdentityRef, entityRefsEqual, type AnyEntityRef } from '../ref/index.js';
import { lowerEntityReferenceValue } from '../reference-field.js';
import {
  appliedRelationshipCommand,
  notAppliedRelationshipCommand,
  orderedRelationshipDiagnostic,
  type RelationshipCommandResult,
} from '../relationship-command-result.js';
import type {
  OrderedRelationshipCommand,
  OrderedRelationshipPosition,
} from '../relationship-command.js';

import { InMemoryDataGraphError } from './command.js';
import type { InMemoryDataset } from './materialization.js';

const matchesRef = (row: Record<string, unknown>, ref: AnyEntityRef) =>
  Object.entries(ref.locator).every(([fieldName, value]) => row[fieldName] === value);

const reject = (code: string, message: string): never => {
  const diagnostic = orderedRelationshipDiagnostic(code, message);
  throw new InMemoryDataGraphError(
    message,
    'ordered_relationship_rejected',
    undefined,
    diagnostic.rejection,
  );
};

const findEntity = (entities: readonly AnyEntityDefinition[], name: string) => {
  const entity = entities.find(candidate => candidate.name === name);
  if (!entity) {
    throw new InMemoryDataGraphError(`Unknown Entity ${name}.`, 'invalid_command');
  }
  return entity;
};

const resolveOrderedRelation = (
  entities: readonly AnyEntityDefinition[],
  command: OrderedRelationshipCommand,
) => {
  const sourceEntity = findEntity(entities, command.relation.sourceEntityName);
  const targetEntity = findEntity(entities, command.relation.targetEntityName);
  const relation = sourceEntity.relations[command.relation.relationName] as
    | RelationDefinition
    | undefined;
  const targetFieldName = relation?.targetField;
  const targetField = targetFieldName ? targetEntity.fields[targetFieldName] : undefined;
  if (
    !relation ||
    relation.relationKind !== 'hasMany' ||
    !relation.ordered ||
    relation.target !== targetEntity ||
    !targetFieldName ||
    !targetField ||
    !isReferenceFieldDefinition(targetField) ||
    targetField.target !== sourceEntity ||
    targetField.nullable ||
    targetField.optional
  ) {
    throw new InMemoryDataGraphError(
      `Relation ${sourceEntity.name}.${command.relation.relationName} is not an ordered required inverse Relation.`,
      'invalid_command',
    );
  }
  return { sourceEntity, targetEntity, targetFieldName, targetField };
};

const positionAt = (refs: readonly AnyEntityRef[], index: number): OrderedRelationshipPosition => ({
  before: refs[index + 1] ?? null,
  after: refs[index - 1] ?? null,
});

const positionsEqual = (left: OrderedRelationshipPosition, right: OrderedRelationshipPosition) =>
  (left.before === null
    ? right.before === null
    : right.before !== null && entityRefsEqual(left.before, right.before)) &&
  (left.after === null
    ? right.after === null
    : right.after !== null && entityRefsEqual(left.after, right.after));

const moveIndex = (
  position: OrderedRelationshipCommand['position'],
  remaining: readonly AnyEntityRef[],
) => {
  if ('at' in position) return position.at === 'start' ? 0 : remaining.length;
  const anchor = 'before' in position ? position.before : position.after;
  const anchorIndex = remaining.findIndex(ref => entityRefsEqual(ref, anchor));
  if (anchorIndex < 0) {
    reject(
      'ordered_relationship_anchor_not_in_relation',
      'Ordered Relationship anchor is not a member of the source Relation.',
    );
  }
  return 'before' in position ? anchorIndex : anchorIndex + 1;
};

const execute = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: OrderedRelationshipCommand,
): RelationshipCommandResult => {
  const { sourceEntity, targetEntity, targetFieldName, targetField } = resolveOrderedRelation(
    entities,
    command,
  );
  if (command.source.entityName !== sourceEntity.name) {
    throw new InMemoryDataGraphError(
      'Ordered Relationship source Ref has the wrong Entity.',
      'invalid_command',
    );
  }
  if (command.member.entityName !== targetEntity.name) {
    throw new InMemoryDataGraphError(
      'Ordered Relationship member Ref has the wrong Entity.',
      'invalid_command',
    );
  }

  const sourceMatches = (dataset[sourceEntity.name] ?? []).filter(row =>
    matchesRef(row, command.source),
  );
  if (sourceMatches.length === 0) {
    reject('ordered_relationship_source_not_found', 'Ordered Relationship source was not found.');
  }
  if (sourceMatches.length !== 1) {
    throw new InMemoryDataGraphError(
      `Expected exactly one ${sourceEntity.name} source row, got ${sourceMatches.length}.`,
      'cardinality_mismatch',
    );
  }

  const rows = [...(dataset[targetEntity.name] ?? [])];
  const sourceValue = lowerEntityReferenceValue(targetField, command.source);
  const resolveParticipant = (ref: AnyEntityRef, role: 'member' | 'anchor' | 'neighbor') => {
    if (ref.entityName !== targetEntity.name) {
      throw new InMemoryDataGraphError(
        `Ordered Relationship ${role} Ref has the wrong Entity.`,
        'invalid_command',
      );
    }
    const matches = rows.flatMap((row, index) => (matchesRef(row, ref) ? [{ row, index }] : []));
    if (matches.length === 0) {
      reject(
        `ordered_relationship_${role}_not_found`,
        `Ordered Relationship ${role} was not found.`,
      );
    }
    if (matches.length !== 1) {
      throw new InMemoryDataGraphError(
        `Expected exactly one ${targetEntity.name} ${role} row, got ${matches.length}.`,
        'cardinality_mismatch',
      );
    }
    const match = matches[0]!;
    if (match.row[targetFieldName] !== sourceValue) {
      reject(
        `ordered_relationship_${role}_not_in_relation`,
        `Ordered Relationship ${role} is not a member of the source Relation.`,
      );
    }
    const identityRef = createEntityIdentityRef(targetEntity, match.row);
    if (!identityRef) {
      throw new InMemoryDataGraphError(
        `Ordered Relationship ${role} ${targetEntity.name} has no materializable identity.`,
        'invalid_command',
      );
    }
    return { ...match, ref: identityRef };
  };
  const memberMatch = resolveParticipant(command.member, 'member');

  const members = rows.flatMap((row, index) => {
    if (row[targetFieldName] !== sourceValue) return [];
    const ref = createEntityIdentityRef(targetEntity, row);
    if (!ref) {
      throw new InMemoryDataGraphError(
        `Ordered Relationship member ${targetEntity.name} has no materializable identity.`,
        'invalid_command',
      );
    }
    return [{ row, index, ref }];
  });
  const memberIndex = members.findIndex(({ index }) => index === memberMatch.index);
  if (memberIndex < 0) {
    reject(
      'ordered_relationship_member_not_in_relation',
      'Ordered Relationship member does not belong to the source Relation.',
    );
  }
  const memberRefs = members.map(({ ref }) => ref);
  const memberRef = memberRefs[memberIndex]!;
  const canonicalizeParticipant = (ref: AnyEntityRef | null, role: 'anchor' | 'neighbor') =>
    ref === null ? null : resolveParticipant(ref, role).ref;
  const from = positionAt(memberRefs, memberIndex);
  const expectedPosition = command.precondition
    ? {
        before: canonicalizeParticipant(command.precondition.position.before, 'neighbor'),
        after: canonicalizeParticipant(command.precondition.position.after, 'neighbor'),
      }
    : undefined;
  if (expectedPosition && !positionsEqual(from, expectedPosition)) {
    if (command.precondition?.onMismatch === 'skip') return notAppliedRelationshipCommand(command);
    throw new InMemoryDataGraphError(
      'Ordered Relationship position did not match the command precondition.',
      'relationship_precondition_failed',
    );
  }

  const anchor =
    'before' in command.position
      ? command.position.before
      : 'after' in command.position
        ? command.position.after
        : undefined;
  const canonicalAnchor = anchor ? canonicalizeParticipant(anchor, 'anchor') : undefined;
  if (canonicalAnchor && entityRefsEqual(canonicalAnchor, memberRef)) {
    return appliedRelationshipCommand({ added: [], removed: [], moved: [] });
  }
  const remaining = memberRefs.filter(ref => !entityRefsEqual(ref, memberRef));
  const position =
    'before' in command.position
      ? { before: canonicalAnchor! }
      : 'after' in command.position
        ? { after: canonicalAnchor! }
        : command.position;
  const destinationIndex = moveIndex(position, remaining);
  const nextRefs = [...remaining];
  nextRefs.splice(destinationIndex, 0, memberRef);
  if (nextRefs.every((ref, index) => entityRefsEqual(ref, memberRefs[index]!))) {
    return appliedRelationshipCommand({ added: [], removed: [], moved: [] });
  }

  const reorderedRows = nextRefs.map(
    ref => members.find(member => entityRefsEqual(member.ref, ref))!.row,
  );
  members.forEach(({ index }, orderedIndex) => {
    rows[index] = reorderedRows[orderedIndex]!;
  });
  dataset[targetEntity.name] = rows;
  const toIndex = nextRefs.findIndex(ref => entityRefsEqual(ref, memberRef));
  return appliedRelationshipCommand({
    added: [],
    removed: [],
    moved: [
      {
        relation: command.relation,
        source: command.source,
        member: memberRef,
        from,
        to: positionAt(nextRefs, toIndex),
      },
    ],
  });
};

export const executeInMemoryOrderedRelationshipCommandEffect = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  command: OrderedRelationshipCommand,
): Effect.Effect<RelationshipCommandResult, InMemoryDataGraphError> =>
  Effect.try({
    try: () => execute(dataset, entities, command),
    catch: cause =>
      cause instanceof InMemoryDataGraphError
        ? cause
        : new InMemoryDataGraphError(
            'Failed to execute in-memory ordered Relationship Command.',
            'mutation_failed',
            cause,
          ),
  });
