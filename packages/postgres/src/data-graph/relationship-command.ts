import {
  isReferenceFieldDefinition,
  liftEntityReferenceValue,
  lowerEntityReferenceValue,
  selectionReferences,
  type RelationshipCommand,
  type RelationshipDelta,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';
import { compilePostgresSelection, quotePostgresIdentifier } from './sql.js';

export type PostgresRelationshipCommandRow = {
  source_count: number;
  target_count: number;
  updated_count: number;
  old_target: unknown;
};

export type CompiledPostgresRelationshipCommand = {
  sql: { text: string; values: unknown[] };
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
  const constrained = [source.entity, target.entity].some(declaringEntity =>
    Object.entries(declaringEntity.relations).some(([relationName, relation]) => {
      const canonicalMatch =
        (relation.relationKind === 'belongsTo' &&
          declaringEntity.name === command.relation.sourceEntityName &&
          relation.target.name === command.relation.targetEntityName &&
          (relation.sourceField ?? relationName) === command.relation.fieldName) ||
        (relation.relationKind === 'hasMany' &&
          declaringEntity.name === command.relation.targetEntityName &&
          relation.target.name === command.relation.sourceEntityName &&
          relation.targetField === command.relation.fieldName);
      return canonicalMatch && (relation.constraints?.length ?? 0) > 0;
    }),
  );
  if (constrained) {
    throw new Error(
      'PostgreSQL direct Relationship Commands do not yet compile Relation constraints.',
    );
  }
  return field;
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

  return {
    sourceMapping,
    targetMapping,
    sql: {
      values,
      text: `WITH source_rows AS MATERIALIZED (
  SELECT ${relationColumn} AS old_target FROM ${sourceTable} WHERE ${sourceWhere} FOR UPDATE
), target_rows AS MATERIALIZED (
  SELECT 1 FROM ${targetTable} WHERE ${targetWhere}
), state AS (
  SELECT (SELECT COUNT(*)::int FROM source_rows) AS source_count,
         (SELECT COUNT(*)::int FROM target_rows) AS target_count,
         (SELECT old_target FROM source_rows LIMIT 1) AS old_target
), updated AS (
  UPDATE ${sourceTable} SET ${relationColumn} = ${nextPlaceholder}
  WHERE ${sourceWhere}
    AND (SELECT source_count = 1 AND ${requiredTargetCount} AND ${expectedCondition} FROM state)
  RETURNING 1
)
SELECT source_count, target_count, old_target,
       (SELECT COUNT(*)::int FROM updated) AS updated_count
FROM state`,
    },
  };
};

export const materializePostgresRelationshipDelta = (
  command: RelationshipCommand,
  compiled: CompiledPostgresRelationshipCommand,
  row: PostgresRelationshipCommandRow,
): { delta: RelationshipDelta } | { cardinalityMismatch: true } | { preconditionFailed: true } => {
  if (row.source_count !== 1 || (command.action === 'link' && row.target_count !== 1)) {
    return { cardinalityMismatch: true };
  }
  if (command.precondition && row.updated_count !== 1) return { preconditionFailed: true };
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
