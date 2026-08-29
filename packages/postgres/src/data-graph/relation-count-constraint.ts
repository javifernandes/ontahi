import {
  resolveDirectRelationCountConstraints,
  selectionReferences,
  type AnyEntityRef,
  type RelationshipCommand,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';
import { compilePostgresSelection, quotePostgresIdentifier } from './sql.js';

export type CompiledPostgresRelationCountConstraints = {
  targetProjection: readonly string[];
  stateProjection: readonly string[];
  rejectionExpression: string;
  serializationLock?: { text: string; values: unknown[] };
};

export const resolvePostgresRelationCountConstraints = (
  command: RelationshipCommand,
  sourceMapping: PostgresEntityMapping,
  targetMapping: PostgresEntityMapping,
) => {
  if (command.action !== 'link') return [];
  try {
    return resolveDirectRelationCountConstraints(
      command.relation,
      sourceMapping.entity,
      targetMapping.entity,
    );
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : 'Cannot resolve Relation count constraints.';
    throw new Error(
      `PostgreSQL Relationship Command ${message.charAt(0).toLowerCase()}${message.slice(1)}`,
    );
  }
};

export const requiresPostgresRelationshipCommandSerialization = (
  command: RelationshipCommand,
  sourceMapping: PostgresEntityMapping,
  targetMapping: PostgresEntityMapping,
) => resolvePostgresRelationCountConstraints(command, sourceMapping, targetMapping).length > 0;

const compileSerializationLock = (target: AnyEntityRef, targetMapping: PostgresEntityMapping) => {
  const values: unknown[] = [];
  const where = compilePostgresSelection(selectionReferences([target]), targetMapping, values);
  return {
    text: `SELECT 1 FROM ${quotePostgresIdentifier(targetMapping.table)} WHERE ${where} FOR UPDATE`,
    values,
  };
};

export const compilePostgresRelationCountConstraints = (input: {
  command: RelationshipCommand;
  sourceMapping: PostgresEntityMapping;
  targetMapping: PostgresEntityMapping;
  relationColumn: string;
  nextPlaceholder: string;
  values: unknown[];
}): CompiledPostgresRelationCountConstraints => {
  const constraints = resolvePostgresRelationCountConstraints(
    input.command,
    input.sourceMapping,
    input.targetMapping,
  );
  const targetProjection = constraints.map((constraint, index) => {
    const column = input.targetMapping.columns[constraint.fieldName];
    if (!column) {
      throw new Error(
        `PostgreSQL Relation count constraint Field ${constraint.entity.name}.${constraint.fieldName} is not mapped.`,
      );
    }
    return `${quotePostgresIdentifier(column)} AS ${quotePostgresIdentifier(
      `ontahi_relation_count_limit_${index}`,
    )}`;
  });
  const stateProjection = constraints.map(
    (_constraint, index) =>
      `(SELECT ${quotePostgresIdentifier(
        `ontahi_relation_count_limit_${index}`,
      )} FROM target_rows LIMIT 1) AS ${quotePostgresIdentifier(
        `ontahi_relation_count_limit_${index}`,
      )}`,
  );
  const currentCount = `(SELECT COUNT(*)::int FROM ${quotePostgresIdentifier(
    input.sourceMapping.table,
  )} AS relation_members WHERE relation_members.${input.relationColumn} IS NOT DISTINCT FROM ${
    input.nextPlaceholder
  })`;
  const rejections = constraints.map((constraint, index) => {
    input.values.push(constraint.rejection);
    return {
      condition: `COALESCE(${currentCount} + 1 <= ${quotePostgresIdentifier(
        `ontahi_relation_count_limit_${index}`,
      )}, FALSE)`,
      placeholder: `$${input.values.length}::jsonb`,
    };
  });

  return {
    targetProjection,
    stateProjection,
    rejectionExpression:
      rejections.length === 0
        ? 'NULL::jsonb'
        : `CASE WHEN old_target IS NOT DISTINCT FROM ${input.nextPlaceholder} THEN NULL::jsonb ${rejections
            .map(rejection => `WHEN NOT ${rejection.condition} THEN ${rejection.placeholder}`)
            .join(' ')} ELSE NULL::jsonb END`,
    ...(constraints.length > 0 && input.command.target
      ? { serializationLock: compileSerializationLock(input.command.target, input.targetMapping) }
      : {}),
  };
};
