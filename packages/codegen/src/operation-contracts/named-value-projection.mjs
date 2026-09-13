import ts from 'typescript';

import { resolveEntityDeclaration } from './entity-discovery.mjs';
import { resolveProjectionValueNode } from './entity-schema-projection.mjs';
import { readStringLiteralObjectProperty, unwrapExpression } from './typescript-ast.mjs';
import { projectEntityVariant } from './variant-inputs.mjs';

const isValue = node =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'value';

const rewriteChildren = (node, replacements) =>
  replacements
    .toSorted(([left], [right]) => right.getStart() - left.getStart())
    .reduce((text, [child, replacement]) => {
      const from = child.getStart() - node.getStart();
      return text.slice(0, from) + replacement + text.slice(child.end - node.getStart());
    }, node.getText());

const renderObject = (expression, render) =>
  rewriteChildren(
    expression,
    expression.properties.map(property => {
      if (
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      )
        return [property.initializer, render(property.initializer)];
      if (ts.isShorthandPropertyAssignment(property))
        return [property, `${property.name.text}: ${render(property.name)}`];
      if (ts.isSpreadAssignment(property))
        return [property.expression, render(property.expression)];
      throw new Error('Schema objects require static properties.');
    }),
  );

const isPortableLiteral = expression =>
  ts.isStringLiteral(expression) ||
  ts.isNumericLiteral(expression) ||
  ts.isRegularExpressionLiteral(expression) ||
  [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
    expression.kind,
  ) ||
  (ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand));

const renderCoreCall = (expression, context, render, variants) => {
  const callee = expression.expression;
  const method = callee.name.text;
  if (['refine', 'transform', 'lazy', 'custom'].includes(method))
    throw new Error(
      `Opaque schema constructor "${callee.getText()}" cannot be projected to the browser.`,
    );
  if (['ref', 'existingRef'].includes(method) && expression.arguments[0]) {
    const descriptor = projectEntityVariant(
      expression.arguments[0],
      context,
      method === 'ref',
      true,
    );
    if (descriptor) {
      const placeholder = `__ontahi_variant_input_${variants.length}__`;
      variants.push({ placeholder, descriptor });
      return `graphSchema.existingRef(${placeholder})`;
    }
  }
  return rewriteChildren(
    expression,
    expression.arguments.map(argument => [argument, render(argument)]),
  );
};

const renderCall = (expression, context, render, { variants, entityReference }) => {
  const callee = expression.expression;
  const owner = ts.isPropertyAccessExpression(callee) ? callee.expression : undefined;
  const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
  if (method === 'resolveWith') return render(owner);
  if (owner && ts.isIdentifier(owner) && ['field', 'graphSchema'].includes(owner.text))
    return renderCoreCall(expression, context, render, variants);
  const entity = owner && entityReference(owner, context);
  if (entity && ['view', 'one', 'many'].includes(method))
    return rewriteChildren(expression, [
      [owner, entity],
      ...expression.arguments.map(argument => [argument, render(argument)]),
    ]);
  throw new Error(`Opaque schema call "${callee.getText()}" cannot be projected to the browser.`);
};

const renderIdentifier = (expression, context, state, active) => {
  if (expression.text === 'undefined') return 'undefined';
  const entity = state.entityReference(expression, context);
  if (entity) return entity;
  const resolved = resolveProjectionValueNode(expression, context);
  if (resolved.expression === expression || ts.isIdentifier(resolved.expression))
    throw new Error(`Unresolved schema dependency "${expression.text}".`);
  return renderExpression(resolved.expression, resolved.context, state, active);
};

const renderExpression = (node, context, state, active = new Set()) => {
  const expression = unwrapExpression(node);
  if (active.has(expression))
    throw new Error('Cyclic schema helper dependencies are not supported.');
  const next = new Set(active).add(expression);
  const render = child => renderExpression(child, context, state, next);
  if (ts.isIdentifier(expression)) return renderIdentifier(expression, context, state, next);
  if (isValue(expression)) return state.valueReference(expression, context);
  if (ts.isPropertyAccessExpression(expression)) {
    if (expression.name.text !== 'fields')
      throw new Error(`Unsupported schema access "${expression.getText()}".`);
    return `${render(expression.expression)}.fields`;
  }
  if (ts.isCallExpression(expression)) return renderCall(expression, context, render, state);
  if (ts.isObjectLiteralExpression(expression)) return renderObject(expression, render);
  if (ts.isArrayLiteralExpression(expression))
    return rewriteChildren(
      expression,
      expression.elements.map(element => [element, render(element)]),
    );
  if (isPortableLiteral(expression)) return expression.getText();
  throw new Error(`Non-portable schema expression "${expression.getText()}".`);
};

// Close schema dependencies as data, never by copying arbitrary host declarations or closures.
export const createNamedValueProjector = ({ entityName } = {}) => {
  const definitions = [];
  const projected = new Map();
  const visiting = new Set();

  const project = ({ node, context, fallbackDeclaration }) => {
    if (!node) return undefined;
    const resolved = resolveProjectionValueNode(node, context);
    const expression = resolved.expression;
    if (!isValue(expression)) return undefined;
    if (visiting.has(expression))
      throw new Error('Cyclic Value schema dependencies are not supported.');
    if (projected.has(expression)) return projected.get(expression);
    const name = expression.arguments[0];
    if (!name || !ts.isStringLiteral(name)) throw new Error('Values require a literal model name.');
    const declaration = [...(resolved.context?.declarations.values() ?? [])].find(
      candidate => candidate.initializer && unwrapExpression(candidate.initializer) === expression,
    );
    const definition = {
      kind: 'value',
      name: name.text,
      declaration: declaration?.name.getText() ?? fallbackDeclaration,
      sourcePath: resolved.context?.sourcePath,
    };
    visiting.add(expression);
    const references = [];
    const variants = [];
    const reference = (name, kind = 'value') => {
      const placeholder = `__ontahi_schema_reference_${references.length}__`;
      references.push({ placeholder, name, kind });
      return placeholder;
    };
    const entityReference = (node, context) => {
      if (ts.isIdentifier(node) && node.text === 'self' && entityName)
        return reference(entityName, 'entity');
      const resolved = resolveProjectionValueNode(node, context);
      // The declaration-only analyzer also supports separately supplied, schema-only imports.
      if (
        ts.isIdentifier(resolved.expression) &&
        resolved.expression.text.endsWith('Entity') &&
        context?.importMap.has(resolved.expression.text)
      )
        return reference(resolved.expression.text, 'entity');
      const declaration = resolveEntityDeclaration(
        resolved.expression,
        resolved.context?.declarations ?? new Map(),
      );
      const config = declaration?.initializer.arguments[0];
      const name =
        config && ts.isObjectLiteralExpression(config)
          ? readStringLiteralObjectProperty(config, 'name')
          : undefined;
      return name ? reference(name, 'entity') : undefined;
    };
    const state = {
      variants,
      entityReference,
      valueReference: (expression, context) => {
        const dependency = project({
          node: expression,
          context,
          fallbackDeclaration: `${definition.declaration}.${expression.getStart()}`,
        });
        return reference(dependency.name);
      },
    };
    definition.schemaText = rewriteChildren(
      expression,
      expression.arguments
        .slice(1)
        .map(argument => [argument, renderExpression(argument, resolved.context, state)]),
    );
    definition.references = references;
    if (variants.length) definition.variantInputs = variants;
    visiting.delete(expression);
    projected.set(expression, definition);
    definitions.push(definition);
    return definition;
  };
  return { project, definitions };
};
