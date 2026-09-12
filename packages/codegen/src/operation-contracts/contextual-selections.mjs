import ts from 'typescript';

import { unwrapExpression } from './typescript-ast.mjs';

// Compile a deliberately small authoring grammar to data; never emit a server closure.
export const projectContextualSelections = node => {
  try {
    const callback = unwrapExpression(node);
    const parameter = callback.parameters?.[0]?.name;
    if (
      !ts.isArrowFunction(callback) ||
      callback.parameters.length !== 1 ||
      !parameter ||
      !ts.isObjectBindingPattern(parameter) ||
      parameter.elements.length !== 1
    )
      throw new Error('expected ({ self }) => ({ ... })');
    const binding = parameter.elements[0];
    if (
      !ts.isIdentifier(binding.name) ||
      binding.dotDotDotToken ||
      binding.initializer ||
      (binding.propertyName?.getText() ?? binding.name.text) !== 'self'
    )
      throw new Error('expected a self binding');
    const body = unwrapExpression(callback.body);
    if (!ts.isObjectLiteralExpression(body)) throw new Error('expected a returned object literal');
    const literal = node => {
      const value = unwrapExpression(node);
      if (ts.isStringLiteral(value)) return value.text;
      if (ts.isNumericLiteral(value)) return Number(value.text);
      if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (value.kind === ts.SyntaxKind.NullKeyword) return null;
      if (
        ts.isPrefixUnaryExpression(value) &&
        value.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(value.operand)
      )
        return -Number(value.operand.text);
      throw new Error('filters require portable literal values');
    };
    const predicate = node => {
      const callback = unwrapExpression(node);
      const param = callback.parameters?.[0]?.name;
      if (
        !ts.isArrowFunction(callback) ||
        callback.parameters.length !== 1 ||
        !param ||
        !ts.isIdentifier(param)
      )
        throw new Error('expected a field predicate callback');
      const call = unwrapExpression(callback.body);
      const operator = call.expression;
      if (
        !ts.isCallExpression(call) ||
        call.arguments.length !== 1 ||
        !ts.isPropertyAccessExpression(operator) ||
        !['eq', 'lt', 'lte', 'gt', 'gte'].includes(operator.name.text)
      )
        throw new Error('unsupported predicate');
      const field = operator.expression;
      if (
        !ts.isPropertyAccessExpression(field) ||
        !ts.isIdentifier(field.expression) ||
        field.expression.text !== param.text
      )
        throw new Error('expected a target field');
      return {
        kind: 'predicate',
        fieldName: field.name.text,
        operator: operator.name.text,
        value: literal(call.arguments[0]),
      };
    };
    const templates = Object.fromEntries(
      body.properties.map(property => {
        if (
          !ts.isPropertyAssignment(property) ||
          !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        )
          throw new Error('expected named Selection properties');
        let relation = unwrapExpression(property.initializer);
        let expression = { kind: 'all' };
        if (ts.isCallExpression(relation)) {
          if (
            !ts.isPropertyAccessExpression(relation.expression) ||
            relation.expression.name.text !== 'where' ||
            relation.arguments.length !== 1
          )
            throw new Error('expected self.relation.where(predicate)');
          expression = predicate(relation.arguments[0]);
          relation = relation.expression.expression;
        }
        if (
          !ts.isPropertyAccessExpression(relation) ||
          !ts.isIdentifier(relation.expression) ||
          relation.expression.text !== binding.name.text
        )
          throw new Error('expected self.relation');
        return [property.name.text, { relationName: relation.name.text, expression }];
      }),
    );
    return { contextualSelectionsText: JSON.stringify(templates) };
  } catch (error) {
    return {
      diagnostics: [
        `Contextual Selections must compile to portable relation templates: ${error.message}.`,
      ],
    };
  }
};
