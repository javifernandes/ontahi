import ts from 'typescript';

import { unwrapExpression } from './typescript-ast.mjs';

export const isLazyValue = expression =>
  ts.isCallExpression(expression) &&
  ts.isPropertyAccessExpression(expression.expression) &&
  expression.expression.getText() === 'graphSchema.lazy';

// Only declarative, zero-argument Value factories are portable. Never execute a host closure.
export const readLazyValue = expression => {
  const [name, factory] = expression.arguments;
  const body = factory && ts.isArrowFunction(factory) && unwrapExpression(factory.body);
  if (
    expression.arguments.length !== 2 ||
    !name ||
    !ts.isStringLiteral(name) ||
    !factory ||
    !ts.isArrowFunction(factory) ||
    factory.parameters.length ||
    factory.modifiers?.length ||
    !body ||
    !ts.isCallExpression(body) ||
    !ts.isIdentifier(body.expression) ||
    body.expression.text !== 'value' ||
    !body.arguments[0] ||
    !ts.isStringLiteral(body.arguments[0]) ||
    body.arguments[0].text !== name.text
  )
    throw new Error(
      'Opaque graphSchema.lazy factory: portable factories must be zero-argument expressions returning a Value with the same literal name.',
    );
  return { name: name.text, body };
};
