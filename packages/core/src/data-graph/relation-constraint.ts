import {
  assertPortableRelationConstraints,
  type AnyEntityDefinition,
  type PortableSelectionExpression,
  type RelationConstraintRejection,
  type RelationParticipantSelectionConstraint,
} from './definitions.js';
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
