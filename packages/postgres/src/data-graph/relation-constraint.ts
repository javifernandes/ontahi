import type { ResolvedRelationConstraint } from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';
import {
  compilePostgresSelectionWith,
  quotePostgresIdentifier,
  type PostgresSelectionLeafCompiler,
} from './sql.js';

export type PostgresRelationParticipantConstraint = Pick<
  ResolvedRelationConstraint,
  'participant' | 'selection' | 'rejection'
>;

export type CompiledPostgresRelationConstraints = {
  sourceProjection: readonly string[];
  targetProjection: readonly string[];
  stateProjection: readonly string[];
  rejectionExpression: string;
};

const compilePostgresEligibilityLeaf: PostgresSelectionLeafCompiler = (
  predicate,
  column,
  values,
) => {
  if (predicate.operator === 'isNull') return `${column} IS NULL`;
  if (predicate.operator === 'in') {
    if (predicate.values.length === 0) return 'FALSE';
    return `(${predicate.values
      .map(value => {
        values.push(value);
        return `${column} IS NOT DISTINCT FROM $${values.length}`;
      })
      .join(' OR ')})`;
  }

  values.push(predicate.value);
  if (predicate.operator === 'eq') {
    return `${column} IS NOT DISTINCT FROM $${values.length}`;
  }
  const operator = { lte: '<=', lt: '<', gte: '>=', gt: '>' }[predicate.operator];
  return `COALESCE(${column} ${operator} $${values.length}, FALSE)`;
};

export const compilePostgresRelationConstraints = (
  constraints: readonly PostgresRelationParticipantConstraint[],
  sourceMapping: PostgresEntityMapping,
  targetMapping: PostgresEntityMapping,
  values: unknown[],
): CompiledPostgresRelationConstraints => {
  const sourceProjection: string[] = [];
  const targetProjection: string[] = [];
  const stateProjection: string[] = [];

  constraints.forEach((constraint, index) => {
    const alias = quotePostgresIdentifier(`ontahi_constraint_${index}`);
    const mapping = constraint.participant === 'source' ? sourceMapping : targetMapping;
    const projection = `${compilePostgresSelectionWith(
      constraint.selection,
      mapping,
      values,
      compilePostgresEligibilityLeaf,
      'Relation constraint',
    )} AS ${alias}`;
    const participantProjection =
      constraint.participant === 'source' ? sourceProjection : targetProjection;
    participantProjection.push(projection);
    const rows = constraint.participant === 'source' ? 'source_rows' : 'target_rows';
    stateProjection.push(`COALESCE((SELECT BOOL_AND(${alias}) FROM ${rows}), TRUE) AS ${alias}`);
  });

  const rejectionPlaceholders = constraints.map(constraint => {
    values.push(constraint.rejection);
    return `$${values.length}::jsonb`;
  });
  const rejectionExpression =
    constraints.length === 0
      ? 'NULL::jsonb'
      : `CASE ${constraints
          .map(
            (_constraint, index) =>
              `WHEN NOT ${quotePostgresIdentifier(`ontahi_constraint_${index}`)} THEN ${rejectionPlaceholders[index]}`,
          )
          .join(' ')} ELSE NULL::jsonb END`;

  return {
    sourceProjection,
    targetProjection,
    stateProjection,
    rejectionExpression,
  };
};

export const postgresConstraintProjection = (projection: readonly string[]) =>
  projection.length === 0 ? '' : `, ${projection.join(', ')}`;
