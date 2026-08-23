import {
  compileSelectionExpression,
  type CompiledSelectionExpression,
  type RelationConstraintRejection,
  type ResolvedRelationConstraint,
} from '@ontahi/core/data-graph';

export type SupabaseRelationParticipantConstraint = {
  participant: 'source' | 'target';
  selection: CompiledSelectionExpression;
  rejection: RelationConstraintRejection;
};

export const compileSupabaseRelationConstraints = (
  constraints: readonly ResolvedRelationConstraint[],
): readonly SupabaseRelationParticipantConstraint[] =>
  constraints.map(constraint => ({
    participant: constraint.participant,
    selection: compileSelectionExpression(constraint.entity, constraint.selection),
    rejection: constraint.rejection,
  }));

const hasValidParameters = (value: unknown) =>
  value === undefined ||
  (value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      parameter =>
        parameter === null ||
        typeof parameter === 'string' ||
        (typeof parameter === 'number' && Number.isFinite(parameter)) ||
        typeof parameter === 'boolean',
    ));

export const isRelationConstraintRejection = (
  value: unknown,
): value is RelationConstraintRejection => {
  const rejection = value as Partial<RelationConstraintRejection> | null;
  return (
    rejection != null &&
    rejection.version === 1 &&
    typeof rejection.code === 'string' &&
    typeof rejection.message === 'string' &&
    hasValidParameters(rejection.parameters)
  );
};

export const relationConstraintRejectionCause = (rejection: RelationConstraintRejection) => ({
  reason: 'relation_constraint_rejected' as const,
  rejection,
});
