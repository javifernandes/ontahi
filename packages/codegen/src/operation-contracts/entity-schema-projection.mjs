import ts from 'typescript';

import { compileModelExpressionCallback } from '../model-expression/compiler.mjs';

import { isOntahiEntityDeclarationCall } from './entity-discovery.mjs';
import { resolveImportedSchemaContext } from './source-resolution.mjs';
import {
  readObjectLiteralProperty,
  readStringLiteralObjectProperty,
  unwrapExpression,
} from './typescript-ast.mjs';

const resolveProjectionValueText = (node, context, visited = new Set()) => {
  const expression = unwrapExpression(node);
  if (!ts.isIdentifier(expression)) return expression.getText();

  const visitKey = `${context?.sourcePath ?? context?.sourceFile.fileName}:${expression.text}`;
  if (!context || visited.has(visitKey)) return expression.getText();

  visited.add(visitKey);
  const declaration = context.declarations.get(expression.text);
  if (declaration?.initializer) {
    return resolveProjectionValueText(declaration.initializer, context, visited);
  }

  const importedContext = resolveImportedSchemaContext(expression.text, context);
  return importedContext
    ? resolveProjectionValueText(expression, importedContext, visited)
    : expression.getText();
};

const resolveProjectionValueNode = (node, context, visited = new Set()) => {
  const expression = unwrapExpression(node);
  if (!ts.isIdentifier(expression)) return { expression, context };

  const visitKey = `${context?.sourcePath ?? context?.sourceFile.fileName}:${expression.text}`;
  if (!context || visited.has(visitKey)) return { expression, context };

  visited.add(visitKey);
  const declaration = context.declarations.get(expression.text);
  if (declaration?.initializer) {
    return resolveProjectionValueNode(declaration.initializer, context, visited);
  }

  const importedContext = resolveImportedSchemaContext(expression.text, context);
  return importedContext
    ? resolveProjectionValueNode(expression, importedContext, visited)
    : { expression, context };
};

const unwrapReferenceFieldCall = node => {
  const expression = unwrapExpression(node);
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    !ts.isIdentifier(expression.expression.expression) ||
    expression.expression.expression.text !== 'field'
  ) {
    return undefined;
  }

  if (expression.expression.name.text === 'ref') return expression;

  return (expression.expression.name.text === 'nullable' ||
    expression.expression.name.text === 'optional') &&
    expression.arguments[0]
    ? unwrapReferenceFieldCall(expression.arguments[0])
    : undefined;
};

const projectReferenceFields = (fieldsNode, context) => {
  const resolved = resolveProjectionValueNode(fieldsNode, context);
  if (!resolved.expression || !ts.isObjectLiteralExpression(resolved.expression)) return [];

  return resolved.expression.properties.flatMap(property => {
    if (!ts.isPropertyAssignment(property)) return [];
    const referenceCall = unwrapReferenceFieldCall(property.initializer);
    const targetArg = referenceCall?.arguments[0];
    if (!targetArg || !ts.isIdentifier(targetArg)) return [];

    return [
      {
        name: property.name.getText().replaceAll(/^['"]|['"]$/g, ''),
        targetName: targetArg.text,
        ...(resolved.context?.importMap.get(targetArg.text)
          ? { targetImportPath: resolved.context.importMap.get(targetArg.text) }
          : {}),
      },
    ];
  });
};

const fieldCallName = node => {
  const expression = unwrapExpression(node);
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    !ts.isIdentifier(expression.expression.expression) ||
    expression.expression.expression.text !== 'field'
  ) {
    return undefined;
  }
  return expression.expression.name.text;
};

const modelFieldSemantic = node => {
  const expression = unwrapExpression(node);
  const callName = fieldCallName(expression);
  if (['number', 'integer', 'nonNegativeInteger', 'positiveInteger'].includes(callName)) {
    return 'number';
  }
  if (callName === 'boolean') return 'boolean';
  if (
    ts.isCallExpression(expression) &&
    ['nullable', 'optional', 'derived'].includes(callName) &&
    expression.arguments[0]
  ) {
    return modelFieldSemantic(expression.arguments[0]);
  }
  return 'field';
};

const propertyName = property =>
  ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
    ? property.name.text
    : undefined;

const formatModelExpressionDiagnostic = diagnostic =>
  `${diagnostic.source.path}:${diagnostic.source.line}:${diagnostic.source.column} [${diagnostic.code}] ${diagnostic.message}`;

const projectDerivedFields = (fieldsNode, context, relations) => {
  const resolved = resolveProjectionValueNode(fieldsNode, context);
  if (!resolved.expression || !ts.isObjectLiteralExpression(resolved.expression)) {
    return {
      fieldsText: resolveProjectionValueText(fieldsNode, context),
      derivedFields: [],
      diagnostics: [],
    };
  }

  const symbols = Object.fromEntries([
    ...resolved.expression.properties.flatMap(property => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = propertyName(property);
      return name
        ? [
            [
              name,
              { kind: 'field', field: name, semantic: modelFieldSemantic(property.initializer) },
            ],
          ]
        : [];
    }),
    ...relations
      .filter(relation => relation.kind === 'hasMany' || relation.kind === 'manyToMany')
      .map(relation => [relation.name, { kind: 'relation', relation: relation.name }]),
  ]);
  const diagnostics = [];
  const derivedFields = [];
  const properties = resolved.expression.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) return property.getText();
    const expression = unwrapExpression(property.initializer);
    if (fieldCallName(expression) !== 'derived' || !ts.isCallExpression(expression)) {
      return property.getText();
    }
    const name = propertyName(property);
    const [baseField, callback] = expression.arguments;
    if (!name || !baseField || !callback) return property.getText();
    const compiled = compileModelExpressionCallback(callback, {
      sourceFile: resolved.context.sourceFile,
      sourcePath: resolved.context.sourcePath,
      symbols,
    });
    diagnostics.push(...compiled.diagnostics.map(formatModelExpressionDiagnostic));
    if (!compiled.program) return property.getText();
    derivedFields.push({ name, expression: compiled.program });
    return `${property.name.getText()}: field.derived(${baseField.getText()}, ${JSON.stringify(compiled.program)})`;
  });

  if (derivedFields.length === 0 && diagnostics.length === 0) {
    return {
      fieldsText: resolveProjectionValueText(fieldsNode, context),
      derivedFields,
      diagnostics,
    };
  }

  return {
    fieldsText: `{ ${properties.join(', ')} }`,
    derivedFields,
    diagnostics,
  };
};

export const projectEntitySchemaConfig = (configArg, context) => {
  const propertyText = name => {
    const property = readObjectLiteralProperty(configArg, name);
    return property && ts.isPropertyAssignment(property)
      ? resolveProjectionValueText(property.initializer, context)
      : undefined;
  };
  const name = readStringLiteralObjectProperty(configArg, 'name');
  const fieldsProperty = readObjectLiteralProperty(configArg, 'fields');
  const fieldsText = propertyText('fields');

  if (!name || !fieldsText) return undefined;

  const referenceFields =
    fieldsProperty && ts.isPropertyAssignment(fieldsProperty)
      ? projectReferenceFields(fieldsProperty.initializer, context)
      : [];

  const relationsProperty = readObjectLiteralProperty(configArg, 'relations');
  const relations =
    relationsProperty &&
    ts.isPropertyAssignment(relationsProperty) &&
    ts.isObjectLiteralExpression(relationsProperty.initializer)
      ? relationsProperty.initializer.properties.flatMap(property => {
          if (
            !ts.isPropertyAssignment(property) ||
            !ts.isIdentifier(property.name) ||
            !ts.isCallExpression(property.initializer) ||
            !ts.isPropertyAccessExpression(property.initializer.expression) ||
            !ts.isIdentifier(property.initializer.expression.expression) ||
            property.initializer.expression.expression.text !== 'relation'
          ) {
            return [];
          }
          const relationKind = property.initializer.expression.name.text;
          const [targetArg, optionsArg] = property.initializer.arguments;
          const nominalTarget =
            targetArg &&
            ts.isCallExpression(targetArg) &&
            ts.isPropertyAccessExpression(targetArg.expression) &&
            ts.isIdentifier(targetArg.expression.expression) &&
            targetArg.expression.expression.text === 'entity' &&
            targetArg.expression.name.text === 'ref' &&
            targetArg.arguments[0] &&
            ts.isStringLiteral(targetArg.arguments[0])
              ? targetArg.arguments[0].text
              : undefined;
          if (
            (relationKind !== 'hasMany' &&
              relationKind !== 'belongsTo' &&
              relationKind !== 'manyToMany') ||
            !targetArg ||
            (!ts.isIdentifier(targetArg) && !nominalTarget)
          ) {
            return [];
          }
          const targetName = nominalTarget ?? targetArg.text;
          const via =
            optionsArg && ts.isObjectLiteralExpression(optionsArg)
              ? readStringLiteralObjectProperty(optionsArg, 'via')
              : undefined;
          return [
            {
              name: property.name.text,
              kind: relationKind,
              targetName,
              ...(nominalTarget ? { deferred: true } : {}),
              ...(context?.importMap.get(targetName)
                ? { targetImportPath: context.importMap.get(targetName) }
                : {}),
              ...(via ? { via } : {}),
            },
          ];
        })
      : [];

  const derivedProjection =
    fieldsProperty && ts.isPropertyAssignment(fieldsProperty)
      ? projectDerivedFields(fieldsProperty.initializer, context, relations)
      : { fieldsText, derivedFields: [], diagnostics: [] };

  return {
    name,
    fieldsText: derivedProjection.fieldsText,
    ...(propertyText('display') ? { displayText: propertyText('display') } : {}),
    ...(propertyText('freshness') ? { freshnessText: propertyText('freshness') } : {}),
    ...(propertyText('locators') ? { locatorsText: propertyText('locators') } : {}),
    ...(propertyText('identity') ? { identityText: propertyText('identity') } : {}),
    ...(referenceFields.length > 0 ? { referenceFields } : {}),
    ...(relations.length > 0 ? { relations } : {}),
    ...(derivedProjection.derivedFields.length > 0
      ? { derivedFields: derivedProjection.derivedFields }
      : {}),
    ...(derivedProjection.diagnostics.length > 0
      ? { diagnostics: derivedProjection.diagnostics }
      : {}),
  };
};

export const resolveEntitySchemaProjection = (identifierName, context, visited = new Set()) => {
  const visitKey = `${context.sourcePath ?? context.sourceFile.fileName}:${identifierName}`;
  if (!identifierName || visited.has(visitKey)) return undefined;

  visited.add(visitKey);
  const declaration = context.declarations.get(identifierName);
  if (declaration?.initializer) {
    const initializer = unwrapExpression(declaration.initializer);
    if (ts.isCallExpression(initializer) && isOntahiEntityDeclarationCall(initializer.expression)) {
      const [configArg] = initializer.arguments;
      return configArg && ts.isObjectLiteralExpression(configArg)
        ? projectEntitySchemaConfig(configArg, context)
        : undefined;
    }
  }

  const importedContext = resolveImportedSchemaContext(identifierName, context);
  return importedContext
    ? resolveEntitySchemaProjection(identifierName, importedContext, visited)
    : undefined;
};
