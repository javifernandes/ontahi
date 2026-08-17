import ts from 'typescript';

const sourceExpression = sourceText => ({
  kind: 'source-expression',
  sourceText,
});

const parseSourceExpression = sourceText => {
  const sourceFile = ts.createSourceFile(
    'generated-expression.ts',
    `const expression = (${sourceText});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements[0]?.declarationList?.declarations?.[0];
  const initializer = declaration?.initializer;

  return {
    diagnostics: sourceFile.parseDiagnostics,
    expression: initializer
      ? ts.getSynthesizedDeepClone(
          ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer,
        )
      : undefined,
  };
};

const schemaExpressionEntries = schema => [
  ['fields', schema.fields],
  ['display', schema.display],
  ['freshness', schema.freshness],
  ['locators', schema.locators],
  ['identity', schema.identity],
];

export const createClientEntitySchemaModuleModel = ({ schemaEntities }) => {
  const entitySchemas = schemaEntities
    .filter(entity => entity.entitySchemaProjection)
    .map(entity => {
      const projection = entity.entitySchemaProjection;

      return {
        localName: entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`,
        entityName: projection.name,
        fields: sourceExpression(projection.fieldsText),
        display: projection.displayText
          ? sourceExpression(projection.displayText)
          : undefined,
        freshness: projection.freshnessText
          ? sourceExpression(projection.freshnessText)
          : undefined,
        locators: projection.locatorsText
          ? sourceExpression(projection.locatorsText)
          : undefined,
        identity: projection.identityText
          ? sourceExpression(projection.identityText)
          : undefined,
      };
    });
  const diagnostics = entitySchemas.flatMap(schema =>
    schemaExpressionEntries(schema).flatMap(([name, expression]) =>
      expression
        ? parseSourceExpression(expression.sourceText).diagnostics.map(diagnostic => ({
            entityName: schema.entityName,
            expression: name,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          }))
        : [],
    ),
  );
  diagnostics.push(
    ...schemaEntities.flatMap(entity => {
      const projection = entity.entitySchemaProjection;
      if (!projection) return [];

      return [
        ...((projection.referenceFields?.length ?? 0) > 0
          ? [
              {
                entityName: projection.name,
                expression: 'referenceFields',
                message: 'Reference fields are not supported by the base schema emitter.',
              },
            ]
          : []),
        ...((projection.relations?.length ?? 0) > 0
          ? [
              {
                entityName: projection.name,
                expression: 'relations',
                message: 'Entity relations are not supported by the base schema emitter.',
              },
            ]
          : []),
      ];
    }),
  );
  const usesField = entitySchemas.some(schema => /\bfield\./.test(schema.fields.sourceText));

  return {
    diagnostics,
    model: {
      kind: 'client-entity-schema-module',
      coreImports: [
        { importedName: 'entity', localName: 'defineEntitySchema' },
        ...(usesField ? [{ importedName: 'field', localName: 'field' }] : []),
      ],
      entitySchemas,
    },
  };
};

const createCoreImport = bindings =>
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
    ts.factory.createStringLiteral('@ontahi/core/data-graph'),
  );

const readExpression = expression => {
  const parsed = parseSourceExpression(expression.sourceText);

  if (!parsed.expression || parsed.diagnostics.length > 0) {
    throw new Error('Cannot emit an invalid client Entity schema expression.');
  }

  return parsed.expression;
};

const createEntitySchemaDeclaration = schema => {
  let initializer = ts.factory.createCallExpression(
    ts.factory.createIdentifier('defineEntitySchema'),
    undefined,
    [ts.factory.createStringLiteral(schema.entityName), readExpression(schema.fields)],
  );

  for (const [method, expression] of schemaExpressionEntries(schema).slice(1)) {
    if (!expression) continue;

    initializer = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(initializer, ts.factory.createIdentifier(method)),
      undefined,
      [readExpression(expression)],
    );
  }

  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(schema.localName),
          undefined,
          undefined,
          initializer,
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
};

export const printClientEntitySchemaModule = model => {
  const coreImport = createCoreImport(model.coreImports);
  ts.addSyntheticLeadingComment(
    coreImport,
    ts.SyntaxKind.SingleLineCommentTrivia,
    ' This file is generated by @ontahi/codegen. Do not edit by hand.',
    true,
  );
  const sourceFile = ts.factory.createSourceFile(
    [
      ts.factory.createExpressionStatement(ts.factory.createStringLiteral('use client')),
      coreImport,
      ...model.entitySchemas.map(createEntitySchemaDeclaration),
    ],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sourceFile);
};

export const renderSemanticClientEntitySchemaModule = ({ schemaEntities }) => {
  const result = createClientEntitySchemaModuleModel({ schemaEntities });

  if (result.diagnostics.length > 0) {
    throw new Error(
      `Cannot emit client Entity schemas:\n${result.diagnostics
        .map(diagnostic =>
          `${diagnostic.entityName}.${diagnostic.expression}: ${diagnostic.message}`,
        )
        .join('\n')}`,
    );
  }

  return printClientEntitySchemaModule(result.model);
};
