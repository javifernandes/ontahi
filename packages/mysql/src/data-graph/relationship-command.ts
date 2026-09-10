import {
  appliedRelationshipCommand,
  notAppliedRelationshipCommand,
  isReferenceFieldDefinition,
  liftEntityReferenceValue,
  lowerEntityReferenceValue,
  resolveDirectRelationConstraints,
  resolveDirectRelationCountConstraints,
  type RelationshipCommand,
  type RelationshipFact,
  type RelationshipCommandResult,
} from '@ontahi/core/data-graph';
import type { RowDataPacket } from 'mysql2/promise';

import { executeMysql } from './client.js';
import { invalidMysqlCommand as invalid } from './mutation-contract.js';
import type { MysqlRelationshipContext } from './relationship-context.js';
import { MysqlDataGraphError } from './runtime-error.js';
import { quoteMysqlIdentifier as quote } from './sql.js';

const enforceCountConstraints = async (
  context: MysqlRelationshipContext,
  command: RelationshipCommand,
  source: ReturnType<MysqlRelationshipContext['mappingFor']>,
  target: ReturnType<MysqlRelationshipContext['mappingFor']>,
  targetRow: Record<string, unknown>,
  column: string,
  nextValue: unknown,
) => {
  const countRules = resolveDirectRelationCountConstraints(
    command.relation,
    source.entity,
    target.entity,
  );
  if (countRules.length) {
    const [counts] = await executeMysql<RowDataPacket[]>(
      context.client,
      `SELECT COUNT(*) AS count FROM ${quote(source.table)} WHERE ${quote(column)} = ?`,
      [nextValue],
    );
    for (const rule of countRules) {
      const limit = targetRow[rule.fieldName];
      if (typeof limit !== 'number')
        return invalid('MySQL Relation count limit must be a stored number.');
      if (Number(counts[0]!.count) + 1 > limit)
        throw new MysqlDataGraphError(
          rule.rejection.message,
          'relation_constraint_rejected',
          undefined,
          rule.rejection,
        );
    }
  }
};

const resolveDirectRelation = (context: MysqlRelationshipContext, command: RelationshipCommand) => {
  const source = context.mappingFor(command.relation.sourceEntityName);
  const target = context.mappingFor(command.relation.targetEntityName);
  const field = source.entity.fields[command.relation.fieldName];
  const column = source.columns[command.relation.fieldName];
  if (!field || !isReferenceFieldDefinition(field) || field.target !== target.entity || !column)
    return invalid('MySQL Relationship Command requires a mapped Reference Field.');
  context.assertRef(source, command.source);
  if (command.target) context.assertRef(target, command.target);
  if (command.precondition) context.assertRef(target, command.precondition.currentTarget);
  return { source, target, field, column };
};

export const executeMysqlRelationshipCommand = async (
  context: MysqlRelationshipContext,
  command: RelationshipCommand,
): Promise<RelationshipCommandResult> => {
  const { source, target, field, column } = resolveDirectRelation(context, command);
  const row = await context.one(source, command.source);
  const currentValue = row[command.relation.fieldName];
  const currentTarget =
    currentValue == null
      ? undefined
      : (liftEntityReferenceValue(field, currentValue) as RelationshipFact['target']);
  const fact = (ref: RelationshipFact['target']): RelationshipFact => ({
    relation: command.relation,
    source: command.source,
    target: ref,
  });
  if (command.action === 'unlink') {
    if (!field.nullable && !field.optional)
      return invalid('A required MySQL Relation cannot be cleared.');
    if (
      !currentTarget ||
      (command.target && currentValue !== lowerEntityReferenceValue(field, command.target))
    )
      return appliedRelationshipCommand({ added: [], removed: [] });
    await context.update(source, row, column, null);
    return appliedRelationshipCommand({ added: [], removed: [fact(currentTarget)] });
  }
  if (!command.target) return invalid('MySQL link requires a target Ref.');
  if (
    command.precondition &&
    currentValue !== lowerEntityReferenceValue(field, command.precondition.currentTarget)
  ) {
    if (command.precondition.onMismatch === 'skip') return notAppliedRelationshipCommand(command);
    throw new MysqlDataGraphError(
      'Current Relation target did not match the precondition.',
      'relationship_precondition_failed',
    );
  }
  // Serialize competing additions at their common destination. The subsequent count is a new
  // READ COMMITTED statement, after any wait for this endpoint lock has completed.
  const targetRow = await context.one(target, command.target);
  await context.constraints(
    resolveDirectRelationConstraints(command.relation, source.entity, target.entity),
    { source: [row], target: [targetRow] },
  );
  const nextValue = lowerEntityReferenceValue(field, command.target);
  if (currentValue === nextValue) return appliedRelationshipCommand({ added: [], removed: [] });
  await enforceCountConstraints(context, command, source, target, targetRow, column, nextValue);
  await context.update(source, row, column, nextValue);
  return appliedRelationshipCommand({
    added: [fact(command.target)],
    removed: currentTarget ? [fact(currentTarget)] : [],
  });
};
