import {
  assertPortableRelationConstraints,
  resolveHasManyTargetField,
  type AnyEntityDefinition,
  type PortableSelectionExpression,
  type RelationCountAtMostFieldConstraint,
  type RelationConstraint,
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
  countAtMost: (
    fieldName: string,
    rejection: RelationConstraintRejectionInput,
  ): RelationCountAtMostFieldConstraint => {
    if (!fieldName) throw new TypeError('Relation count constraint Field name cannot be empty.');
    const constraint = {
      kind: 'relation-count-at-most-field',
      fieldName,
      enforcement: 'authority-serialized',
      rejection: { version: 1, ...rejection },
    } as const;
    assertPortableRelationConstraints([constraint]);
    return constraint;
  },
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
  (relation.constraints ?? [])
    .filter(
      (constraint): constraint is RelationParticipantSelectionConstraint =>
        constraint.kind === 'participant-selection',
    )
    .map(constraint => {
      const participant = canonicalParticipant(constraint.participant, direction);
      return {
        participant,
        entity: participant === 'source' ? sourceEntity : targetEntity,
        selection: constraint.selection,
        rejection: constraint.rejection,
      };
    });

export type ResolvedDirectRelationCountConstraint = {
  /** Participant is relative to the canonical direct Relation identity. */
  readonly participant: 'target';
  readonly entity: AnyEntityDefinition;
  readonly fieldName: string;
  readonly enforcement: 'authority-serialized';
  readonly rejection: RelationConstraintRejection;
};

const countConstraints = (
  constraints: readonly RelationConstraint[] | undefined,
): readonly RelationCountAtMostFieldConstraint[] =>
  (constraints ?? []).filter(
    (constraint): constraint is RelationCountAtMostFieldConstraint =>
      constraint.kind === 'relation-count-at-most-field',
  );

const resolveCountConstraints = (
  declaringEntity: AnyEntityDefinition,
  relationName: string,
  relation: RelationDefinition,
  direction: DirectRelationDirection,
  targetEntity: AnyEntityDefinition,
): readonly ResolvedDirectRelationCountConstraint[] => {
  const constraints = countConstraints(relation.constraints);
  if (constraints.length === 0) return [];
  if (relation.relationKind !== 'hasMany') {
    throw new TypeError(
      `Relation count constraint ${declaringEntity.name}.${relationName} requires a to-many Relation.`,
    );
  }
  if (direction !== 'inverse') {
    throw new TypeError(
      `Relation count constraint ${declaringEntity.name}.${relationName} did not resolve through its to-many endpoint.`,
    );
  }

  return constraints.map(constraint => {
    const field = declaringEntity.fields[constraint.fieldName];
    if (!field || field.fieldType !== 'number' || field.derived) {
      throw new TypeError(
        `Relation count constraint ${declaringEntity.name}.${relationName} requires stored numeric Field ${constraint.fieldName}.`,
      );
    }
    return {
      participant: 'target',
      entity: targetEntity,
      fieldName: constraint.fieldName,
      enforcement: constraint.enforcement,
      rejection: constraint.rejection,
    };
  });
};

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

export const resolveDirectRelationCountConstraints = (
  identity: CanonicalRelationIdentity,
  sourceEntity: AnyEntityDefinition,
  targetEntity: AnyEntityDefinition,
): readonly ResolvedDirectRelationCountConstraint[] => {
  if (
    identity.sourceEntityName !== sourceEntity.name ||
    identity.targetEntityName !== targetEntity.name
  ) {
    throw new Error(
      'Direct Relation count constraint Entities do not match its canonical identity.',
    );
  }

  const resolved: ResolvedDirectRelationCountConstraint[] = [];
  for (const declaringEntity of new Set([sourceEntity, targetEntity])) {
    for (const [relationName, relation] of Object.entries(declaringEntity.relations)) {
      if (countConstraints(relation.constraints).length === 0) continue;
      const direction = resolveDirectRelationDirection(
        declaringEntity,
        relationName,
        relation,
        identity,
      );
      if (!direction) continue;
      resolved.push(
        ...resolveCountConstraints(
          declaringEntity,
          relationName,
          relation,
          direction,
          targetEntity,
        ),
      );
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
  if (countConstraints(relation.constraints).length > 0) {
    throw new Error('Many-to-many Relation count constraints are not supported.');
  }
  return resolveConstraints(relation, 'forward', sourceEntity, targetEntity);
};
