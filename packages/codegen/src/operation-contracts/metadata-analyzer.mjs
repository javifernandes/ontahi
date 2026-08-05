// Static analysis for the TypeScript/JavaScript Ontahi declaration DSL.
import ts from 'typescript';

const getNodeText = node => node.getText();

const toClientGraphOutputText = text => text.replace(/\bapp\.graph\.output\b/g, 'graphOutput');

const isAppGraphOutputExpression = expression =>
  ts.isPropertyAccessExpression(expression) &&
  expression.name.text === 'output' &&
  ts.isPropertyAccessExpression(expression.expression) &&
  expression.expression.name.text === 'graph' &&
  ts.isIdentifier(expression.expression.expression) &&
  expression.expression.expression.text === 'app';

const isGraphOutputExpression = expression =>
  (ts.isIdentifier(expression) && expression.text === 'graphOutput') ||
  isAppGraphOutputExpression(expression);

const isGraphOutputCall = (expression, name) =>
  ts.isPropertyAccessExpression(expression) &&
  expression.name.text === name &&
  isGraphOutputExpression(expression.expression);

const isGraphOutputSchemaCall = expression => isGraphOutputCall(expression, 'schema');

const graphSchemaHelperNames = new Map([
  ['graphObject', 'object'],
  ['graphArray', 'array'],
  ['graphNullable', 'nullable'],
  ['graphOptional', 'optional'],
  ['graphLiteral', 'literal'],
  ['graphUnion', 'union'],
  ['graphDiscriminatedUnion', 'discriminatedUnion'],
  ['graphRecord', 'record'],
  ['graphDefault', 'default'],
  ['graphTransform', 'transform'],
  ['graphRefine', 'refine'],
  ['graphLazy', 'lazy'],
  ['graphNamed', 'named'],
  ['graphSelection', 'selection'],
  ['describeGraphSchema', 'describe'],
  ['presentGraphSchema', 'present'],
]);

const graphSchemaCallName = expression => {
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'graphSchema'
  ) {
    return expression.name.text;
  }

  return ts.isIdentifier(expression) ? graphSchemaHelperNames.get(expression.text) : undefined;
};

const isGraphSchemaCall = (expression, name) => graphSchemaCallName(expression) === name;

const isValueDefinitionCall = expression =>
  (ts.isIdentifier(expression) && (expression.text === 'value' || expression.text === 'valueOf')) ||
  isGraphSchemaCall(expression, 'value') ||
  isGraphSchemaCall(expression, 'valueOf');

const readObjectLiteralProperty = (objectLiteral, propertyName) =>
  objectLiteral.properties.find(
    item =>
      ts.isPropertyAssignment(item) &&
      ts.isIdentifier(item.name) &&
      item.name.text === propertyName,
  );

const isExportedConst = statement =>
  ts.isVariableStatement(statement) &&
  statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

const resolveEntityName = entityArg => {
  if (!entityArg) {
    return undefined;
  }

  if (ts.isStringLiteral(entityArg)) {
    return entityArg.text;
  }

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

const isDomainOperationDefineCall = expression =>
  (ts.isIdentifier(expression) && expression.text === 'defineDomainOperation') ||
  (ts.isIdentifier(expression) && expression.text === 'operation') ||
  (ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'define' &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'operation' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'app');

const isGraphEntityDefineCall = expression =>
  (ts.isIdentifier(expression) && expression.text === 'defineGraphEntity') ||
  (ts.isPropertyAccessExpression(expression) &&
    (expression.name.text === 'defineEntity' || expression.name.text === 'defineGraphEntity') &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'graph' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'app');

const isOntahiEntityDeclarationCall = expression =>
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

const readStringLiteralObjectProperty = (objectLiteral, propertyName) => {
  const property = objectLiteral.properties.find(
    item =>
      ts.isPropertyAssignment(item) &&
      ts.isIdentifier(item.name) &&
      item.name.text === propertyName,
  );

  return property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
};

const isAppIngressHttpCall = expression =>
  ts.isPropertyAccessExpression(expression) &&
  expression.name.text === 'http' &&
  ((ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'ingress' &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'app') ||
    (ts.isIdentifier(expression.expression) && expression.expression.text === 'ingress'));

const collectIdentifierNames = node => {
  const names = new Set();

  const visit = current => {
    if (ts.isIdentifier(current)) {
      names.add(current.text);
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
  return names;
};

const collectImportMap = sourceFile => {
  const importMap = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }

    const moduleSpecifier = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined;

    if (!moduleSpecifier) {
      continue;
    }

    const namedBindings = statement.importClause.namedBindings;

    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importMap.set(element.name.text, moduleSpecifier);
      }
    }
  }

  return importMap;
};

const createSourceFile = (sourceText, fileName = 'module.ts') =>
  ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const unwrapExpression = node => {
  if (
    node &&
    (ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node))
  ) {
    return unwrapExpression(node.expression);
  }

  return node;
};

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
  const sourceFile = createSourceFile(sourceText, options.sourcePath ?? 'constant-module.ts');
  const initializer = findExportedVariableInitializer(sourceFile, exportName);
  const value = resolveStringExpression(initializer, collectVariableInitializers(sourceFile));

  return value
    ? { value, diagnostics: [] }
    : {
        diagnostics: [`${exportName} must be an exported string constant.`],
      };
};

export const analyzeExportedTaskStep = (sourceText, exportName, options = {}) => {
  const sourceFile = createSourceFile(sourceText, options.sourcePath ?? 'task-step-module.ts');
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

const createSchemaContext = ({
  sourceFile,
  sourcePath,
  resolveImportSource,
  moduleCache = new Map(),
}) => ({
  sourceFile,
  sourcePath,
  declarations: collectConstDeclarations(sourceFile),
  importMap: collectImportMap(sourceFile),
  resolveImportSource,
  moduleCache,
});

const resolveImportedSchemaContext = (identifierName, context) => {
  const importPath = context.importMap.get(identifierName);

  if (!importPath || !context.resolveImportSource) {
    return undefined;
  }

  const resolved = context.resolveImportSource(context.sourcePath, importPath);

  if (!resolved) {
    return undefined;
  }

  const cacheKey = resolved.sourcePath ?? importPath;
  const cached = context.moduleCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const sourceFile = createSourceFile(resolved.sourceText, resolved.sourcePath ?? importPath);
  const importedContext = createSchemaContext({
    sourceFile,
    sourcePath: resolved.sourcePath,
    resolveImportSource: context.resolveImportSource,
    moduleCache: context.moduleCache,
  });

  context.moduleCache.set(cacheKey, importedContext);
  return importedContext;
};

const renderGraphOutputObject = fieldEntries => {
  if (fieldEntries.length === 0) {
    return undefined;
  }

  const fieldsText = `{ ${fieldEntries
    .map(([fieldName, descriptor]) => `${fieldName}: ${descriptor.text}`)
    .join(', ')} }`;

  return {
    kind: 'object',
    fieldEntries,
    fieldsText,
    text: `graphOutput.object(${fieldsText})`,
  };
};

const deriveGraphOutputFromUnion = (optionsArg, context, visited) => {
  if (!optionsArg || !ts.isArrayLiteralExpression(optionsArg)) {
    return undefined;
  }

  const mergedFields = new Map();
  const conflictingFields = new Set();

  for (const option of optionsArg.elements) {
    const descriptor = deriveGraphOutputFromSchemaNode(option, context, visited);

    if (descriptor?.kind !== 'object') {
      continue;
    }

    for (const [fieldName, fieldDescriptor] of descriptor.fieldEntries) {
      if (conflictingFields.has(fieldName)) {
        continue;
      }

      const currentDescriptor = mergedFields.get(fieldName);

      if (!currentDescriptor || currentDescriptor.text === fieldDescriptor.text) {
        mergedFields.set(fieldName, fieldDescriptor);
      } else {
        mergedFields.delete(fieldName);
        conflictingFields.add(fieldName);
      }
    }
  }

  return renderGraphOutputObject([...mergedFields]);
};

const readLazySchemaBody = callback => {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return undefined;
  }

  if (!ts.isBlock(callback.body)) {
    return callback.body;
  }

  const returnStatement = callback.body.statements.find(ts.isReturnStatement);
  return returnStatement?.expression;
};

const deriveGraphOutputFromObjectLiteral = (objectLiteral, context, visited) => {
  const fieldEntries = [];

  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const descriptor = deriveGraphOutputFromSchemaNode(property.initializer, context, visited);

    if (descriptor) {
      fieldEntries.push([property.name.getText(), descriptor]);
    }
  }

  return renderGraphOutputObject(fieldEntries);
};

const deriveGraphOutputFromIdentifier = (identifier, context, visited) => {
  const visitKey = `${context.sourcePath ?? context.sourceFile.fileName}:${identifier.text}`;

  if (visited.has(visitKey)) {
    return undefined;
  }

  const declaration = context.declarations.get(identifier.text);

  if (declaration?.initializer) {
    visited.add(visitKey);
    const descriptor = deriveGraphOutputFromSchemaNode(declaration.initializer, context, visited);
    visited.delete(visitKey);
    return descriptor;
  }

  const importedContext = resolveImportedSchemaContext(identifier.text, context);
  const importedDeclaration = importedContext?.declarations.get(identifier.text);

  if (!importedDeclaration?.initializer) {
    return undefined;
  }

  visited.add(visitKey);
  const descriptor = deriveGraphOutputFromSchemaNode(
    importedDeclaration.initializer,
    importedContext,
    visited,
  );
  visited.delete(visitKey);
  return descriptor;
};

const deriveGraphOutputFromSchemaNode = (node, context, visited = new Set()) => {
  if (!node) {
    return undefined;
  }

  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return deriveGraphOutputFromSchemaNode(node.expression, context, visited);
  }

  if (ts.isIdentifier(node)) {
    return deriveGraphOutputFromIdentifier(node, context, visited);
  }

  if (!ts.isCallExpression(node)) {
    return undefined;
  }

  const expression = node.expression;

  if (isValueDefinitionCall(expression)) {
    const [, fieldsArg] = node.arguments;

    return fieldsArg && ts.isObjectLiteralExpression(fieldsArg)
      ? deriveGraphOutputFromObjectLiteral(fieldsArg, context, visited)
      : undefined;
  }

  if (isGraphSchemaCall(expression, 'object')) {
    const [fieldsArg] = node.arguments;

    return fieldsArg && ts.isObjectLiteralExpression(fieldsArg)
      ? deriveGraphOutputFromObjectLiteral(fieldsArg, context, visited)
      : undefined;
  }

  if (isGraphSchemaCall(expression, 'array')) {
    const [itemArg] = node.arguments;
    const item = deriveGraphOutputFromSchemaNode(itemArg, context, visited);

    return item
      ? {
          kind: 'array',
          text: `graphOutput.array(${item.text})`,
        }
      : undefined;
  }

  if (isGraphSchemaCall(expression, 'nullable') || isGraphSchemaCall(expression, 'optional')) {
    const [itemArg] = node.arguments;
    const item = deriveGraphOutputFromSchemaNode(itemArg, context, visited);

    return item
      ? {
          kind: expression.name.text,
          text: `graphOutput.${expression.name.text}(${item.text})`,
        }
      : undefined;
  }

  if (
    isGraphSchemaCall(expression, 'default') ||
    isGraphSchemaCall(expression, 'transform') ||
    isGraphSchemaCall(expression, 'refine') ||
    isGraphSchemaCall(expression, 'describe') ||
    isGraphSchemaCall(expression, 'present')
  ) {
    const [itemArg] = node.arguments;
    return deriveGraphOutputFromSchemaNode(itemArg, context, visited);
  }

  if (isGraphSchemaCall(expression, 'named')) {
    const [, itemArg] = node.arguments;
    return deriveGraphOutputFromSchemaNode(itemArg, context, visited);
  }

  if (isGraphSchemaCall(expression, 'lazy')) {
    const [, callbackArg] = node.arguments;
    return deriveGraphOutputFromSchemaNode(readLazySchemaBody(callbackArg), context, visited);
  }

  if (isGraphSchemaCall(expression, 'union')) {
    const [optionsArg] = node.arguments;
    return deriveGraphOutputFromUnion(optionsArg, context, visited);
  }

  if (isGraphSchemaCall(expression, 'discriminatedUnion')) {
    const [, optionsArg] = node.arguments;
    return deriveGraphOutputFromUnion(optionsArg, context, visited);
  }

  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'view') {
    const entityArg = expression.expression;
    const [, configArg] = node.arguments;
    const fieldsProperty =
      configArg && ts.isObjectLiteralExpression(configArg)
        ? readObjectLiteralProperty(configArg, 'fields')
        : undefined;
    const fieldsDescriptor =
      fieldsProperty && ts.isObjectLiteralExpression(fieldsProperty.initializer)
        ? deriveGraphOutputFromObjectLiteral(fieldsProperty.initializer, context, visited)
        : undefined;
    const fieldsText =
      fieldsDescriptor?.kind === 'object' ? `, ${fieldsDescriptor.fieldsText}` : '';

    return {
      kind: 'entity',
      text: `graphOutput.entity(${entityArg.getText()}${fieldsText})`,
    };
  }

  if (isGraphOutputCall(expression, 'entity')) {
    const [entityArg, schemaOrFieldsArg] = node.arguments;

    if (!entityArg) {
      return undefined;
    }

    const nestedDescriptor = schemaOrFieldsArg
      ? deriveGraphOutputFromSchemaNode(schemaOrFieldsArg, context, visited)
      : undefined;
    const fieldsText =
      nestedDescriptor?.kind === 'object' ? `, ${nestedDescriptor.fieldsText}` : '';

    return {
      kind: 'entity',
      text: `graphOutput.entity(${entityArg.getText()}${fieldsText})`,
    };
  }

  if (isGraphOutputSchemaCall(expression)) {
    const [, descriptorArg] = node.arguments;
    return descriptorArg
      ? {
          kind: 'descriptor',
          text: toClientGraphOutputText(descriptorArg.getText()),
        }
      : undefined;
  }

  return undefined;
};

const collectReferencedHelperDeclarations = (
  node,
  declarations,
  collected,
  visiting = new Set(),
) => {
  for (const identifierName of collectIdentifierNames(node)) {
    if (visiting.has(identifierName) || collected.has(identifierName)) {
      continue;
    }

    const declaration = declarations.get(identifierName);
    if (!declaration?.initializer) {
      continue;
    }

    visiting.add(identifierName);
    collectReferencedHelperDeclarations(declaration.initializer, declarations, collected, visiting);
    collected.set(identifierName, `const ${declaration.getText()};`);
    visiting.delete(identifierName);
  }
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

const parseImportedIdentifierReference = ({ node, importMap, diagnosticPrefix }) => {
  if (!node || !ts.isIdentifier(node)) {
    return {
      reference: undefined,
      diagnostics: [`${diagnosticPrefix} must reference an imported identifier.`],
    };
  }

  const importedIdentifier = node.text;
  const importPath = importMap.get(importedIdentifier);

  if (!importPath) {
    return {
      reference: undefined,
      diagnostics: [`${diagnosticPrefix} must reference an imported identifier.`],
    };
  }

  return {
    reference: {
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

const parseDurableTaskDefinitionFromOperation = ({
  operationName,
  config,
  durableNode,
  durableRuntime,
  importMap,
}) => {
  if (!durableNode || !ts.isObjectLiteralExpression(durableNode)) {
    return {
      task: undefined,
      diagnostics: [],
    };
  }

  const durableConfig = new Map();
  for (const item of durableNode.properties) {
    if (ts.isPropertyAssignment(item) && ts.isIdentifier(item.name)) {
      durableConfig.set(item.name.text, item.initializer);
    }
  }

  const taskIdNode = durableConfig.get('taskId');
  let taskId;
  let taskIdReference;
  const diagnostics = [];
  const expectsTaskGeneration = durableConfig.has('taskId') || durableConfig.has('steps');

  if (taskIdNode && ts.isStringLiteral(taskIdNode)) {
    taskId = taskIdNode.text;
  } else if (taskIdNode && ts.isIdentifier(taskIdNode)) {
    const parsed = parseImportedIdentifierReference({
      node: taskIdNode,
      importMap,
      diagnosticPrefix: `${operationName}.durable.taskId`,
    });
    diagnostics.push(...parsed.diagnostics);
    taskIdReference = parsed.reference;
  }

  if (!taskId && !taskIdReference) {
    diagnostics.push(
      `${operationName}.durable.taskId must be a string literal or imported identifier.`,
    );
  }

  const input = parseImportedIdentifierReference({
    node: config.get('input'),
    importMap,
    diagnosticPrefix: `${operationName}.input`,
  });
  const run = parseImportedIdentifierReference({
    node: config.get('run'),
    importMap,
    diagnosticPrefix: `${operationName}.run`,
  });
  diagnostics.push(...input.diagnostics, ...run.diagnostics);
  const parseOptionalContract = (name, node) => {
    if (!node) {
      return undefined;
    }

    const parsed = parseImportedIdentifierReference({
      node,
      importMap,
      diagnosticPrefix: `${operationName}.durable.${name}`,
    });
    diagnostics.push(...parsed.diagnostics);
    return parsed.reference;
  };
  const progress = parseOptionalContract('progress', durableConfig.get('progress'));
  const finalOutput = parseOptionalContract('finalOutput', durableConfig.get('finalOutput'));

  const stepsNode = durableConfig.get('steps');
  const steps = [];

  if (stepsNode) {
    if (!ts.isArrayLiteralExpression(stepsNode)) {
      diagnostics.push(`${operationName}.durable.steps must be an array literal.`);
    } else {
      for (const [index, element] of stepsNode.elements.entries()) {
        const parsed = parseImportedIdentifierReference({
          node: element,
          importMap,
          diagnosticPrefix: `${operationName}.durable.steps[${index}]`,
        });
        diagnostics.push(...parsed.diagnostics);

        if (parsed.reference) {
          steps.push(parsed.reference);
        }
      }
    }
  }

  if (
    (!taskId && !taskIdReference) ||
    !input.reference ||
    !run.reference ||
    diagnostics.length > 0
  ) {
    return {
      task: undefined,
      diagnostics: expectsTaskGeneration ? diagnostics : [],
    };
  }

  return {
    task: {
      kind: 'generated',
      name: operationName,
      runtime: durableRuntime,
      ...(taskId ? { taskId } : {}),
      ...(taskIdReference ? { taskIdReference } : {}),
      input: input.reference,
      ...(progress ? { progress } : {}),
      ...(finalOutput ? { finalOutput } : {}),
      run: run.reference,
      steps,
    },
    diagnostics: [],
  };
};

const resolveObjectLiteralExpression = (node, declarations, visited = new Set()) => {
  if (!node) {
    return undefined;
  }

  if (ts.isObjectLiteralExpression(node)) {
    return node;
  }

  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    return resolveObjectLiteralExpression(node.expression, declarations, visited);
  }

  if (ts.isIdentifier(node)) {
    if (visited.has(node.text)) {
      return undefined;
    }

    const declaration = declarations.get(node.text);
    if (!declaration?.initializer) {
      return undefined;
    }

    visited.add(node.text);
    const resolved = resolveObjectLiteralExpression(declaration.initializer, declarations, visited);
    visited.delete(node.text);
    return resolved;
  }

  return undefined;
};

const parseDomainOperationDefaults = (configArg, declarations = new Map()) => {
  const defaultsProperty = configArg.properties.find(
    item =>
      ts.isPropertyAssignment(item) &&
      ts.isIdentifier(item.name) &&
      item.name.text === 'domainOperationDefaults',
  );

  if (!defaultsProperty || !ts.isPropertyAssignment(defaultsProperty)) {
    return {};
  }

  const defaultsObject = resolveObjectLiteralExpression(defaultsProperty.initializer, declarations);
  if (!defaultsObject) {
    return {};
  }

  const config = new Map();
  for (const item of defaultsObject.properties) {
    if (ts.isPropertyAssignment(item) && ts.isIdentifier(item.name)) {
      config.set(item.name.text, item.initializer);
    }
  }

  const authorityNode = config.get('authority');
  const exposureNode = config.get('exposure');
  const durableNode = config.get('durable');
  let durableRuntime;

  if (durableNode && ts.isObjectLiteralExpression(durableNode)) {
    const runtimeProperty = durableNode.properties.find(
      item =>
        ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === 'runtime',
    );

    if (
      runtimeProperty &&
      ts.isPropertyAssignment(runtimeProperty) &&
      ts.isStringLiteral(runtimeProperty.initializer)
    ) {
      durableRuntime = runtimeProperty.initializer.text;
    }
  }

  return {
    authority: authorityNode && ts.isStringLiteral(authorityNode) ? authorityNode.text : undefined,
    exposure: exposureNode && ts.isStringLiteral(exposureNode) ? exposureNode.text : undefined,
    durableRuntime,
  };
};

const readStringLiteralProperty = (config, propertyName) => {
  const node = config.get(propertyName);
  return node && ts.isStringLiteral(node) ? node.text : undefined;
};

const parseHttpIngressMetadata = ({ operationName, index, expression }) => {
  if (!ts.isCallExpression(expression) || !isAppIngressHttpCall(expression.expression)) {
    return {
      ingress: undefined,
      diagnostics: [
        `${operationName}.ingress[${index}] must be an app.ingress.http({ ... }) call.`,
      ],
    };
  }

  const [configArg] = expression.arguments;
  if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
    return {
      ingress: undefined,
      diagnostics: [
        `${operationName}.ingress[${index}] must call app.ingress.http with an object literal.`,
      ],
    };
  }

  const config = new Map();
  for (const item of configArg.properties) {
    if (ts.isPropertyAssignment(item) && ts.isIdentifier(item.name)) {
      config.set(item.name.text, item.initializer);
    }
  }

  const method = readStringLiteralProperty(config, 'method');
  const route = readStringLiteralProperty(config, 'route');
  const provider = readStringLiteralProperty(config, 'provider');
  const channel = readStringLiteralProperty(config, 'channel');
  const diagnostics = [];

  if (!method) {
    diagnostics.push(`${operationName}.ingress[${index}].method must be a string literal.`);
  }

  if (!route) {
    diagnostics.push(`${operationName}.ingress[${index}].route must be a string literal.`);
  }

  if (diagnostics.length > 0) {
    return {
      ingress: undefined,
      diagnostics,
    };
  }

  return {
    ingress: {
      kind: 'http',
      method,
      route,
      ...(provider ? { provider } : {}),
      ...(channel ? { channel } : {}),
    },
    diagnostics: [],
  };
};

const parseIngressDefinitions = (operationName, ingressNode) => {
  if (!ingressNode) {
    return {
      ingress: [],
      diagnostics: [],
    };
  }

  if (!ts.isArrayLiteralExpression(ingressNode)) {
    return {
      ingress: [],
      diagnostics: [`${operationName}.ingress must be an array literal.`],
    };
  }

  const ingress = [];
  const diagnostics = [];

  for (const [index, element] of ingressNode.elements.entries()) {
    const parsed = parseHttpIngressMetadata({
      operationName,
      index,
      expression: element,
    });
    diagnostics.push(...parsed.diagnostics);

    if (parsed.ingress) {
      ingress.push(parsed.ingress);
    }
  }

  return {
    ingress,
    diagnostics,
  };
};

const resolveOperationInitializer = (initializer, declarations, visited = new Set()) => {
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    return resolveOperationInitializer(initializer.expression, declarations, visited);
  }

  if (ts.isCallExpression(initializer) && isDomainOperationDefineCall(initializer.expression)) {
    return initializer;
  }

  const resolveIdentifier = identifier => {
    if (visited.has(identifier.text)) {
      return undefined;
    }
    const declaration = declarations.get(identifier.text);
    if (!declaration?.initializer) {
      return undefined;
    }
    visited.add(identifier.text);
    return resolveOperationInitializer(declaration.initializer, declarations, visited);
  };

  if (ts.isIdentifier(initializer)) {
    return resolveIdentifier(initializer);
  }

  if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return resolveIdentifier(initializer.expression);
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (!ts.isBlock(initializer.body)) {
      return resolveOperationInitializer(initializer.body, declarations, visited);
    }
    const returned = initializer.body.statements.find(statement => ts.isReturnStatement(statement));
    return returned?.expression
      ? resolveOperationInitializer(returned.expression, declarations, visited)
      : undefined;
  }

  return undefined;
};

const resolveObjectLiteralInitializer = (initializer, declarations, visited = new Set()) => {
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    return resolveObjectLiteralInitializer(initializer.expression, declarations, visited);
  }

  if (ts.isObjectLiteralExpression(initializer)) {
    return initializer;
  }

  const resolveIdentifier = identifier => {
    if (visited.has(identifier.text)) {
      return undefined;
    }
    const declaration = declarations.get(identifier.text);
    if (!declaration?.initializer) {
      return undefined;
    }
    visited.add(identifier.text);
    return resolveObjectLiteralInitializer(declaration.initializer, declarations, visited);
  };

  if (ts.isIdentifier(initializer)) {
    return resolveIdentifier(initializer);
  }

  if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return resolveIdentifier(initializer.expression);
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (!ts.isBlock(initializer.body)) {
      return resolveObjectLiteralInitializer(initializer.body, declarations, visited);
    }
    const returned = initializer.body.statements.find(statement => ts.isReturnStatement(statement));
    return returned?.expression
      ? resolveObjectLiteralInitializer(returned.expression, declarations, visited)
      : undefined;
  }

  return undefined;
};

const parseOperationDefinition = (
  property,
  declarations,
  importMap,
  defaults = {},
  schemaContext,
) => {
  if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
    return undefined;
  }

  const operationName = property.name.text;
  const initializer = resolveOperationInitializer(property.initializer, declarations);

  if (!initializer) {
    return undefined;
  }

  const [configArg] = initializer.arguments;
  if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
    return undefined;
  }

  const config = new Map();
  for (const item of configArg.properties) {
    if (ts.isPropertyAssignment(item) && ts.isIdentifier(item.name)) {
      config.set(item.name.text, item.initializer);
    }
  }

  const authorityNode = config.get('authority');
  const exposureNode = config.get('exposure');
  const bridgeNode = config.get('bridge');
  const durableNode = config.get('durable');
  const ingressNode = config.get('ingress');
  const outputNode = config.get('output');
  const inputNode = config.get('input');
  const graphOutputNode = config.get('graphOutput');
  const clientCacheNode = config.get('clientCache');

  const authority =
    authorityNode && ts.isStringLiteral(authorityNode) ? authorityNode.text : defaults.authority;
  const exposure =
    exposureNode && ts.isStringLiteral(exposureNode) ? exposureNode.text : defaults.exposure;

  if (!authority || !exposure) {
    return {
      diagnostics: [
        `${operationName} must declare string literal authority and exposure, or inherit them from domainOperationDefaults.`,
      ],
    };
  }

  let durableRuntime;
  let durableTask;
  if (durableNode) {
    if (!ts.isObjectLiteralExpression(durableNode)) {
      return {
        diagnostics: [`${operationName}.durable must be an object literal.`],
      };
    }

    const runtimeProperty = durableNode.properties.find(
      item =>
        ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === 'runtime',
    );

    if (runtimeProperty && ts.isPropertyAssignment(runtimeProperty)) {
      if (!ts.isStringLiteral(runtimeProperty.initializer)) {
        return {
          diagnostics: [`${operationName}.durable.runtime must be a string literal.`],
        };
      }

      durableRuntime = runtimeProperty.initializer.text;
    } else {
      durableRuntime = defaults.durableRuntime;
    }

    if (!durableRuntime) {
      return {
        diagnostics: [
          `${operationName}.durable must declare string literal runtime or inherit it from domainOperationDefaults.durable.runtime.`,
        ],
      };
    }

    const parsedDurableTask = parseDurableTaskDefinitionFromOperation({
      operationName,
      config,
      durableNode,
      durableRuntime,
      importMap,
    });
    if (parsedDurableTask.diagnostics.length > 0) {
      return {
        diagnostics: parsedDurableTask.diagnostics,
      };
    }
    durableTask = parsedDurableTask.task;
  }

  let bridgeQueryText;
  let bridgeInvalidateText;
  let graphOutputText;
  let clientCacheText;
  let inputSchemaText;
  let outputSchemaText;
  const helperDeclarations = new Map();

  if (inputNode) {
    const unwrappedInput = unwrapExpression(inputNode);
    const localInputDeclaration =
      unwrappedInput && ts.isIdentifier(unwrappedInput)
        ? schemaContext?.declarations.get(unwrappedInput.text)
        : undefined;
    const importedInputContext =
      schemaContext && unwrappedInput && ts.isIdentifier(unwrappedInput) && !localInputDeclaration
        ? resolveImportedSchemaContext(unwrappedInput.text, schemaContext)
        : undefined;
    const importedInputDeclaration =
      unwrappedInput && ts.isIdentifier(unwrappedInput)
        ? importedInputContext?.declarations.get(unwrappedInput.text)
        : undefined;
    const localInputNode =
      unwrappedInput && ts.isIdentifier(unwrappedInput)
        ? (localInputDeclaration?.initializer ?? importedInputDeclaration?.initializer)
        : unwrappedInput;

    if (
      localInputNode &&
      !(ts.isIdentifier(localInputNode) && localInputNode.text === 'undefined')
    ) {
      const candidateInputSchemaText = getNodeText(unwrapExpression(localInputNode));
      if (candidateInputSchemaText.trim() !== 'undefined') {
        inputSchemaText = candidateInputSchemaText;
      }
    }
  }
  if (outputNode) {
    const unwrappedOutput = unwrapExpression(outputNode);
    const localOutputDeclaration =
      unwrappedOutput && ts.isIdentifier(unwrappedOutput)
        ? schemaContext?.declarations.get(unwrappedOutput.text)
        : undefined;
    const importedOutputContext =
      schemaContext &&
      unwrappedOutput &&
      ts.isIdentifier(unwrappedOutput) &&
      !localOutputDeclaration
        ? resolveImportedSchemaContext(unwrappedOutput.text, schemaContext)
        : undefined;
    const importedOutputDeclaration =
      unwrappedOutput && ts.isIdentifier(unwrappedOutput)
        ? importedOutputContext?.declarations.get(unwrappedOutput.text)
        : undefined;
    const preserveEntityIdentifier =
      unwrappedOutput &&
      ts.isIdentifier(unwrappedOutput) &&
      unwrappedOutput.text.endsWith('Entity');
    const localOutputNode = preserveEntityIdentifier
      ? unwrappedOutput
      : unwrappedOutput && ts.isIdentifier(unwrappedOutput)
        ? (localOutputDeclaration?.initializer ?? importedOutputDeclaration?.initializer)
        : unwrappedOutput;

    if (
      localOutputNode &&
      !(ts.isIdentifier(localOutputNode) && localOutputNode.text === 'undefined')
    ) {
      const candidateOutputSchemaText = getNodeText(unwrapExpression(localOutputNode));
      if (candidateOutputSchemaText.trim() !== 'undefined') {
        outputSchemaText = candidateOutputSchemaText;
      }
    }
  }
  if (bridgeNode) {
    if (!ts.isObjectLiteralExpression(bridgeNode)) {
      return {
        diagnostics: [`${operationName}.bridge must be an object literal.`],
      };
    }

    const queryProperty = bridgeNode.properties.find(
      item =>
        ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === 'query',
    );

    if (queryProperty && ts.isPropertyAssignment(queryProperty)) {
      bridgeQueryText = getNodeText(queryProperty.initializer);
      collectReferencedHelperDeclarations(
        queryProperty.initializer,
        declarations,
        helperDeclarations,
      );
    }

    const invalidateProperty = bridgeNode.properties.find(
      item =>
        ts.isPropertyAssignment(item) &&
        ts.isIdentifier(item.name) &&
        item.name.text === 'invalidate',
    );

    if (invalidateProperty && ts.isPropertyAssignment(invalidateProperty)) {
      bridgeInvalidateText = getNodeText(invalidateProperty.initializer);
    }
  }

  const graphOutputDescriptorNode =
    graphOutputNode ??
    (outputNode && ts.isCallExpression(outputNode) && isGraphOutputSchemaCall(outputNode.expression)
      ? outputNode.arguments[1]
      : undefined);

  if (graphOutputDescriptorNode) {
    graphOutputText = toClientGraphOutputText(getNodeText(graphOutputDescriptorNode));
    collectReferencedHelperDeclarations(
      graphOutputDescriptorNode,
      declarations,
      helperDeclarations,
    );
  } else if (outputNode && schemaContext) {
    const derivedGraphOutput = deriveGraphOutputFromSchemaNode(outputNode, schemaContext);
    graphOutputText = derivedGraphOutput?.text;
  }

  if (clientCacheNode) {
    if (!ts.isObjectLiteralExpression(clientCacheNode)) {
      return {
        diagnostics: [`${operationName}.clientCache must be an object literal.`],
      };
    }

    clientCacheText = getNodeText(clientCacheNode);
    collectReferencedHelperDeclarations(clientCacheNode, declarations, helperDeclarations);
  }

  const parsedIngress = parseIngressDefinitions(operationName, ingressNode);
  if (parsedIngress.diagnostics.length > 0) {
    return {
      diagnostics: parsedIngress.diagnostics,
    };
  }

  return {
    name: operationName,
    authority,
    exposure,
    bridgeQueryText,
    bridgeInvalidateText,
    graphOutputText,
    clientCacheText,
    inputSchemaText,
    outputSchemaText,
    durableRuntime,
    durableTask,
    ingress: parsedIngress.ingress,
    helperTexts: Array.from(helperDeclarations.values()).map(toClientGraphOutputText),
    diagnostics: [],
  };
};

const collectConstDeclarations = sourceFile => {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      declarations.set(declaration.name.text, declaration);
    }
  }

  return declarations;
};

const graphInitializerDeclarations = new WeakMap();

const resolveGraphEntityInitializer = (initializer, declarations, visited = new Set()) => {
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    return resolveGraphEntityInitializer(initializer.expression, declarations, visited);
  }

  if (
    ts.isCallExpression(initializer) &&
    (isGraphEntityDefineCall(initializer.expression) ||
      isGraphRelationDefineCall(initializer.expression) ||
      isOntahiEntityDeclarationCall(initializer.expression))
  ) {
    return initializer;
  }

  if (ts.isCallExpression(initializer) && isOntahiEntityModuleCall(initializer.expression)) {
    const config = initializer.arguments[0];
    if (!config || !ts.isObjectLiteralExpression(config)) {
      return undefined;
    }
    const bindProperty = config.properties.find(
      property =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'bind',
    );
    return bindProperty && ts.isPropertyAssignment(bindProperty)
      ? resolveGraphEntityInitializer(bindProperty.initializer, declarations, visited)
      : undefined;
  }

  if (
    ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    initializer.expression.name.text === 'registerBoundEntity'
  ) {
    const boundEntity = initializer.arguments[1];
    return boundEntity
      ? resolveGraphEntityInitializer(boundEntity, declarations, visited)
      : undefined;
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (!ts.isBlock(initializer.body)) {
      return resolveGraphEntityInitializer(initializer.body, declarations, visited);
    }

    const scopedDeclarations = new Map([
      ...declarations,
      ...collectConstDeclarations(initializer.body),
    ]);
    const returned = initializer.body.statements.find(statement => ts.isReturnStatement(statement));
    const resolved = returned?.expression
      ? resolveGraphEntityInitializer(returned.expression, scopedDeclarations, visited)
      : undefined;
    if (resolved) {
      graphInitializerDeclarations.set(resolved, scopedDeclarations);
    }
    return resolved;
  }

  if (ts.isIdentifier(initializer)) {
    if (visited.has(initializer.text)) {
      return undefined;
    }

    const declaration = declarations.get(initializer.text);
    if (!declaration?.initializer) {
      return undefined;
    }

    visited.add(initializer.text);
    return resolveGraphEntityInitializer(declaration.initializer, declarations, visited);
  }

  if (
    ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    ts.isIdentifier(initializer.expression.expression) &&
    initializer.expression.expression.text === 'Object' &&
    initializer.expression.name.text === 'assign'
  ) {
    const [target] = initializer.arguments;
    if (!target) {
      return undefined;
    }

    return resolveGraphEntityInitializer(target, declarations, visited);
  }

  return undefined;
};

const resolveGraphDomainDefinition = (entityExportName, initializer) => {
  if (isOntahiEntityDeclarationCall(initializer.expression)) {
    const [configArg] = initializer.arguments;

    if (!configArg || !ts.isObjectLiteralExpression(configArg)) {
      return {
        diagnostics: [`${entityExportName} must call entity({ name, fields, operations }).`],
      };
    }

    const entityName = readStringLiteralObjectProperty(configArg, 'name');
    if (!entityName) {
      return {
        diagnostics: [`${entityExportName}.name must be a string literal.`],
      };
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
      relation: {
        sourceName,
        relationName,
      },
      configArg,
    };
  }

  const [entityArg, configArg] = initializer.arguments;
  if (!entityArg || !configArg || !ts.isObjectLiteralExpression(configArg)) {
    return {
      diagnostics: [`${entityExportName} must call defineGraphEntity(entity, { ... }).`],
    };
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

const resolveProjectionValueText = (node, context, visited = new Set()) => {
  const expression = unwrapExpression(node);
  if (!ts.isIdentifier(expression)) {
    return expression.getText();
  }

  const visitKey = `${context?.sourcePath ?? context?.sourceFile.fileName}:${expression.text}`;
  if (!context || visited.has(visitKey)) {
    return expression.getText();
  }

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

const projectEntitySchemaConfig = (configArg, context) => {
  const propertyText = name => {
    const property = readObjectLiteralProperty(configArg, name);
    return property && ts.isPropertyAssignment(property)
      ? resolveProjectionValueText(property.initializer, context)
      : undefined;
  };
  const name = readStringLiteralObjectProperty(configArg, 'name');
  const fieldsText = propertyText('fields');

  if (!name || !fieldsText) {
    return undefined;
  }

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
          if (
            (relationKind !== 'hasMany' && relationKind !== 'belongsTo') ||
            !targetArg ||
            !ts.isIdentifier(targetArg)
          ) {
            return [];
          }
          const via =
            optionsArg && ts.isObjectLiteralExpression(optionsArg)
              ? readStringLiteralObjectProperty(optionsArg, 'via')
              : undefined;
          return [
            {
              name: property.name.text,
              kind: relationKind,
              targetName: targetArg.text,
              ...(context?.importMap.get(targetArg.text)
                ? { targetImportPath: context.importMap.get(targetArg.text) }
                : {}),
              ...(via ? { via } : {}),
            },
          ];
        })
      : [];

  return {
    name,
    fieldsText,
    ...(propertyText('display') ? { displayText: propertyText('display') } : {}),
    ...(propertyText('freshness') ? { freshnessText: propertyText('freshness') } : {}),
    ...(propertyText('locators') ? { locatorsText: propertyText('locators') } : {}),
    ...(propertyText('identity') ? { identityText: propertyText('identity') } : {}),
    ...(relations.length > 0 ? { relations } : {}),
  };
};

const resolveEntitySchemaProjection = (identifierName, context, visited = new Set()) => {
  const visitKey = `${context.sourcePath ?? context.sourceFile.fileName}:${identifierName}`;
  if (!identifierName || visited.has(visitKey)) {
    return undefined;
  }

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

      const initializer = resolveGraphEntityInitializer(declaration.initializer, declarations);
      if (!initializer) {
        continue;
      }
      const graphDeclarations = graphInitializerDeclarations.get(initializer) ?? declarations;

      const graphDefinition = resolveGraphDomainDefinition(entityExportName, initializer);
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
          ? resolveObjectLiteralInitializer(domainOperationsProperty.initializer, graphDeclarations)
          : undefined;

      if (
        !domainOperationsProperty ||
        !ts.isPropertyAssignment(domainOperationsProperty) ||
        !operationsInitializer ||
        !ts.isObjectLiteralExpression(operationsInitializer)
      ) {
        if (options.includeTasks && parsedTasks.tasks.length > 0) {
          return {
            diagnostics: parsedTasks.diagnostics,
            definition: {
              collectionName: `${entityExportName}DomainOperations`,
              clientCollectionName: `${entityExportName}ClientDomainOperations`,
              entityName,
              ...(entityDefinitionName ? { entityDefinitionName } : {}),
              ...(entityDefinitionImportPath ? { entityDefinitionImportPath } : {}),
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
  const sourceFile = createSourceFile(sourceText, options.sourcePath ?? 'domain-entity-module.ts');

  return findDomainEntityDefinition(sourceFile, exportName, {
    ...options,
    strict: false,
    includeTasks: true,
  });
};

export const analyzeGraphApiModule = sourceText => {
  const sourceFile = ts.createSourceFile(
    'graph-api-module.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const importMap = collectImportMap(sourceFile);
  const graphDeclarationFunctions = new Set([
    'defineGraphApi',
    'defineOntahiApplication',
    'ontahi',
    'registerBoundEntities',
  ]);
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
