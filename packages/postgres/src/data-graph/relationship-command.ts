import {
  isReferenceFieldDefinition,
  liftEntityReferenceValue,
  lowerEntityReferenceValue,
  resolveDirectRelationConstraints,
  selectionReferences,
  type RelationConstraintRejection,
  type RelationshipCommand,
  type RelationshipDelta,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';
import {
  compilePostgresRelationConstraints,
  postgresConstraintProjection,
} from './relation-constraint.js';
import { compilePostgresRelationCountConstraints } from './relation-count-constraint.js';
import { compilePostgresSelection, quotePostgresIdentifier } from './sql.js';

export type PostgresRelationshipCommandRow = {
  source_count: number;
  target_count: number;
  updated_count: number;
  old_target: unknown;
  precondition_matched: boolean;
  constraint_rejection?: RelationConstraintRejection | null;
};

export type CompiledPostgresRelationshipCommand = {
  sql: { text: string; values: unknown[] };
  serializationLock?: { text: string; values: unknown[] };
  sourceMapping: PostgresEntityMapping;
  targetMapping: PostgresEntityMapping;
};

const assertMapping = (
  command: RelationshipCommand,
  source: PostgresEntityMapping,
  target: PostgresEntityMapping,
) => {
  if (
    source.entity.name !== command.relation.sourceEntityName ||
    target.entity.name !== command.relation.targetEntityName
  ) {
    throw new Error(
      'PostgreSQL Relationship Command mappings do not match its canonical Relation.',
    );
  }
  const field = source.entity.fields[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field) || field.target.name !== target.entity.name) {
    throw new Error('PostgreSQL Relationship Command does not reference a mapped Reference Field.');
  }
  if (command.action === 'unlink' && !command.target && !field.nullable && !field.optional) {
    throw new Error('PostgreSQL Relationship Command cannot clear a required Relation.');
  }
  return field;
};

const resolveConstraints = (
  command: RelationshipCommand,
  sourceMapping: PostgresEntityMapping,
  targetMapping: PostgresEntityMapping,
) => {
  if (command.action !== 'link') return [];
  try {
    return resolveDirectRelationConstraints(
      command.relation,
      sourceMapping.entity,
      targetMapping.entity,
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Cannot resolve Relation constraints.';
    throw new Error(
      `PostgreSQL Relationship Command ${message.charAt(0).toLowerCase()}${message.slice(1)}`,
    );
  }
};

export const compilePostgresRelationshipCommand = (
  command: RelationshipCommand,
  sourceMapping: PostgresEntityMapping,
  targetMapping: PostgresEntityMapping,
): CompiledPostgresRelationshipCommand => {
  const field = assertMapping(command, sourceMapping, targetMapping);
  const values: unknown[] = [];
  const sourceWhere = compilePostgresSelection(
    selectionReferences([command.source]),
    sourceMapping,
    values,
  );
  const targetWhere = command.target
    ? compilePostgresSelection(selectionReferences([command.target]), targetMapping, values)
    : 'FALSE';
  const constraints = compilePostgresRelationConstraints(
    resolveConstraints(command, sourceMapping, targetMapping),
    sourceMapping,
    targetMapping,
    values,
  );
  const expected =
    command.precondition?.currentTarget ??
    (command.action === 'unlink' ? command.target : undefined);
  const expectedValue = expected ? lowerEntityReferenceValue(field, expected) : undefined;
  const expectedCondition = expected
    ? `old_target IS NOT DISTINCT FROM $${values.push(expectedValue)}`
    : 'TRUE';
  const nextValue =
    command.action === 'link' ? lowerEntityReferenceValue(field, command.target) : null;
  const nextPlaceholder = `$${values.push(nextValue)}`;
  const sourceTable = quotePostgresIdentifier(sourceMapping.table);
  const targetTable = quotePostgresIdentifier(targetMapping.table);
  const relationColumn = quotePostgresIdentifier(
    sourceMapping.columns[command.relation.fieldName]!,
  );
  const requiredTargetCount = command.action === 'link' ? 'target_count = 1' : 'TRUE';
  const countConstraints = compilePostgresRelationCountConstraints({
    command,
    sourceMapping,
    targetMapping,
    relationColumn,
    nextPlaceholder,
    values,
  });

  return {
    sourceMapping,
    targetMapping,
    ...(countConstraints.serializationLock
      ? { serializationLock: countConstraints.serializationLock }
      : {}),
    sql: {
      values,
      text: `WITH source_rows AS MATERIALIZED (
  SELECT ${relationColumn} AS old_target${postgresConstraintProjection(constraints.sourceProjection)} FROM ${sourceTable} WHERE ${sourceWhere} FOR UPDATE
), target_rows AS MATERIALIZED (
  SELECT 1 AS endpoint${postgresConstraintProjection(constraints.targetProjection)}${postgresConstraintProjection(countConstraints.targetProjection)} FROM ${targetTable} WHERE ${targetWhere} FOR SHARE
), state AS (
  SELECT (SELECT COUNT(*)::int FROM source_rows) AS source_count,
         (SELECT COUNT(*)::int FROM target_rows) AS target_count,
         (SELECT old_target FROM source_rows LIMIT 1) AS old_target${postgresConstraintProjection(constraints.stateProjection)}${postgresConstraintProjection(countConstraints.stateProjection)}
), guarded_state AS (
  SELECT *, ${expectedCondition} AS precondition_matched,
         COALESCE(${constraints.rejectionExpression}, ${countConstraints.rejectionExpression}) AS constraint_rejection
  FROM state
), updated AS (
  UPDATE ${sourceTable} SET ${relationColumn} = ${nextPlaceholder}
  WHERE ${sourceWhere}
    AND (SELECT source_count = 1 AND ${requiredTargetCount} AND precondition_matched
                AND constraint_rejection IS NULL FROM guarded_state)
  RETURNING 1
)
SELECT source_count, target_count, old_target, precondition_matched, constraint_rejection,
       (SELECT COUNT(*)::int FROM updated) AS updated_count
FROM guarded_state`,
    },
  };
};

export const materializePostgresRelationshipDelta = (
  command: RelationshipCommand,
  compiled: CompiledPostgresRelationshipCommand,
  row: PostgresRelationshipCommandRow,
):
  | { delta: RelationshipDelta }
  | { cardinalityMismatch: true }
  | { preconditionFailed: true }
  | { constraintRejected: RelationConstraintRejection } => {
  if (row.source_count !== 1 || (command.action === 'link' && row.target_count !== 1)) {
    return { cardinalityMismatch: true };
  }
  if (command.precondition && !row.precondition_matched) return { preconditionFailed: true };
  if (row.constraint_rejection) {
    return { constraintRejected: row.constraint_rejection };
  }
  if (row.updated_count !== 1) return { delta: { added: [], removed: [] } };
  const field = compiled.sourceMapping.entity.fields[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field)) {
    throw new Error('PostgreSQL Relationship Command field is no longer a Reference Field.');
  }
  const previous =
    row.old_target == null ? undefined : liftEntityReferenceValue(field, row.old_target);
  const fact = (target: NonNullable<RelationshipCommand['target']>) => ({
    relation: command.relation,
    source: command.source,
    target,
  });
  return {
    delta: {
      added:
        command.action === 'link' &&
        command.target &&
        (!previous || row.old_target !== lowerEntityReferenceValue(field, command.target))
          ? [fact(command.target)]
          : [],
      removed:
        previous &&
        (command.action === 'unlink' ||
          !command.target ||
          row.old_target !== lowerEntityReferenceValue(field, command.target))
          ? [fact(previous)]
          : [],
    },
  };
};
