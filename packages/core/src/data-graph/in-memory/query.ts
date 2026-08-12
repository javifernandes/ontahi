import { lowerEntityReferenceSelection } from '../reference-field.js';
import {
  lowerSelectionReferences,
  selectionAnd,
  type SelectionExpression,
  type SelectionPredicate,
} from '../selection-ast.js';

type OrderSpec = {
  kind: 'order';
  fieldName: string;
  direction: 'asc' | 'desc';
};

const comparePredicateValues = (left: unknown, right: unknown) => {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right));
};

const matchesSelectionPredicate = (
  row: Record<string, unknown>,
  predicate: SelectionPredicate,
): boolean => {
  if (predicate.operator === 'eq') {
    return row[predicate.fieldName] === predicate.value;
  }

  if (predicate.operator === 'in') {
    return predicate.values.includes(row[predicate.fieldName]);
  }

  if (predicate.operator === 'lte') {
    const rowValue = row[predicate.fieldName];
    return rowValue != null && comparePredicateValues(rowValue, predicate.value) <= 0;
  }

  if (predicate.operator === 'lt') {
    const rowValue = row[predicate.fieldName];
    return rowValue != null && comparePredicateValues(rowValue, predicate.value) < 0;
  }

  if (predicate.operator === 'gte') {
    const rowValue = row[predicate.fieldName];
    return rowValue != null && comparePredicateValues(rowValue, predicate.value) >= 0;
  }

  if (predicate.operator === 'gt') {
    const rowValue = row[predicate.fieldName];
    return rowValue != null && comparePredicateValues(rowValue, predicate.value) > 0;
  }

  return row[predicate.fieldName] == null;
};

export const matchesSelectionExpression = (
  row: Record<string, unknown>,
  expression: SelectionExpression,
): boolean => {
  if (expression.kind === 'references') {
    return matchesSelectionExpression(row, lowerSelectionReferences(expression));
  }

  if (expression.kind === 'predicate') {
    return matchesSelectionPredicate(row, expression);
  }

  if (expression.kind === 'all') {
    return true;
  }

  if (expression.kind === 'none') {
    return false;
  }

  if (expression.kind === 'and') {
    return expression.operands.every(operand => matchesSelectionExpression(row, operand));
  }

  if (expression.kind === 'or') {
    return expression.operands.some(operand => matchesSelectionExpression(row, operand));
  }

  return !matchesSelectionExpression(row, expression.operand);
};

export const applySelectionExpression = (
  rows: ReadonlyArray<Record<string, unknown>>,
  expression: SelectionExpression,
) => rows.filter(row => matchesSelectionExpression(row, expression));

export const applyEntitySelectionExpression = (
  entity: import('../definitions.js').AnyEntityDefinition,
  rows: ReadonlyArray<Record<string, unknown>>,
  expression: SelectionExpression,
) => applySelectionExpression(rows, lowerEntityReferenceSelection(entity, expression));

export const applyPredicates = (
  rows: ReadonlyArray<Record<string, unknown>>,
  predicates: readonly SelectionPredicate[],
) => applySelectionExpression(rows, selectionAnd(...predicates));

export const applyOrder = (
  rows: ReadonlyArray<Record<string, unknown>>,
  orderBy: readonly OrderSpec[],
) => {
  if (orderBy.length === 0) {
    return [...rows];
  }

  return [...rows].sort((left, right) => {
    for (const order of orderBy) {
      const leftValue = left[order.fieldName];
      const rightValue = right[order.fieldName];

      if (leftValue === rightValue) {
        continue;
      }

      const comparison =
        leftValue == null ? -1 : rightValue == null ? 1 : leftValue < rightValue ? -1 : 1;

      return order.direction === 'asc' ? comparison : comparison * -1;
    }

    return 0;
  });
};
