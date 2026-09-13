import ts from 'typescript';

import { resolveProjectionValueNode } from './entity-schema-projection.mjs';

// Walk schema data, never function bodies, Entity implementations or resolver closures.
export const collectSchemaProcessing = (
  node,
  context,
  visited = new Set(),
  processing = new Set(),
) => {
  if (!node) return [...processing];
  const resolved = resolveProjectionValueNode(node, context);
  const expression = resolved.expression;
  if (visited.has(expression)) return [...processing];
  visited.add(expression);
  const visit = child => collectSchemaProcessing(child, resolved.context, visited, processing);
  if (ts.isCallExpression(expression)) {
    const callee = expression.expression;
    const core =
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      ['graphSchema', 'field'].includes(callee.expression.text);
    const named = ts.isIdentifier(callee) && callee.text === 'value';
    if (!core && !named) return [...processing];
    if (core && ['transform', 'refine'].includes(callee.name.text)) {
      processing.add(callee.name.text === 'refine' ? 'refinement' : 'transform');
      visit(expression.arguments[0]);
    } else for (const argument of expression.arguments) visit(argument);
  } else if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) visit(property.initializer);
      if (ts.isShorthandPropertyAssignment(property)) visit(property.name);
      if (ts.isSpreadAssignment(property)) visit(property.expression);
    }
  } else if (ts.isArrayLiteralExpression(expression)) {
    for (const element of expression.elements) visit(element);
  } else if (ts.isPropertyAccessExpression(expression)) visit(expression.expression);
  return [...processing];
};
