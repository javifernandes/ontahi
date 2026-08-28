import {
  getEntityMapping,
  type AnyEntityDefinition,
  type ModelExpression,
  type ModelExpressionProgram,
} from '@ontahi/core/data-graph';

import type { PostgresEntityMapping } from './mapping.js';

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

const compileRelationCount = (
  entity: AnyEntityDefinition,
  relationName: string,
  rootMapping: PostgresEntityMapping,
) => {
  const relation = entity.relations[relationName];
  const mapping = relation?.mapping;
  if (!relation || !mapping) {
    throw new Error(
      `Derived Field Relation aggregate ${entity.name}.${relationName} requires mapping metadata.`,
    );
  }

  if (mapping.type === 'many-to-many') {
    if (mapping.fromTable !== rootMapping.table) {
      throw new Error(
        `Derived Field Relation aggregate ${entity.name}.${relationName} is not oriented from ${rootMapping.table}.`,
      );
    }
    const alias = `__ontahi_${relationName}_edges`;
    return (
      `(SELECT COUNT(*)::int FROM ${quote(mapping.throughTable)} AS ${quote(alias)}` +
      ` WHERE ${quote(alias)}.${quote(mapping.throughFromColumn)}` +
      ` = ${quote(rootMapping.table)}.${quote(mapping.fromColumn)})`
    );
  }

  const rootIsFrom = mapping.fromTable === rootMapping.table;
  const rootIsTo = mapping.toTable === rootMapping.table;
  if (!rootIsFrom && !rootIsTo) {
    throw new Error(
      `Derived Field Relation aggregate ${entity.name}.${relationName} does not include ${rootMapping.table}.`,
    );
  }
  const targetTable = rootIsFrom ? mapping.toTable : mapping.fromTable;
  const targetColumn = rootIsFrom ? mapping.toColumn : mapping.fromColumn;
  const rootColumn = rootIsFrom ? mapping.fromColumn : mapping.toColumn;
  const alias = `__ontahi_${relationName}_rows`;
  return (
    `(SELECT COUNT(*)::int FROM ${quote(targetTable)} AS ${quote(alias)}` +
    ` WHERE ${quote(alias)}.${quote(targetColumn)}` +
    ` = ${quote(rootMapping.table)}.${quote(rootColumn)})`
  );
};

const compileExpression = (
  expression: ModelExpression,
  entity: AnyEntityDefinition,
  mapping: PostgresEntityMapping,
): string => {
  switch (expression.kind) {
    case 'field': {
      const column = mapping.columns[expression.field];
      if (!column) {
        throw new Error(
          `Derived Field dependency ${entity.name}.${expression.field} is not mapped.`,
        );
      }
      return `${quote(mapping.table)}.${quote(column)}`;
    }
    case 'relation-aggregate':
      return compileRelationCount(entity, expression.relation, mapping);
    case 'arithmetic':
      return `(${compileExpression(expression.left, entity, mapping)} - ${compileExpression(expression.right, entity, mapping)})`;
    case 'compare':
      return `(${compileExpression(expression.left, entity, mapping)} <= ${compileExpression(expression.right, entity, mapping)})`;
    case 'not':
      return `(NOT ${compileExpression(expression.operand, entity, mapping)})`;
    case 'input-ref':
    case 'ref-identity':
      throw new Error(`Derived Fields cannot compile ${expression.kind} expressions.`);
  }
};

export const compilePostgresDerivedField = (
  entity: AnyEntityDefinition,
  mapping: PostgresEntityMapping,
  program: ModelExpressionProgram,
) => {
  const semanticMapping = getEntityMapping(entity);
  if (semanticMapping.tableName !== mapping.table) {
    throw new Error(`PostgreSQL mapping does not match derived Field Entity ${entity.name}.`);
  }
  return compileExpression(program.expression, entity, mapping);
};
