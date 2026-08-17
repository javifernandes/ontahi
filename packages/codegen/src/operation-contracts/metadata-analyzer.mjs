// Static analysis for the TypeScript/JavaScript Ontahi declaration DSL.
import ts from 'typescript';

import {
  describeEntityDeclaration,
  resolveEntityDeclaration,
} from './entity-discovery.mjs';
import {
  projectEntitySchemaConfig,
  resolveEntitySchemaProjection,
} from './entity-schema-projection.mjs';
import { discoverGraphApi } from './graph-discovery.mjs';
import {
  parseDomainOperationDefaults,
  parseOperationDefinition,
} from './operation-analysis.mjs';
import { resolveOperationCollectionInitializer } from './operation-discovery.mjs';
import {
  createTypeScriptSourceFile,
  parseTypeScriptSource,
} from './source-parsing.mjs';
import {
  collectConstDeclarations,
  collectImportMap,
  createSchemaContext,
} from './source-resolution.mjs';
import { readObjectLiteralProperty, unwrapExpression } from './typescript-ast.mjs';

const isExportedConst = statement =>
  ts.isVariableStatement(statement) &&
  statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

const collectVariableInitializers = sourceFile => {
  const initializers = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        initializers.set(declaration.name.text, declaration.initializer);
      }
    }
  }

  return initializers;
};

const resolveStringExpression = (node, initializers, visited = new Set()) => {
  const expression = unwrapExpression(node);

  if (!expression) {
    return undefined;
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (!ts.isIdentifier(expression) || visited.has(expression.text)) {
    return undefined;
  }

  const initializer = initializers.get(expression.text);
  if (!initializer) {
    return undefined;
  }

  visited.add(expression.text);
  const value = resolveStringExpression(initializer, initializers, visited);
  visited.delete(expression.text);
  return value;
};

const findExportedVariableInitializer = (sourceFile, exportName) => {
  for (const statement of sourceFile.statements) {
    if (!isExportedConst(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === exportName &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }

  return undefined;
};

export const analyzeExportedStringConstant = (sourceText, exportName, options = {}) => {
  const sourceFile = createTypeScriptSourceFile(
    sourceText,
    options.sourcePath ?? 'constant-module.ts',
  );
  const initializer = findExportedVariableInitializer(sourceFile, exportName);
  const value = resolveStringExpression(initializer, collectVariableInitializers(sourceFile));

  return value
    ? { value, diagnostics: [] }
    : {
        diagnostics: [`${exportName} must be an exported string constant.`],
      };
};

export const analyzeExportedTaskStep = (sourceText, exportName, options = {}) => {
  const sourceFile = createTypeScriptSourceFile(
    sourceText,
    options.sourcePath ?? 'task-step-module.ts',
  );
  const initializer = unwrapExpression(findExportedVariableInitializer(sourceFile, exportName));

  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== 'defineTaskStep'
  ) {
    return {
      diagnostics: [`${exportName} must be an exported defineTaskStep(...) declaration.`],
    };
  }

  const [configNode] = initializer.arguments;
  if (!configNode || !ts.isObjectLiteralExpression(configNode)) {
    return {
      diagnostics: [`${exportName} must call defineTaskStep({ id: ... }).`],
    };
  }

  const idProperty = readObjectLiteralProperty(configNode, 'id');
  const id =
    idProperty && ts.isPropertyAssignment(idProperty)
      ? resolveStringExpression(idProperty.initializer, collectVariableInitializers(sourceFile))
      : undefined;

  return id
    ? { definition: { id }, diagnostics: [] }
    : {
        diagnostics: [`${exportName}.id must resolve to a string constant.`],
      };
};

const parseTaskDefinitionReference = ({ name, initializer, importMap, diagnosticPrefix }) => {
  if (!ts.isIdentifier(initializer)) {
    return {
      task: undefined,
      diagnostics: [`${diagnosticPrefix} must reference an imported task definition identifier.`],
    };
  }

  const importedIdentifier = initializer.text;
  const importPath = importMap.get(importedIdentifier);

  if (!importPath) {
    return {
      task: undefined,
      diagnostics: [`${diagnosticPrefix} must reference an imported task definition identifier.`],
    };
  }

  return {
    task: {
      name,
      importedIdentifier,
      importPath,
    },
    diagnostics: [],
  };
};

const parseTaskDefinitions = (configArg, importMap) => {
  const tasksProperty = configArg.properties.find(
    item =>
      ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === 'tasks',
  );

  if (
    !tasksProperty ||
    !ts.isPropertyAssignment(tasksProperty) ||
    !ts.isObjectLiteralExpression(tasksProperty.initializer)
  ) {
    return {
      tasks: [],
      diagnostics: [],
    };
  }

  const tasks = [];
  const diagnostics = [];

  for (const property of tasksProperty.initializer.properties) {
    let name;
    let importedIdentifier;

    if (ts.isShorthandPropertyAssignment(property)) {
      name = property.name.text;
      importedIdentifier = property.name.text;
    } else if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      ts.isIdentifier(property.initializer)
    ) {
      name = property.name.text;
      importedIdentifier = property.initializer.text;
    } else {
      continue;
    }

    const parsed = parseTaskDefinitionReference({
      name,
      initializer: ts.factory.createIdentifier(importedIdentifier),
      importMap,
      diagnosticPrefix: `${name} task`,
    });

    diagnostics.push(...parsed.diagnostics);

    if (parsed.task) {
      tasks.push(parsed.task);
    }
  }

  return {
    tasks,
    diagnostics,
  };
};

const findDomainEntityDefinition = (sourceFile, expectedExportName, options = {}) => {
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
            diagnostics: parsedTasks.diagnostics,
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
      const diagnostics = [...parsedTasks.diagnostics];

      for (const property of operationsInitializer.properties) {
        const parsed = parseOperationDefinition(
          property,
          graphDeclarations,
          importMap,
          defaults,
          schemaContext,
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

export const analyzeSpecificDomainEntityExport = (sourceText, exportName, options = {}) => {
  const { sourceFile, diagnostics } = parseTypeScriptSource(
    sourceText,
    options.sourcePath ?? 'domain-entity-module.ts',
  );

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  return findDomainEntityDefinition(sourceFile, exportName, {
    ...options,
    strict: false,
    includeTasks: true,
  });
};

export const analyzeGraphApiModule = sourceText => {
  const { sourceFile, diagnostics } = parseTypeScriptSource(sourceText, 'graph-api-module.ts');

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  return discoverGraphApi(sourceFile);
};
