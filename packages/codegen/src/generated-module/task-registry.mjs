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
  if (tasks.some(task => task.kind === 'generated')) {
    return {
      diagnostics: ['Semantic task registry emission does not support generated tasks yet.'],
    };
  }

  const usedNames = new Set();
  const importsByPath = new Map();
  const registryEntries = tasks.map(task => {
    const localName = createUniqueName(
      task.importedIdentifier,
      `${task.entityName}${capitalizeIdentifier(task.name)}TaskDefinition`,
      usedNames,
    );
    const bindings = importsByPath.get(task.importPath) ?? [];
    bindings.push({
      importedName: task.importedIdentifier,
      localName,
    });
    importsByPath.set(task.importPath, bindings);
    return { localName };
  });

  return {
    diagnostics: [],
    model: {
      kind: 'task-definition-registry-module',
      taskImports: Array.from(importsByPath.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([moduleSpecifier, bindings]) => ({ moduleSpecifier, bindings })),
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
            [
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              taskDefinitionType(),
            ],
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
      createRegistryDeclaration(model),
      createRegistryGetter(),
    ],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sourceFile);
};
