import {
  lowerEntityReferenceSelection,
  lowerSelectionReferences,
  type ResolvedDirectRelationConstraint,
  type SelectionExpression,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';
import { quotePostgresIdentifier } from './sql.js';

export type PostgresRelationParticipantConstraint = Pick<
  ResolvedDirectRelationConstraint,
  'participant' | 'selection' | 'rejection'
>;

export type CompiledPostgresRelationConstraints = {
  sourceProjection: readonly string[];
  targetProjection: readonly string[];
  stateProjection: readonly string[];
  rejectionExpression: string;
};

const compilePostgresEligibilitySelection = (
  expression: SelectionExpression,
  mapping: PostgresEntityMapping,
  values: unknown[],
): string => {
  const lowered = lowerSelectionReferences(expression);
  if (lowered.kind === 'all') return 'TRUE';
  if (lowered.kind === 'none') return 'FALSE';
  if (lowered.kind === 'and' || lowered.kind === 'or') {
    if (lowered.operands.length === 0) return lowered.kind === 'and' ? 'TRUE' : 'FALSE';
    return `(${lowered.operands
      .map(operand => compilePostgresEligibilitySelection(operand, mapping, values))
      .join(lowered.kind === 'and' ? ' AND ' : ' OR ')})`;
  }
  if (lowered.kind === 'not') {
    return `(NOT ${compilePostgresEligibilitySelection(lowered.operand, mapping, values)})`;
  }
  if (lowered.kind === 'references') {
    throw new Error('PostgreSQL Relation constraint references could not be lowered.');
  }

  const predicate = lowerEntityReferenceSelection(mapping.entity, lowered);
  if (predicate.kind !== 'predicate') {
    throw new Error('PostgreSQL Relation constraint predicate could not be lowered.');
  }
  const columnName = mapping.columns[predicate.fieldName];
  if (!columnName) {
    throw new Error(`Field ${mapping.entity.name}.${predicate.fieldName} is not mapped.`);
  }
  const column = quotePostgresIdentifier(columnName);
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
    const projection = `${compilePostgresEligibilitySelection(
      constraint.selection,
      mapping,
      values,
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
