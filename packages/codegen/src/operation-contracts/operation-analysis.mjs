import ts from 'typescript';

import {
  deriveGraphOutputFromSchemaNode,
  isGraphOutputSchemaCall,
  toClientGraphOutputText,
} from './graph-output-analysis.mjs';
import { resolveOperationInitializer } from './operation-discovery.mjs';
import { resolveImportedSchemaContext } from './source-resolution.mjs';
import { unwrapExpression } from './typescript-ast.mjs';

const getNodeText = node => node.getText();

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

export const parseDomainOperationDefaults = (configArg, declarations = new Map()) => {
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

export const parseOperationDefinition = (
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
