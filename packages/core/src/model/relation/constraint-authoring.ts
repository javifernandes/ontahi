import type { AnyEntityDefinition } from '../entity/definition.js';
import { selection, type SelectionBuilder } from '../query/selection/selection.js';

import {
  assertPortableRelationConstraints,
  type PortableSelectionExpression,
  type RelationCountAtMostFieldConstraint,
  type RelationConstraintRejection,
  type RelationParticipantSelectionConstraint,
} from './definition.js';

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
