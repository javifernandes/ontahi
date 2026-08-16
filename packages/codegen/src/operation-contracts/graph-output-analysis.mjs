import ts from 'typescript';

import { resolveImportedSchemaContext } from './source-resolution.mjs';
import { readObjectLiteralProperty } from './typescript-ast.mjs';

export const toClientGraphOutputText = text =>
  text.replace(/\bapp\.graph\.output\b/g, 'graphOutput');

const isAppGraphOutputExpression = expression =>
  ts.isPropertyAccessExpression(expression) &&
  expression.name.text === 'output' &&
  ts.isPropertyAccessExpression(expression.expression) &&
  expression.expression.name.text === 'graph' &&
  ts.isIdentifier(expression.expression.expression) &&
  expression.expression.expression.text === 'app';

const isGraphOutputExpression = expression =>
  (ts.isIdentifier(expression) && expression.text === 'graphOutput') ||
  isAppGraphOutputExpression(expression);

const isGraphOutputCall = (expression, name) =>
  ts.isPropertyAccessExpression(expression) &&
  expression.name.text === name &&
  isGraphOutputExpression(expression.expression);

export const isGraphOutputSchemaCall = expression => isGraphOutputCall(expression, 'schema');

const graphSchemaHelperNames = new Map([
  ['graphObject', 'object'],
  ['graphArray', 'array'],
  ['graphNullable', 'nullable'],
  ['graphOptional', 'optional'],
  ['graphLiteral', 'literal'],
  ['graphUnion', 'union'],
  ['graphDiscriminatedUnion', 'discriminatedUnion'],
  ['graphRecord', 'record'],
  ['graphDefault', 'default'],
  ['graphTransform', 'transform'],
  ['graphRefine', 'refine'],
  ['graphLazy', 'lazy'],
  ['graphNamed', 'named'],
  ['graphSelection', 'selection'],
  ['describeGraphSchema', 'describe'],
  ['presentGraphSchema', 'present'],
]);

const graphSchemaCallName = expression => {
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'graphSchema'
  ) {
    return expression.name.text;
  }

  return ts.isIdentifier(expression) ? graphSchemaHelperNames.get(expression.text) : undefined;
};

const isGraphSchemaCall = (expression, name) => graphSchemaCallName(expression) === name;

const isValueDefinitionCall = expression =>
  (ts.isIdentifier(expression) && (expression.text === 'value' || expression.text === 'valueOf')) ||
  isGraphSchemaCall(expression, 'value') ||
  isGraphSchemaCall(expression, 'valueOf');

const renderGraphOutputObject = fieldEntries => {
  if (fieldEntries.length === 0) return undefined;

  const fieldsText = `{ ${fieldEntries
    .map(([fieldName, descriptor]) => `${fieldName}: ${descriptor.text}`)
    .join(', ')} }`;

  return {
    kind: 'object',
    fieldEntries,
    fieldsText,
    text: `graphOutput.object(${fieldsText})`,
  };
};

const deriveGraphOutputFromUnion = (optionsArg, context, visited) => {
  if (!optionsArg || !ts.isArrayLiteralExpression(optionsArg)) return undefined;

  const mergedFields = new Map();
  const conflictingFields = new Set();

  for (const option of optionsArg.elements) {
    const descriptor = deriveGraphOutputFromSchemaNode(option, context, visited);
    if (descriptor?.kind !== 'object') continue;

    for (const [fieldName, fieldDescriptor] of descriptor.fieldEntries) {
      if (conflictingFields.has(fieldName)) continue;

      const currentDescriptor = mergedFields.get(fieldName);
      if (!currentDescriptor || currentDescriptor.text === fieldDescriptor.text) {
        mergedFields.set(fieldName, fieldDescriptor);
      } else {
        mergedFields.delete(fieldName);
        conflictingFields.add(fieldName);
      }
    }
  }

  return renderGraphOutputObject([...mergedFields]);
};

const readLazySchemaBody = callback => {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return undefined;
  }
  if (!ts.isBlock(callback.body)) return callback.body;

  return callback.body.statements.find(ts.isReturnStatement)?.expression;
};

const deriveGraphOutputFromObjectLiteral = (objectLiteral, context, visited) => {
  const fieldEntries = [];

  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const descriptor = deriveGraphOutputFromSchemaNode(property.initializer, context, visited);
    if (descriptor) fieldEntries.push([property.name.getText(), descriptor]);
  }

  return renderGraphOutputObject(fieldEntries);
};

const deriveGraphOutputFromIdentifier = (identifier, context, visited) => {
  const visitKey = `${context.sourcePath ?? context.sourceFile.fileName}:${identifier.text}`;
  if (visited.has(visitKey)) return undefined;

  const declaration = context.declarations.get(identifier.text);
  if (declaration?.initializer) {
    visited.add(visitKey);
    const descriptor = deriveGraphOutputFromSchemaNode(declaration.initializer, context, visited);
    visited.delete(visitKey);
    return descriptor;
  }

  const importedContext = resolveImportedSchemaContext(identifier.text, context);
  const importedDeclaration = importedContext?.declarations.get(identifier.text);
  if (!importedDeclaration?.initializer) return undefined;

  visited.add(visitKey);
  const descriptor = deriveGraphOutputFromSchemaNode(
    importedDeclaration.initializer,
    importedContext,
    visited,
  );
  visited.delete(visitKey);
  return descriptor;
};

export const deriveGraphOutputFromSchemaNode = (node, context, visited = new Set()) => {
  if (!node) return undefined;

  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return deriveGraphOutputFromSchemaNode(node.expression, context, visited);
  }
  if (ts.isIdentifier(node)) return deriveGraphOutputFromIdentifier(node, context, visited);
  if (!ts.isCallExpression(node)) return undefined;

  const expression = node.expression;
  if (isValueDefinitionCall(expression)) {
    const [, fieldsArg] = node.arguments;
    return fieldsArg && ts.isObjectLiteralExpression(fieldsArg)
      ? deriveGraphOutputFromObjectLiteral(fieldsArg, context, visited)
      : undefined;
  }
  if (isGraphSchemaCall(expression, 'object')) {
    const [fieldsArg] = node.arguments;
    return fieldsArg && ts.isObjectLiteralExpression(fieldsArg)
      ? deriveGraphOutputFromObjectLiteral(fieldsArg, context, visited)
      : undefined;
  }
  if (isGraphSchemaCall(expression, 'array')) {
    const item = deriveGraphOutputFromSchemaNode(node.arguments[0], context, visited);
    return item ? { kind: 'array', text: `graphOutput.array(${item.text})` } : undefined;
  }
  if (isGraphSchemaCall(expression, 'nullable') || isGraphSchemaCall(expression, 'optional')) {
    const item = deriveGraphOutputFromSchemaNode(node.arguments[0], context, visited);
    return item
      ? { kind: expression.name.text, text: `graphOutput.${expression.name.text}(${item.text})` }
      : undefined;
  }
  if (
    isGraphSchemaCall(expression, 'default') ||
    isGraphSchemaCall(expression, 'transform') ||
    isGraphSchemaCall(expression, 'refine') ||
    isGraphSchemaCall(expression, 'describe') ||
    isGraphSchemaCall(expression, 'present')
  ) {
    return deriveGraphOutputFromSchemaNode(node.arguments[0], context, visited);
  }
  if (isGraphSchemaCall(expression, 'named')) {
    return deriveGraphOutputFromSchemaNode(node.arguments[1], context, visited);
  }
  if (isGraphSchemaCall(expression, 'lazy')) {
    return deriveGraphOutputFromSchemaNode(readLazySchemaBody(node.arguments[1]), context, visited);
  }
  if (isGraphSchemaCall(expression, 'union')) {
    return deriveGraphOutputFromUnion(node.arguments[0], context, visited);
  }
  if (isGraphSchemaCall(expression, 'discriminatedUnion')) {
    return deriveGraphOutputFromUnion(node.arguments[1], context, visited);
  }
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'view') {
    const entityArg = expression.expression;
    const configArg = node.arguments[1];
    const fieldsProperty =
      configArg && ts.isObjectLiteralExpression(configArg)
        ? readObjectLiteralProperty(configArg, 'fields')
        : undefined;
    const fieldsDescriptor =
      fieldsProperty && ts.isObjectLiteralExpression(fieldsProperty.initializer)
        ? deriveGraphOutputFromObjectLiteral(fieldsProperty.initializer, context, visited)
        : undefined;
    const fieldsText = fieldsDescriptor?.kind === 'object' ? `, ${fieldsDescriptor.fieldsText}` : '';
    return { kind: 'entity', text: `graphOutput.entity(${entityArg.getText()}${fieldsText})` };
  }
  if (isGraphOutputCall(expression, 'entity')) {
    const [entityArg, schemaOrFieldsArg] = node.arguments;
    if (!entityArg) return undefined;
    const nestedDescriptor = schemaOrFieldsArg
      ? deriveGraphOutputFromSchemaNode(schemaOrFieldsArg, context, visited)
      : undefined;
    const fieldsText =
      nestedDescriptor?.kind === 'object' ? `, ${nestedDescriptor.fieldsText}` : '';
    return { kind: 'entity', text: `graphOutput.entity(${entityArg.getText()}${fieldsText})` };
  }
  if (isGraphOutputSchemaCall(expression)) {
    const descriptorArg = node.arguments[1];
    return descriptorArg
      ? { kind: 'descriptor', text: toClientGraphOutputText(descriptorArg.getText()) }
      : undefined;
  }

  return undefined;
};
