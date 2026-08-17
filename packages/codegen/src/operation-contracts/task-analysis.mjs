import ts from 'typescript';

import { createTypeScriptSourceFile } from './source-parsing.mjs';
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

export const parseTaskDefinitions = (configArg, importMap) => {
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

