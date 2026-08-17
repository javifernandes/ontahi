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

const replaceProjectedEntityNames = (sourceText, projectedNames) =>
  Array.from(projectedNames.entries()).reduce(
    (current, [sourceName, projectedName]) =>
      current.replace(new RegExp(`\\b${sourceName}\\b`, 'g'), projectedName),
    sourceText,
  );

const orderSchemaProjections = schemaEntities => {
  const entitiesByName = new Map();
  for (const entity of schemaEntities) {
    if (entity.entityDefinitionName) entitiesByName.set(entity.entityDefinitionName, entity);
    if (entity.entityName) entitiesByName.set(entity.entityName, entity);
  }

  const ordered = [];
  const visited = new Set();
  const visit = entity => {
    if (visited.has(entity)) return;
    visited.add(entity);

    for (const referenceField of entity.entitySchemaProjection?.referenceFields ?? []) {
      const target = entitiesByName.get(referenceField.targetName);
      if (target) visit(target);
    }
    for (const relation of entity.entitySchemaProjection?.relations ?? []) {
      if (relation.deferred) continue;
      const target = entitiesByName.get(relation.targetName);
      if (target) visit(target);
    }
    ordered.push(entity);
  };

  schemaEntities.forEach(visit);
  return ordered;
};

const createSchemaImports = ({ schemaEntities, projectedNames, schemaImportPath }) => {
  const importPathsByName = new Map();
  for (const entity of schemaEntities) {
    const projection = entity.entitySchemaProjection;
    if (!projection) continue;

    for (const dependency of [
      ...(projection.referenceFields ?? []),
      ...(projection.relations ?? []),
    ]) {
      if (!projectedNames.has(dependency.targetName)) {
        importPathsByName.set(
          dependency.targetName,
          dependency.targetImportPath ?? schemaImportPath,
        );
      }
    }
  }

  const importsByPath = new Map();
  for (const importedName of Array.from(importPathsByName.keys()).sort()) {
    const moduleSpecifier = importPathsByName.get(importedName);
    const bindings = importsByPath.get(moduleSpecifier) ?? [];
    bindings.push({ importedName, localName: importedName });
    importsByPath.set(moduleSpecifier, bindings);
  }

  return Array.from(importsByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleSpecifier, bindings]) => ({ moduleSpecifier, bindings }));
};

const createRelationModel = (relation, projectedNames) => ({
  kind: relation.kind,
  name: relation.name,
  targetLocalName: projectedNames.get(relation.targetName) ?? relation.targetName,
  via: relation.via,
});

export const createClientEntitySchemaModuleModel = ({
  schemaEntities,
  schemaImportPath = './schema',
}) => {
  const projectedNames = new Map(
    schemaEntities
      .filter(entity => entity.entitySchemaProjection && entity.entityDefinitionName)
      .flatMap(entity => {
        const localName = entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`;
        return [
          [entity.entityDefinitionName, localName],
          [entity.entityName, localName],
        ];
      }),
  );
  const orderedSchemaEntities = orderSchemaProjections(schemaEntities);
  const entitySchemas = orderedSchemaEntities
    .filter(entity => entity.entitySchemaProjection)
    .map(entity => {
      const projection = entity.entitySchemaProjection;

      return {
        localName: entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`,
        entityName: projection.name,
        fields: sourceExpression(
          replaceProjectedEntityNames(projection.fieldsText, projectedNames),
        ),
        display: projection.displayText ? sourceExpression(projection.displayText) : undefined,
        freshness: projection.freshnessText
          ? sourceExpression(projection.freshnessText)
          : undefined,
        locators: projection.locatorsText ? sourceExpression(projection.locatorsText) : undefined,
        identity: projection.identityText ? sourceExpression(projection.identityText) : undefined,
        relations: (projection.relations ?? [])
          .filter(relation => !relation.deferred)
          .map(relation => createRelationModel(relation, projectedNames)),
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
  const usesField = entitySchemas.some(schema => /\bfield\./.test(schema.fields.sourceText));
  const deferredRelations = orderedSchemaEntities.flatMap(entity => {
    const projection = entity.entitySchemaProjection;
    if (!projection) return [];

    const sourceLocalName = entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`;
    return (projection.relations ?? [])
      .filter(relation => relation.deferred)
      .map(relation => ({
        sourceLocalName,
        ...createRelationModel(relation, projectedNames),
      }));
  });

  return {
    diagnostics,
    model: {
      kind: 'client-entity-schema-module',
      coreImports: [
        ...(entitySchemas.length > 0
          ? [{ importedName: 'entity', localName: 'defineEntitySchema' }]
          : []),
        ...(usesField ? [{ importedName: 'field', localName: 'field' }] : []),
      ],
      schemaImports: createSchemaImports({ schemaEntities, projectedNames, schemaImportPath }),
      entitySchemas,
      deferredRelations,
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

const createCoreImport = bindings =>
  createNamedImport({ moduleSpecifier: '@ontahi/core/data-graph', bindings });

const readExpression = expression => {
  const parsed = parseSourceExpression(expression.sourceText);

  if (!parsed.expression || parsed.diagnostics.length > 0) {
    throw new Error('Cannot emit an invalid client Entity schema expression.');
  }

  return parsed.expression;
};

const createRelationArguments = relation => [
  ts.factory.createStringLiteral(relation.name),
  ts.factory.createIdentifier(relation.targetLocalName),
  ...(relation.via
    ? [
        ts.factory.createObjectLiteralExpression([
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier('via'),
            ts.factory.createStringLiteral(relation.via),
          ),
        ]),
      ]
    : []),
];

const createRelationCall = (receiver, relation) =>
  ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(receiver, ts.factory.createIdentifier(relation.kind)),
    undefined,
    createRelationArguments(relation),
  );

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
  for (const relation of schema.relations) {
    initializer = createRelationCall(initializer, relation);
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

const createDeferredRelationStatement = relation =>
  ts.factory.createExpressionStatement(
    createRelationCall(ts.factory.createIdentifier(relation.sourceLocalName), relation),
  );

const printStatements = statements => {
  if (statements.length === 0) return '';

  const sourceFile = ts.factory.createSourceFile(
    statements,
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );
  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sourceFile);
};

export const printClientEntitySchemaImports = model =>
  printStatements(model.schemaImports.map(createNamedImport));

export const printClientEntitySchemaStatements = model =>
  printStatements([
    ...model.entitySchemas.map(createEntitySchemaDeclaration),
    ...model.deferredRelations.map(createDeferredRelationStatement),
  ]);

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
      ...model.schemaImports.map(createNamedImport),
      ...model.entitySchemas.map(createEntitySchemaDeclaration),
      ...model.deferredRelations.map(createDeferredRelationStatement),
    ],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sourceFile);
};

export const renderSemanticClientEntitySchemaModule = ({
  schemaEntities,
  schemaImportPath = './schema',
}) => {
  const result = createClientEntitySchemaModuleModel({ schemaEntities, schemaImportPath });

  if (result.diagnostics.length > 0) {
    throw new Error(
      `Cannot emit client Entity schemas:\n${result.diagnostics
        .map(
          diagnostic => `${diagnostic.entityName}.${diagnostic.expression}: ${diagnostic.message}`,
        )
        .join('\n')}`,
    );
  }

  return printClientEntitySchemaModule(result.model);
};
