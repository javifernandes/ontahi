import ts from 'typescript';

import {
  containsVariantReference,
  resolveProjectionValueNode,
} from './entity-schema-projection.mjs';

const inputFields = expression => {
  if (!ts.isCallExpression(expression)) return undefined;
  const callee = expression.expression;
  if (ts.isIdentifier(callee) && callee.text === 'value') return expression.arguments[1];
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'graphSchema' &&
    callee.name.text === 'object'
  )
    return expression.arguments[0];
  return undefined;
};

const unwrapOptionalReference = (node, context) => {
  const resolved = resolveProjectionValueNode(node, context);
  const expression = resolved.expression;
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'graphSchema' &&
    ['optional', 'nullable'].includes(expression.expression.name.text) &&
    expression.arguments[0]
  )
    return unwrapOptionalReference(expression.arguments[0], resolved.context);
  return resolved;
};

/** Mirror the receiver's participant positions before collecting any browser projection. */
export const assertVariantInputPositions = (node, context, referenceVariant) => {
  const root = resolveProjectionValueNode(node, context);
  const fieldsNode = inputFields(root.expression);
  const fields = fieldsNode && resolveProjectionValueNode(fieldsNode, root.context);
  if (!fields || !ts.isObjectLiteralExpression(fields.expression))
    throw new Error(
      'Variant existingRef inputs require direct top-level fields of an Operation object or Value input.',
    );
  for (const field of fields.expression.properties) {
    if (!containsVariantReference(field, fields.context)) continue;
    const resolved = unwrapOptionalReference(
      ts.isPropertyAssignment(field) ? field.initializer : field,
      fields.context,
    );
    if (!referenceVariant(resolved.expression, resolved.context))
      throw new Error(
        `Operation input field "${field.name?.getText() ?? 'unknown'}" nests a variant existingRef; only direct top-level fields with optional/nullable wrappers are supported.`,
      );
  }
};
