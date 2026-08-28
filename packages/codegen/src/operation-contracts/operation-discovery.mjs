import ts from 'typescript';

const isAtomicOperationReceiver = expression =>
  (ts.isIdentifier(expression) &&
    ['defineDomainOperation', 'operation'].includes(expression.text)) ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'operation' &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'app');

const isDomainOperationDefineCall = expression =>
  (ts.isIdentifier(expression) && expression.text === 'defineDomainOperation') ||
  (ts.isIdentifier(expression) && expression.text === 'operation') ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'define' &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'operation' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'app') ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'atomic' &&
    isAtomicOperationReceiver(expression.expression));

export const resolveOperationInitializer = (initializer, declarations, visited = new Set()) => {
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    return resolveOperationInitializer(initializer.expression, declarations, visited);
  }

  if (ts.isCallExpression(initializer) && isDomainOperationDefineCall(initializer.expression)) {
    return initializer;
  }

  const resolveIdentifier = identifier => {
    if (visited.has(identifier.text)) {
      return undefined;
    }
    const declaration = declarations.get(identifier.text);
    if (!declaration?.initializer) {
      return undefined;
    }
    visited.add(identifier.text);
    return resolveOperationInitializer(declaration.initializer, declarations, visited);
  };

  if (ts.isIdentifier(initializer)) {
    return resolveIdentifier(initializer);
  }

  if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return resolveIdentifier(initializer.expression);
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (!ts.isBlock(initializer.body)) {
      return resolveOperationInitializer(initializer.body, declarations, visited);
    }
    const returned = initializer.body.statements.find(statement => ts.isReturnStatement(statement));
    return returned?.expression
      ? resolveOperationInitializer(returned.expression, declarations, visited)
      : undefined;
  }

  return undefined;
};

export const resolveOperationCollectionInitializer = (
  initializer,
  declarations,
  visited = new Set(),
) => {
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    return resolveOperationCollectionInitializer(initializer.expression, declarations, visited);
  }

  if (ts.isObjectLiteralExpression(initializer)) {
    return initializer;
  }

  const resolveIdentifier = identifier => {
    if (visited.has(identifier.text)) {
      return undefined;
    }
    const declaration = declarations.get(identifier.text);
    if (!declaration?.initializer) {
      return undefined;
    }
    visited.add(identifier.text);
    return resolveOperationCollectionInitializer(declaration.initializer, declarations, visited);
  };

  if (ts.isIdentifier(initializer)) {
    return resolveIdentifier(initializer);
  }

  if (
    ts.isCallExpression(initializer) &&
    ts.isIdentifier(initializer.expression) &&
    initializer.expression.text === 'operationGroup'
  ) {
    const factory = initializer.arguments[1];
    return factory
      ? resolveOperationCollectionInitializer(factory, declarations, visited)
      : undefined;
  }

  if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return resolveIdentifier(initializer.expression);
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (!ts.isBlock(initializer.body)) {
      return resolveOperationCollectionInitializer(initializer.body, declarations, visited);
    }
    const returned = initializer.body.statements.find(statement => ts.isReturnStatement(statement));
    return returned?.expression
      ? resolveOperationCollectionInitializer(returned.expression, declarations, visited)
      : undefined;
  }

  return undefined;
};
