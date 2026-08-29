import ts from 'typescript';

import { describeEntityDeclaration, resolveEntityDeclaration } from './entity-discovery.mjs';
import {
  projectEntitySchemaConfig,
  resolveEntitySchemaProjection,
} from './entity-schema-projection.mjs';
import { parseDomainOperationDefaults, parseOperationDefinition } from './operation-analysis.mjs';
import { resolveOperationCollectionInitializer } from './operation-discovery.mjs';
import {
  collectConstDeclarations,
  collectImportMap,
  createSchemaContext,
} from './source-resolution.mjs';
import { parseTaskDefinitions } from './task-analysis.mjs';
import { readObjectLiteralProperty } from './typescript-ast.mjs';

const isExportedConst = statement =>
  ts.isVariableStatement(statement) &&
  statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

export const findDomainEntityDefinition = (sourceFile, expectedExportName, options = {}) => {
  const strict = options.strict ?? true;
  const declarations = collectConstDeclarations(sourceFile);
  const importMap = collectImportMap(sourceFile);
  const schemaContext = createSchemaContext({
    sourceFile,
    sourcePath: options.sourcePath,
    resolveImportSource: options.resolveImportSource,
    moduleCache: options.moduleCache ?? new Map(),
  });

  for (const statement of sourceFile.statements) {
    if (!isExportedConst(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      const entityExportName = declaration.name.text;

      if (expectedExportName && entityExportName !== expectedExportName) {
        continue;
      }

      const resolvedDeclaration = resolveEntityDeclaration(declaration.initializer, declarations);
      if (!resolvedDeclaration) {
        continue;
      }
      const { initializer, declarations: graphDeclarations } = resolvedDeclaration;

      const graphDefinition = describeEntityDeclaration(entityExportName, initializer);
      if (graphDefinition.diagnostics) {
        if (expectedExportName && strict) {
          return graphDefinition;
        }

        continue;
      }
      const {
        entityName,
        entityDefinitionName,
        relation,
        configArg,
        unifiedDeclaration,
        entityDefinitionLocalName,
      } = graphDefinition;
      const entityDefinitionImportPath = entityDefinitionName
        ? importMap.get(entityDefinitionName)
        : undefined;
      const entitySchemaProjection = unifiedDeclaration
        ? projectEntitySchemaConfig(configArg, schemaContext)
        : resolveEntitySchemaProjection(entityDefinitionName, schemaContext);

      const parsedTasks = parseTaskDefinitions(configArg, importMap);
      const projectionDiagnostics = entitySchemaProjection?.diagnostics ?? [];

      const domainOperationsProperty = configArg.properties.find(
        item =>
          ts.isPropertyAssignment(item) &&
          ts.isIdentifier(item.name) &&
          item.name.text === (unifiedDeclaration ? 'operations' : 'domainOperations'),
      );
      const operationsInitializer =
        domainOperationsProperty && ts.isPropertyAssignment(domainOperationsProperty)
          ? resolveOperationCollectionInitializer(
              domainOperationsProperty.initializer,
              graphDeclarations,
            )
          : undefined;

      if (
        !domainOperationsProperty ||
        !ts.isPropertyAssignment(domainOperationsProperty) ||
        !operationsInitializer ||
        !ts.isObjectLiteralExpression(operationsInitializer)
      ) {
        if (
          (options.includeTasks && parsedTasks.tasks.length > 0) ||
          (unifiedDeclaration && entitySchemaProjection)
        ) {
          return {
            diagnostics: [...projectionDiagnostics, ...parsedTasks.diagnostics],
            definition: {
              collectionName: `${entityExportName}DomainOperations`,
              clientCollectionName: `${entityExportName}ClientDomainOperations`,
              entityName,
              ...(entityDefinitionName ? { entityDefinitionName } : {}),
              ...(entityDefinitionImportPath ? { entityDefinitionImportPath } : {}),
              ...(entityDefinitionLocalName ? { entityDefinitionLocalName } : {}),
              ...(entitySchemaProjection ? { entitySchemaProjection } : {}),
              ...(relation ? { relation } : {}),
              entityExportName,
              helperTexts: [],
              operations: [],
              clientOperations: [],
              tasks: parsedTasks.tasks,
              ingress: [],
            },
          };
        }

        return expectedExportName && strict
          ? {
              diagnostics: [
                `${entityExportName} must define domainOperations as an object literal.`,
              ],
            }
          : undefined;
      }

      const defaults = parseDomainOperationDefaults(configArg, graphDeclarations);
      const operations = [];
      const clientOperations = [];
      const durableTasks = [];
      const ingress = [];
      const diagnostics = [...projectionDiagnostics, ...parsedTasks.diagnostics];

      for (const property of operationsInitializer.properties) {
        const parsed = parseOperationDefinition(
          property,
          graphDeclarations,
          importMap,
          defaults,
          schemaContext,
          { entityName },
        );
        if (!parsed) {
          continue;
        }

        if (parsed.diagnostics.length > 0) {
          diagnostics.push(...parsed.diagnostics);
          continue;
        }

        if (unifiedDeclaration) {
          for (const key of ['inputSchemaText', 'outputSchemaText', 'graphOutputText']) {
            if (parsed[key]) {
              parsed[key] = parsed[key].replace(
                /\bself\b/g,
                entityDefinitionLocalName ?? entityExportName,
              );
            }
          }

          const operationCall =
            ts.isPropertyAssignment(property) && ts.isCallExpression(property.initializer)
              ? property.initializer
              : undefined;
          const operationConfig = operationCall?.arguments[0];
          if (operationConfig && ts.isObjectLiteralExpression(operationConfig)) {
            for (const schemaPropertyName of ['input', 'output']) {
              const schemaProperty = readObjectLiteralProperty(operationConfig, schemaPropertyName);
              if (
                schemaProperty &&
                ts.isPropertyAssignment(schemaProperty) &&
                ts.isIdentifier(schemaProperty.initializer) &&
                schemaProperty.initializer.text === 'self'
              ) {
                parsed[`${schemaPropertyName}SchemaText`] =
                  entityDefinitionLocalName ?? entityExportName;
              }
            }
          }
        }

        operations.push(parsed);

        if (parsed.exposure === 'bridge') {
          clientOperations.push(parsed);
        }

        if (parsed.durableTask) {
          durableTasks.push(parsed.durableTask);
        }

        if (parsed.ingress?.length) {
          ingress.push(
            ...parsed.ingress.map(item => ({
              ...item,
              entityName,
              operationName: parsed.name,
              operationId: `${entityName}.${parsed.name}`,
            })),
          );
        }
      }

      const helperTexts = Array.from(
        new Set(clientOperations.flatMap(operation => operation.helperTexts ?? [])),
      );

      return {
        diagnostics,
        definition: {
          collectionName: `${entityExportName}DomainOperations`,
          clientCollectionName: `${entityExportName}ClientDomainOperations`,
          entityName,
          ...(entityDefinitionName ? { entityDefinitionName } : {}),
          ...(entityDefinitionImportPath ? { entityDefinitionImportPath } : {}),
          ...(entityDefinitionLocalName ? { entityDefinitionLocalName } : {}),
          ...(entitySchemaProjection ? { entitySchemaProjection } : {}),
          ...(relation ? { relation } : {}),
          entityExportName,
          helperTexts,
          operations,
          clientOperations,
          tasks: [...parsedTasks.tasks, ...durableTasks],
          ingress,
        },
      };
    }
  }

  return expectedExportName
    ? strict
      ? {
          diagnostics: [
            `No exported ${expectedExportName} defineGraphEntity(..., { domainOperations }) declaration found.`,
          ],
        }
      : undefined
    : {
        diagnostics: [
          'No exported defineGraphEntity(..., { domainOperations }) declaration found.',
        ],
      };
};
