import {
  assertPortableRelationConstraints,
  resolveHasManyTargetField,
  type AnyEntityDefinition,
  type PortableSelectionExpression,
  type RelationConstraintRejection,
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

export type ResolvedDirectRelationConstraint = {
  /** Participant is relative to the canonical direct Relation identity. */
  readonly participant: 'source' | 'target';
  readonly entity: AnyEntityDefinition;
  readonly selection: PortableSelectionExpression;
  readonly rejection: RelationConstraintRejection;
};

export const resolveDirectRelationConstraints = (
  identity: CanonicalRelationIdentity,
  sourceEntity: AnyEntityDefinition,
  targetEntity: AnyEntityDefinition,
): readonly ResolvedDirectRelationConstraint[] => {
  if (
    identity.sourceEntityName !== sourceEntity.name ||
    identity.targetEntityName !== targetEntity.name
  ) {
    throw new Error('Direct Relation constraint Entities do not match its canonical identity.');
  }

  const resolved: ResolvedDirectRelationConstraint[] = [];
  for (const declaringEntity of [sourceEntity, targetEntity]) {
    for (const [relationName, relation] of Object.entries(declaringEntity.relations)) {
      if ((relation.constraints?.length ?? 0) === 0) continue;

      let direction: 'forward' | 'inverse' | undefined;
      if (
        relation.relationKind === 'belongsTo' &&
        declaringEntity.name === identity.sourceEntityName &&
        relation.target.name === identity.targetEntityName &&
        (relation.sourceField ?? relationName) === identity.fieldName
      ) {
        direction = 'forward';
      } else if (
        relation.relationKind === 'hasMany' &&
        declaringEntity.name === identity.targetEntityName &&
        relation.target.name === identity.sourceEntityName
      ) {
        const targetField = resolveHasManyTargetField(declaringEntity, relation);
        if (!targetField) {
          throw new Error(
            `Cannot resolve constrained inverse Relation ${declaringEntity.name}.${relationName}.`,
          );
        }
        if (targetField === identity.fieldName) direction = 'inverse';
      }
      if (!direction) continue;

      for (const constraint of relation.constraints ?? []) {
        const participant =
          direction === 'forward'
            ? constraint.participant
            : constraint.participant === 'source'
              ? 'target'
              : 'source';
        resolved.push({
          participant,
          entity: participant === 'source' ? sourceEntity : targetEntity,
          selection: constraint.selection,
          rejection: constraint.rejection,
        });
      }
    }
  }
  return resolved;
};
