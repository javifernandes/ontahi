import type { SyntaxNode, Tree } from '@lezer/common';

import type { SelectionLanguageRange, SelectionExpressionSyntax } from '../model/contracts.js';

export const completionTokenNames = new Set([
  'Identifier',
  'StringLiteral',
  'NumberLiteral',
  'True',
  'False',
  'Null',
  'All',
  'None',
]);

export const clampDocumentPosition = (document: string, position: number) =>
  Math.max(0, Math.min(document.length, position));

export const unclosedStringStartAt = (document: string, position: number) => {
  let start: number | undefined;
  let escaped = false;
  for (let index = 0; index < position; index += 1) {
    const character = document[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      start = start === undefined ? index : undefined;
    }
  }
  return start;
};

export const completionRangeFromTree = (
  document: string,
  tree: Tree,
  position: number,
  includeOpeningQuote = false,
): SelectionLanguageRange => {
  let node: SyntaxNode | null = tree.resolveInner(position, -1);
  while (node && !completionTokenNames.has(node.name)) node = node.parent;
  if (!node || node.from > position || node.to < position) {
    const unclosedStringStart = includeOpeningQuote
      ? unclosedStringStartAt(document, position)
      : undefined;
    if (unclosedStringStart !== undefined) {
      return { from: unclosedStringStart, to: position };
    }
    return includeOpeningQuote && position > 0 && document[position - 1] === '"'
      ? { from: position - 1, to: position }
      : { from: position, to: position };
  }

  let from = node.from;
  if (includeOpeningQuote && node.name === 'Identifier' && from > 0 && document[from - 1] === '"') {
    from -= 1;
  }
  return { from, to: node.to };
};

export const ancestorNamed = (
  node: SyntaxNode | null,
  names: readonly string[],
): SyntaxNode | undefined => {
  for (let candidate = node; candidate; candidate = candidate.parent) {
    if (names.includes(candidate.name)) return candidate;
  }
  return undefined;
};

export const expressionChildren = (
  expression: SelectionExpressionSyntax,
): readonly SelectionExpressionSyntax[] => {
  switch (expression.kind) {
    case 'and':
    case 'or':
      return expression.operands;
    case 'not':
      return expression.operand ? [expression.operand] : [];
    case 'parenthesized':
      return expression.expression ? [expression.expression] : [];
    default:
      return [];
  }
};

export const expressionAtPosition = (
  expression: SelectionExpressionSyntax | undefined,
  position: number,
): SelectionExpressionSyntax | undefined => {
  if (!expression || position < expression.from || position > expression.to) return undefined;

  for (const child of expressionChildren(expression)) {
    const nested = expressionAtPosition(child, position);
    if (nested) return nested;
  }
  return expression;
};
