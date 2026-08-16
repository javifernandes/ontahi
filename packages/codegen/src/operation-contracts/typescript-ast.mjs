import ts from 'typescript';

export const readObjectLiteralProperty = (objectLiteral, propertyName) =>
  objectLiteral.properties.find(
    item =>
      ts.isPropertyAssignment(item) &&
      ts.isIdentifier(item.name) &&
      item.name.text === propertyName,
  );

export const readStringLiteralObjectProperty = (objectLiteral, propertyName) => {
  const property = readObjectLiteralProperty(objectLiteral, propertyName);

  return property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
};

export const unwrapExpression = node => {
  if (
    node &&
    (ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node))
  ) {
    return unwrapExpression(node.expression);
  }

  return node;
};
