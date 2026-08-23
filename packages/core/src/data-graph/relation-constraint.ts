import {
  assertPortableRelationConstraints,
  resolveHasManyTargetField,
  type AnyEntityDefinition,
  type PortableSelectionExpression,
  type RelationConstraintRejection,
  type RelationDefinition,
  type RelationParticipantSelectionConstraint,
} from './definitions.js';
import type { CanonicalRelationIdentity } from './relationship-command.js';
import { selection, type SelectionBuilder } from './selection-value.js';

export type RelationConstraintRejectionInput = Omit<RelationConstraintRejection, 'version'>;

const participantSelection = <TEntity extends AnyEntityDefinition>(
  participant: RelationParticipantSelectionConstraint['participant'],
  entity: TEntity,
  build: SelectionBuilder<TEntity>,
  rejection: RelationConstraintRejectionInput,
): RelationParticipantSelectionConstraint => {
  const constraint = {
    kind: 'participant-selection',
    participant,
    selection: selection(entity, build).build() as PortableSelectionExpression,
    rejection: { version: 1, ...rejection },
  } as const;
  assertPortableRelationConstraints([constraint]);
  return constraint;
};

export const relationConstraint = {
  source: <TEntity extends AnyEntityDefinition>(
    entity: TEntity,
    build: SelectionBuilder<TEntity>,
    rejection: RelationConstraintRejectionInput,
  ) => participantSelection('source', entity, build, rejection),
  target: <TEntity extends AnyEntityDefinition>(
    entity: TEntity,
    build: SelectionBuilder<TEntity>,
    rejection: RelationConstraintRejectionInput,
  ) => participantSelection('target', entity, build, rejection),
};

export type ResolvedRelationConstraint = {
  /** Participant is relative to the canonical Relation identity. */
  readonly participant: 'source' | 'target';
  readonly entity: AnyEntityDefinition;
  readonly selection: PortableSelectionExpression;
  readonly rejection: RelationConstraintRejection;
};

export type ResolvedDirectRelationConstraint = ResolvedRelationConstraint;

type DirectRelationDirection = 'forward' | 'inverse';

const resolveDirectRelationDirection = (
  declaringEntity: AnyEntityDefinition,
  relationName: string,
  relation: RelationDefinition,
  identity: CanonicalRelationIdentity,
): DirectRelationDirection | undefined => {
  if (
    relation.relationKind === 'belongsTo' &&
    declaringEntity.name === identity.sourceEntityName &&
    relation.target.name === identity.targetEntityName &&
    (relation.sourceField ?? relationName) === identity.fieldName
  ) {
    return 'forward';
  }
  if (
    relation.relationKind !== 'hasMany' ||
    declaringEntity.name !== identity.targetEntityName ||
    relation.target.name !== identity.sourceEntityName
  ) {
    return undefined;
  }

  const targetField = resolveHasManyTargetField(declaringEntity, relation);
  if (!targetField) {
    throw new Error(
      `Cannot resolve constrained inverse Relation ${declaringEntity.name}.${relationName}.`,
    );
  }
  return targetField === identity.fieldName ? 'inverse' : undefined;
};

const canonicalParticipant = (
  participant: RelationParticipantSelectionConstraint['participant'],
  direction: DirectRelationDirection,
): RelationParticipantSelectionConstraint['participant'] => {
  if (direction === 'forward') return participant;
  return participant === 'source' ? 'target' : 'source';
};

const resolveConstraints = (
  relation: RelationDefinition,
  direction: DirectRelationDirection,
  sourceEntity: AnyEntityDefinition,
  targetEntity: AnyEntityDefinition,
): readonly ResolvedRelationConstraint[] =>
  (relation.constraints ?? []).map(constraint => {
    const participant = canonicalParticipant(constraint.participant, direction);
    return {
      participant,
      entity: participant === 'source' ? sourceEntity : targetEntity,
      selection: constraint.selection,
      rejection: constraint.rejection,
    };
  });

export const resolveDirectRelationConstraints = (
  identity: CanonicalRelationIdentity,
  sourceEntity: AnyEntityDefinition,
  targetEntity: AnyEntityDefinition,
): readonly ResolvedRelationConstraint[] => {
  if (
    identity.sourceEntityName !== sourceEntity.name ||
    identity.targetEntityName !== targetEntity.name
  ) {
    throw new Error('Direct Relation constraint Entities do not match its canonical identity.');
  }

  const resolved: ResolvedRelationConstraint[] = [];
  for (const declaringEntity of new Set([sourceEntity, targetEntity])) {
    for (const [relationName, relation] of Object.entries(declaringEntity.relations)) {
      if ((relation.constraints?.length ?? 0) === 0) continue;
      const direction = resolveDirectRelationDirection(
        declaringEntity,
        relationName,
        relation,
        identity,
      );
      if (!direction) continue;
      resolved.push(...resolveConstraints(relation, direction, sourceEntity, targetEntity));
    }
  }
  return resolved;
};

export const resolveManyToManyRelationConstraints = (
  relation: RelationDefinition,
  sourceEntity: AnyEntityDefinition,
  targetEntity: AnyEntityDefinition,
): readonly ResolvedRelationConstraint[] => {
  if (relation.relationKind !== 'manyToMany' || relation.target.name !== targetEntity.name) {
    throw new Error('Many-to-many Relation constraints do not match their endpoint Entities.');
  }
  return resolveConstraints(relation, 'forward', sourceEntity, targetEntity);
};
