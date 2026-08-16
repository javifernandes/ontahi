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
  deriveGraphOutputFromSchemaNode,
  isGraphOutputSchemaCall,
  toClientGraphOutputText,
} from './graph-output-analysis.mjs';
import {
  resolveOperationCollectionInitializer,
  resolveOperationInitializer,
} from './operation-discovery.mjs';
import {
  createTypeScriptSourceFile,
  parseTypeScriptSource,
} from './source-parsing.mjs';
import {
  collectConstDeclarations,
  collectImportMap,
  createSchemaContext,
  resolveImportedSchemaContext,
} from './source-resolution.mjs';
import { readObjectLiteralProperty, unwrapExpression } from './typescript-ast.mjs';

const getNodeText = node => node.getText();

const isExportedConst = statement =>
  ts.isVariableStatement(statement) &&
  statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

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

const analyzeNamedValueDefinition = ({ node, declaration, context, fallbackDeclaration }) => {
  const resolved = node ? unwrapExpression(node) : undefined;
  if (
    !resolved ||
    !ts.isCallExpression(resolved) ||
    !ts.isIdentifier(resolved.expression) ||
    resolved.expression.text !== 'value' ||
    !resolved.arguments[0] ||
    !ts.isStringLiteral(resolved.arguments[0])
  ) {
    return undefined;
  }

  return {
    kind: 'value',
    name: resolved.arguments[0].text,
    declaration: declaration?.name.getText() ?? fallbackDeclaration,
    sourcePath: context?.sourcePath,
    schemaText: getNodeText(resolved),
  };
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
  let inputNamedDefinition;
  let outputNamedDefinition;
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

    inputNamedDefinition = analyzeNamedValueDefinition({
      node: localInputNode,
      declaration: localInputDeclaration ?? importedInputDeclaration,
      context: localInputDeclaration ? schemaContext : (importedInputContext ?? schemaContext),
      fallbackDeclaration: `${operationName}.input`,
    });

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

    outputNamedDefinition = analyzeNamedValueDefinition({
      node: localOutputNode,
      declaration: localOutputDeclaration ?? importedOutputDeclaration,
      context: localOutputDeclaration ? schemaContext : (importedOutputContext ?? schemaContext),
      fallbackDeclaration: `${operationName}.output`,
    });

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
    inputNamedDefinition,
    outputNamedDefinition,
    namedDefinitions: [inputNamedDefinition, outputNamedDefinition].filter(Boolean),
    durableRuntime,
    durableTask,
    ingress: parsedIngress.ingress,
    helperTexts: Array.from(helperDeclarations.values()).map(toClientGraphOutputText),
    diagnostics: [],
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
