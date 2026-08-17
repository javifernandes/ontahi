import ts from 'typescript';

import { collectConstDeclarations } from './source-resolution.mjs';
import { readStringLiteralObjectProperty } from './typescript-ast.mjs';

const resolveEntityName = entityArg => {
  if (!entityArg) return undefined;
  if (ts.isStringLiteral(entityArg)) return entityArg.text;

  if (ts.isIdentifier(entityArg)) {
    return entityArg.text.endsWith('Entity')
      ? entityArg.text.slice(0, -'Entity'.length)
      : entityArg.text;
  }

  return undefined;
};

const resolveEntityDefinitionIdentifier = entityArg =>
  entityArg && ts.isIdentifier(entityArg) && entityArg.text.endsWith('Entity')
    ? entityArg.text
    : undefined;

const isGraphEntityDefineCall = expression =>
  (ts.isIdentifier(expression) && expression.text === 'defineGraphEntity') ||
  (ts.isPropertyAccessExpression(expression) &&
    (expression.name.text === 'defineEntity' || expression.name.text === 'defineGraphEntity') &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'graph' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'app');

export const isOntahiEntityDeclarationCall = expression =>
  ts.isIdentifier(expression) && expression.text === 'entity';

const isOntahiEntityModuleCall = expression =>
  ts.isIdentifier(expression) &&
  (expression.text === 'entityModule' ||
    expression.text === 'entityModuleWithCapabilities' ||
    expression.text === 'relationModule' ||
    expression.text === 'relationModuleWithCapabilities');

const isGraphRelationDefineCall = expression =>
  (ts.isIdentifier(expression) && expression.text === 'defineGraphRelation') ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'defineRelation' &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'graph' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'app');

const toPascalCase = value =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');

const inferRelationSourceName = (entityName, relationName) => {
  const relationSuffix = toPascalCase(relationName ?? '');

  return relationSuffix &&
    entityName?.endsWith(relationSuffix) &&
    entityName.length > relationSuffix.length
    ? entityName.slice(0, -relationSuffix.length)
    : undefined;
};

export const resolveEntityDeclaration = (initializer, declarations, visited = new Set()) => {
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    return resolveEntityDeclaration(initializer.expression, declarations, visited);
  }

  if (
    ts.isCallExpression(initializer) &&
    (isGraphEntityDefineCall(initializer.expression) ||
      isGraphRelationDefineCall(initializer.expression) ||
      isOntahiEntityDeclarationCall(initializer.expression))
  ) {
    return { initializer, declarations };
  }

  if (ts.isCallExpression(initializer) && isOntahiEntityModuleCall(initializer.expression)) {
    const config = initializer.arguments[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return undefined;

    const bindProperty = config.properties.find(
      property =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'bind',
    );
    return bindProperty && ts.isPropertyAssignment(bindProperty)
      ? resolveEntityDeclaration(bindProperty.initializer, declarations, visited)
      : undefined;
  }

  if (
    ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    initializer.expression.name.text === 'registerBoundEntity'
  ) {
    const boundEntity = initializer.arguments[1];
    return boundEntity ? resolveEntityDeclaration(boundEntity, declarations, visited) : undefined;
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (!ts.isBlock(initializer.body)) {
      return resolveEntityDeclaration(initializer.body, declarations, visited);
    }

    const scopedDeclarations = new Map([
      ...declarations,
      ...collectConstDeclarations(initializer.body),
    ]);
    const returned = initializer.body.statements.find(ts.isReturnStatement);
    return returned?.expression
      ? resolveEntityDeclaration(returned.expression, scopedDeclarations, visited)
      : undefined;
  }

  if (ts.isIdentifier(initializer)) {
    if (visited.has(initializer.text)) return undefined;

    const declaration = declarations.get(initializer.text);
    if (!declaration?.initializer) return undefined;

    visited.add(initializer.text);
    return resolveEntityDeclaration(declaration.initializer, declarations, visited);
  }

  if (
    ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    ts.isIdentifier(initializer.expression.expression) &&
    initializer.expression.expression.text === 'Object' &&
    initializer.expression.name.text === 'assign'
  ) {
    const [target] = initializer.arguments;
    return target ? resolveEntityDeclaration(target, declarations, visited) : undefined;
  }

  return undefined;
};

export const describeEntityDeclaration = (entityExportName, initializer) => {
  if (isOntahiEntityDeclarationCall(initializer.expression)) {
    const [configArg] = initializer.arguments;

    if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
      return {
        diagnostics: [`${entityExportName} must call entity({ name, fields, operations }).`],
      };
    }

    const entityName = readStringLiteralObjectProperty(configArg, 'name');
    if (!entityName) {
      return { diagnostics: [`${entityExportName}.name must be a string literal.`] };
    }

    return {
      entityName,
      entityDefinitionName: entityExportName,
      entityDefinitionLocalName: `${entityExportName}Schema`,
      configArg,
      unifiedDeclaration: true,
    };
  }

  if (isGraphRelationDefineCall(initializer.expression)) {
    const [sourceArg, relationNameArg, configArg] = initializer.arguments;

    if (!sourceArg || !relationNameArg || !configArg || !ts.isObjectLiteralExpression(configArg)) {
      return {
        diagnostics: [
          `${entityExportName} must call defineRelation(source, relationName, { ... }).`,
        ],
      };
    }

    const relationName = ts.isStringLiteral(relationNameArg) ? relationNameArg.text : undefined;
    const explicitEntityName = readStringLiteralObjectProperty(configArg, 'entityName');
    const sourceName =
      inferRelationSourceName(explicitEntityName, relationName) ?? resolveEntityName(sourceArg);

    if (!explicitEntityName && (!sourceName || !relationName)) {
      return {
        diagnostics: [
          `${entityExportName} relation arguments must use an Entity identifier and string literal relation name, or declare entityName as a string literal.`,
        ],
      };
    }

    return {
      entityName: explicitEntityName ?? `${sourceName}${toPascalCase(relationName)}`,
      relation: { sourceName, relationName },
      configArg,
    };
  }

  const [entityArg, configArg] = initializer.arguments;
  if (!entityArg || !configArg || !ts.isObjectLiteralExpression(configArg)) {
    return { diagnostics: [`${entityExportName} must call defineGraphEntity(entity, { ... }).`] };
  }

  const entityName = resolveEntityName(entityArg);
  if (!entityName) {
    return {
      diagnostics: [
        `${entityExportName} entity argument must be a string literal or an Entity identifier.`,
      ],
    };
  }

  return {
    entityName,
    entityDefinitionName: resolveEntityDefinitionIdentifier(entityArg),
    configArg,
  };
};
