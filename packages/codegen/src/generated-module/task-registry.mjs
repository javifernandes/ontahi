import ts from 'typescript';

const capitalizeIdentifier = value => `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;

const createUniqueName = (preferredName, fallbackName, usedNames) => {
  const initialName = preferredName ?? fallbackName;

  if (!usedNames.has(initialName)) {
    usedNames.add(initialName);
    return initialName;
  }

  let candidate = fallbackName;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${fallbackName}${index}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
};

export const createTaskRegistryModuleModel = ({ tasks }) => {
  const usedNames = new Set();
  const importsByPath = new Map();
  const addNamedImport = ({ importPath, importedName, fallbackName }) => {
    const localName = createUniqueName(importedName, fallbackName, usedNames);
    const bindings = importsByPath.get(importPath) ?? [];
    bindings.push({
      importedName,
      localName,
    });
    importsByPath.set(importPath, bindings);
    return localName;
  };
  const generatedTasks = [];
  const registryEntries = tasks.map(task => {
    if (task.kind !== 'generated') {
      return {
        localName: addNamedImport({
          importPath: task.importPath,
          importedName: task.importedIdentifier,
          fallbackName: `${task.entityName}${capitalizeIdentifier(task.name)}TaskDefinition`,
        }),
      };
    }

    const localName = createUniqueName(
      task.importedIdentifier ?? task.exportName,
      `${task.entityName}${capitalizeIdentifier(task.name)}TaskDefinition`,
      usedNames,
    );
    const fallbackTaskName = task.localName ?? task.exportName;
    const addContractImport = (contract, suffix) =>
      contract
        ? addNamedImport({
            importPath: contract.importPath,
            importedName: contract.importedIdentifier,
            fallbackName: `${fallbackTaskName}${suffix}`,
          })
        : undefined;
    const taskId = task.taskIdReference
      ? {
          kind: 'identifier',
          localName: addNamedImport({
            importPath: task.taskIdReference.importPath,
            importedName: task.taskIdReference.importedIdentifier,
            fallbackName: `${fallbackTaskName}TaskId`,
          }),
        }
      : { kind: 'string', value: task.taskId };

    generatedTasks.push({
      localName,
      taskId,
      inputLocalName: addContractImport(task.input, 'InputSchema'),
      progressLocalName: addContractImport(task.progress, 'ProgressSchema'),
      outputLocalName: addContractImport(task.finalOutput, 'OutputSchema'),
      runLocalName: addContractImport(task.run, 'Run'),
      stepLocalNames: task.steps.map(step =>
        addNamedImport({
          importPath: step.importPath,
          importedName: step.importedIdentifier,
          fallbackName: `${fallbackTaskName}${capitalizeIdentifier(step.importedIdentifier)}`,
        }),
      ),
    });

    return { localName };
  });

  return {
    diagnostics: [],
    model: {
      kind: 'task-definition-registry-module',
      taskImports: Array.from(importsByPath.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([moduleSpecifier, bindings]) => ({ moduleSpecifier, bindings })),
      generatedTasks,
      registryEntries,
    },
  };
};

const createNamedImport = ({ moduleSpecifier, bindings }) =>
  ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports(
        bindings.map(binding =>
          ts.factory.createImportSpecifier(
            false,
            binding.importedName === binding.localName
              ? undefined
              : ts.factory.createIdentifier(binding.importedName),
            ts.factory.createIdentifier(binding.localName),
          ),
        ),
      ),
    ),
    ts.factory.createStringLiteral(moduleSpecifier),
  );

const taskDefinitionType = () =>
  ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('TaskDefinition'), [
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
  ]);

const createGeneratedTaskDeclaration = task => {
  const identifierProperty = (name, localName) =>
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier(name),
      ts.factory.createIdentifier(localName),
    );
  const properties = [
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier('id'),
      task.taskId.kind === 'identifier'
        ? ts.factory.createIdentifier(task.taskId.localName)
        : ts.factory.createStringLiteral(task.taskId.value, true),
    ),
    identifierProperty('input', task.inputLocalName),
    ...(task.progressLocalName ? [identifierProperty('progress', task.progressLocalName)] : []),
    ...(task.outputLocalName ? [identifierProperty('output', task.outputLocalName)] : []),
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier('steps'),
      ts.factory.createArrayLiteralExpression(
        task.stepLocalNames.map(localName => ts.factory.createIdentifier(localName)),
      ),
    ),
    identifierProperty('run', task.runLocalName),
  ];

  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(task.localName),
          undefined,
          undefined,
          ts.factory.createCallExpression(ts.factory.createIdentifier('defineTask'), undefined, [
            ts.factory.createObjectLiteralExpression(properties, true),
          ]),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
};

const createRegistryDeclaration = model =>
  ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier('taskDefinitions'),
          undefined,
          undefined,
          ts.factory.createNewExpression(
            ts.factory.createIdentifier('Map'),
            [ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword), taskDefinitionType()],
            [
              ts.factory.createArrayLiteralExpression(
                model.registryEntries.map(entry =>
                  ts.factory.createArrayLiteralExpression([
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier(entry.localName),
                      ts.factory.createIdentifier('id'),
                    ),
                    ts.factory.createAsExpression(
                      ts.factory.createIdentifier(entry.localName),
                      taskDefinitionType(),
                    ),
                  ]),
                ),
                true,
              ),
            ],
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );

const createRegistryGetter = () =>
  ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier('getAppTaskDefinition'),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                ts.factory.createIdentifier('taskId'),
                undefined,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ),
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('taskDefinitions'),
                ts.factory.createIdentifier('get'),
              ),
              undefined,
              [ts.factory.createIdentifier('taskId')],
            ),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );

export const printTaskRegistryModule = model => {
  const serverOnlyImport = ts.factory.createImportDeclaration(
    undefined,
    undefined,
    ts.factory.createStringLiteral('server-only'),
  );
  const coreImport = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ...(model.generatedTasks.length > 0
          ? [
              ts.factory.createImportSpecifier(
                false,
                undefined,
                ts.factory.createIdentifier('defineTask'),
              ),
            ]
          : []),
        ts.factory.createImportSpecifier(
          true,
          undefined,
          ts.factory.createIdentifier('TaskDefinition'),
        ),
      ]),
    ),
    ts.factory.createStringLiteral('@ontahi/core/runtime/server/tasks'),
  );
  ts.addSyntheticLeadingComment(
    coreImport,
    ts.SyntaxKind.SingleLineCommentTrivia,
    ' This file is generated by @ontahi/codegen. Do not edit by hand.',
    true,
  );

  const sourceFile = ts.factory.createSourceFile(
    [
      serverOnlyImport,
      coreImport,
      ...model.taskImports.map(createNamedImport),
      ...model.generatedTasks.map(createGeneratedTaskDeclaration),
      createRegistryDeclaration(model),
      createRegistryGetter(),
    ],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sourceFile);
};

export const renderSemanticTaskDefinitionRegistryModule = ({ tasks }) =>
  printTaskRegistryModule(createTaskRegistryModuleModel({ tasks }).model);
