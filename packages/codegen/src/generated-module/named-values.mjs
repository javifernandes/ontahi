import ts from 'typescript';

import { renderVariantInputs } from '../operation-contracts/variant-inputs.mjs';

const replaceReferences = (text, references, names, entities) => {
  const replacements = new Map(
    (references ?? []).map(reference => {
      const localName = (reference.kind === 'entity' ? entities : names).get(reference.name);
      if (!localName)
        throw new Error(`Missing ${reference.kind} schema dependency "${reference.name}".`);
      return [reference.placeholder, localName];
    }),
  );
  const prefix = 'const schema = ';
  const source = ts.createSourceFile('schema.ts', prefix + text, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = node => {
    if (
      ts.isIdentifier(node) &&
      replacements.has(node.text) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    )
      edits.push({
        from: node.getStart() - prefix.length,
        to: node.end - prefix.length,
        text: replacements.get(node.text),
      });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edits
    .toSorted((a, b) => b.from - a.from)
    .reduce((result, edit) => result.slice(0, edit.from) + edit.text + result.slice(edit.to), text);
};

export const renderNamedValues = (definitions, names, entities, replaceEntityNames) => {
  const byName = new Map(definitions.map(definition => [definition.name, definition]));
  const visited = new Set();
  const visiting = new Set();
  const declarations = [];
  const emit = definition => {
    if (visited.has(definition.name)) return;
    if (visiting.has(definition.name))
      throw new Error(`Cyclic Value schema dependency "${definition.name}".`);
    visiting.add(definition.name);
    for (const reference of definition.references ?? []) {
      if (reference.kind !== 'value') continue;
      const dependency = byName.get(reference.name);
      if (!dependency) throw new Error(`Missing Value schema dependency "${reference.name}".`);
      emit(dependency);
    }
    const text = replaceReferences(definition.schemaText, definition.references, names, entities);
    declarations.push(
      `const ${names.get(definition.name)} = ${renderVariantInputs(
        definition.references ? text : replaceEntityNames(text, entities),
        definition.variantInputs,
        entities,
      )};`,
    );
    visiting.delete(definition.name);
    visited.add(definition.name);
  };
  for (const definition of definitions) emit(definition);
  return declarations;
};

export const renderSchemaProjection = (projection, names, entities) =>
  renderVariantInputs(
    replaceReferences(projection.schemaText, projection.references, names, entities),
    projection.variantInputs,
    entities,
  );
