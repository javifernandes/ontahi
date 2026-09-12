import ts from 'typescript';

import { isOntahiEntityDeclarationCall } from './entity-discovery.mjs';
import {
  projectEntitySchemaConfig,
  resolveProjectionValueNode,
} from './entity-schema-projection.mjs';
import { readObjectLiteralProperty, unwrapExpression } from './typescript-ast.mjs';

// Extract only static schema data. Never evaluate variant declarations or copy resolver closures.
const referenceVariant = (node, context) => {
  const resolved = resolveProjectionValueNode(node, context);
  const call = resolved.expression;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression))
    return undefined;
  if (call.expression.name.text === 'resolveWith')
    return referenceVariant(call.expression.expression, resolved.context);
  if (
    !['existingRef', 'ref'].includes(call.expression.name.text) ||
    !ts.isIdentifier(call.expression.expression) ||
    call.expression.expression.text !== 'graphSchema' ||
    !call.arguments[0]
  )
    return undefined;
  return projectEntityVariant(
    call.arguments[0],
    resolved.context,
    call.expression.name.text === 'ref',
    true,
  );
};

/** Read only the variant contract; do not recursively project its base's contextual declarations. */
export const projectEntityVariant = (node, context, portableRef = false, validateBase = false) => {
  const target = resolveProjectionValueNode(node, context);
  const variant = target.expression;
  if (
    !ts.isCallExpression(variant) ||
    !ts.isPropertyAccessExpression(variant.expression) ||
    variant.expression.name.text !== 'variant'
  )
    return undefined;
  if (portableRef)
    throw new Error('Variant inputs require graphSchema.existingRef, not graphSchema.ref.');
  const [name, options] = variant.arguments;
  const config = options && resolveProjectionValueNode(options, target.context).expression;
  const discriminatorNode =
    config &&
    ts.isObjectLiteralExpression(config) &&
    readObjectLiteralProperty(config, 'discriminator');
  const discriminator =
    discriminatorNode &&
    resolveProjectionValueNode(discriminatorNode.initializer, target.context).expression;
  const property =
    discriminator && ts.isObjectLiteralExpression(discriminator) && discriminator.properties[0];
  if (
    !name ||
    !ts.isStringLiteral(name) ||
    !discriminator ||
    !ts.isObjectLiteralExpression(discriminator) ||
    discriminator.properties.length !== 1 ||
    !property ||
    !ts.isPropertyAssignment(property) ||
    !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ||
    !ts.isStringLiteral(property.initializer)
  )
    throw new Error('Variant inputs require a literal name and one literal enum discriminator.');
  const base = resolveProjectionValueNode(variant.expression.expression, target.context);
  if (
    !ts.isCallExpression(base.expression) ||
    !isOntahiEntityDeclarationCall(base.expression.expression) ||
    !base.expression.arguments[0] ||
    !ts.isObjectLiteralExpression(base.expression.arguments[0])
  )
    throw new Error('Variant input base must resolve to an entity({ name, fields }) declaration.');
  const baseName = readObjectLiteralProperty(base.expression.arguments[0], 'name')?.initializer;
  if (!baseName || !ts.isStringLiteral(baseName))
    throw new Error('Variant input base schema could not be projected safely.');
  if (validateBase) {
    const projection = projectEntitySchemaConfig(base.expression.arguments[0], base.context);
    if (!projection?.name || projection.diagnostics?.length)
      throw new Error('Variant input base schema could not be projected safely.');
  }
  return {
    kind: 'entity-variant',
    name: name.text,
    baseEntityName: baseName.text,
    discriminator: {
      fieldName: property.name.text,
      value: property.initializer.text,
    },
  };
};

export const projectVariantInputs = (node, context) => {
  const expression = unwrapExpression(node);
  const sourceText = expression.getText();
  const edits = [];
  const variants = [];
  const visit = current => {
    if (ts.isPropertyAssignment(current)) {
      visit(current.initializer);
      return;
    }
    const descriptor = referenceVariant(current, context);
    if (descriptor) {
      const placeholder = `__ontahi_variant_input_${variants.length}__`;
      variants.push({ placeholder, descriptor });
      edits.push({
        from: current.getStart() - expression.getStart(),
        to: current.end - expression.getStart(),
        text: `graphSchema.existingRef(${placeholder})`,
      });
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(expression);
  return {
    variants,
    schemaText: edits
      .sort((a, b) => b.from - a.from)
      .reduce(
        (text, edit) => text.slice(0, edit.from) + edit.text + text.slice(edit.to),
        sourceText,
      ),
  };
};

export const renderVariantInputs = (text, variants, projectedNames) => {
  if (!text || !variants?.length) return text;
  const replacements = new Map(
    variants.map(({ placeholder, descriptor }) => {
      const base = projectedNames.get(descriptor.baseEntityName);
      if (!base)
        throw new Error(
          `Variant ${descriptor.name} requires base Entity ${descriptor.baseEntityName} in the generated graph.`,
        );
      const discriminator = {
        [descriptor.discriminator.fieldName]: descriptor.discriminator.value,
      };
      return [
        placeholder,
        `${base}.variant(${JSON.stringify(descriptor.name)}, { discriminator: ${JSON.stringify(discriminator)} })`,
      ];
    }),
  );
  const prefix = 'const input = ';
  const source = ts.createSourceFile(
    'variant-input.ts',
    prefix + text,
    ts.ScriptTarget.Latest,
    true,
  );
  const edits = [];
  const visit = node => {
    if (
      ts.isIdentifier(node) &&
      replacements.has(node.text) &&
      ts.isCallExpression(node.parent) &&
      node.parent.arguments[0] === node
    ) {
      edits.push({
        from: node.getStart() - prefix.length,
        to: node.end - prefix.length,
        text: replacements.get(node.text),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edits
    .sort((a, b) => b.from - a.from)
    .reduce((result, edit) => result.slice(0, edit.from) + edit.text + result.slice(edit.to), text);
};
