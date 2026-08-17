import ts from 'typescript';

import { collectImportMap } from './source-resolution.mjs';

const graphDeclarationFunctions = new Set([
  'defineGraphApi',
  'defineOntahiApplication',
  'ontahi',
  'registerBoundEntities',
]);

const isExportedConst = statement =>
  ts.isVariableStatement(statement) &&
  statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

export const discoverGraphApi = sourceFile => {
  const importMap = collectImportMap(sourceFile);
  let unsupportedGraphApplication;

  for (const statement of sourceFile.statements) {
    if (!isExportedConst(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      const apiExportName = declaration.name.text;
      const initializer = declaration.initializer;

      if (!ts.isCallExpression(initializer)) {
        continue;
      }
      const declarationFunction = ts.isIdentifier(initializer.expression)
        ? initializer.expression.text
        : ts.isPropertyAccessExpression(initializer.expression)
          ? initializer.expression.name.text
          : undefined;
      if (!declarationFunction || !graphDeclarationFunctions.has(declarationFunction)) continue;

      const [configArg] = initializer.arguments;

      if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
        return {
          diagnostics: [`${apiExportName} must define entities as an object literal.`],
        };
      }

      const entitiesProperty = configArg.properties.find(
        item =>
          ts.isPropertyAssignment(item) &&
          ts.isIdentifier(item.name) &&
          item.name.text === 'entities',
      );

      if (
        declarationFunction !== 'registerBoundEntities' &&
        (!entitiesProperty || !ts.isPropertyAssignment(entitiesProperty))
      ) {
        const graphProperty = configArg.properties.find(
          item =>
            ts.isPropertyAssignment(item) &&
            ts.isIdentifier(item.name) &&
            item.name.text === 'graph',
        );

        if (
          declarationFunction === 'defineOntahiApplication' &&
          graphProperty &&
          ts.isPropertyAssignment(graphProperty)
        ) {
          unsupportedGraphApplication ??= apiExportName;
          continue;
        }

        return {
          diagnostics: [`${apiExportName} must define entities as an object literal.`],
        };
      }

      const entitiesInitializer =
        declarationFunction === 'registerBoundEntities' ? configArg : entitiesProperty.initializer;
      const entitiesObject = ts.isObjectLiteralExpression(entitiesInitializer)
        ? entitiesInitializer
        : ts.isArrowFunction(entitiesInitializer)
          ? ts.isObjectLiteralExpression(entitiesInitializer.body)
            ? entitiesInitializer.body
            : ts.isParenthesizedExpression(entitiesInitializer.body) &&
                ts.isObjectLiteralExpression(entitiesInitializer.body.expression)
              ? entitiesInitializer.body.expression
              : undefined
          : undefined;
      const entitiesArray = ts.isArrayLiteralExpression(entitiesInitializer)
        ? entitiesInitializer
        : undefined;

      if (!entitiesObject && !entitiesArray) {
        return {
          diagnostics: [
            `${apiExportName} must define entities as an object literal, an entity array, or an arrow function returning an object.`,
          ],
        };
      }

      const entities = [];
      const diagnostics = [];
      const entityProperties =
        entitiesObject?.properties ??
        entitiesArray?.elements.filter(ts.isIdentifier).map(identifier => ({
          name: identifier,
          __ontahiArrayEntity: true,
        }));

      for (const property of entityProperties ?? []) {
        let entityExportName;
        let importedIdentifier;

        if (property.__ontahiArrayEntity) {
          entityExportName = property.name.text;
          importedIdentifier = property.name.text;
        } else if (ts.isShorthandPropertyAssignment(property)) {
          entityExportName = property.name.text;
          importedIdentifier = property.name.text;
        } else if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isIdentifier(property.initializer)
        ) {
          entityExportName = property.name.text;
          importedIdentifier = property.initializer.text;
        } else if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isCallExpression(property.initializer) &&
          ts.isIdentifier(property.initializer.expression)
        ) {
          entityExportName = property.name.text;
          importedIdentifier = property.initializer.expression.text;
        } else {
          continue;
        }

        const importPath = importMap.get(importedIdentifier);

        if (!importPath) {
          diagnostics.push(
            `${apiExportName}.entities.${entityExportName} must reference an imported identifier.`,
          );
          continue;
        }

        entities.push({
          entityExportName,
          importedIdentifier,
          importPath,
        });
      }

      return {
        diagnostics,
        definition: {
          apiExportName,
          entities,
        },
      };
    }
  }

  if (unsupportedGraphApplication) {
    return {
      diagnostics: [
        `${unsupportedGraphApplication} uses defineOntahiApplication({ graph, runtime }), but the referenced graph declaration could not be discovered in this module.`,
      ],
    };
  }

  return {
    diagnostics: [
      'No exported defineGraphApi({ entities }) or defineOntahiApplication({ entities }) declaration found.',
    ],
  };
};
