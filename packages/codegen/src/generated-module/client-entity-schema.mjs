import ts from 'typescript';

const sourceExpression = sourceText => ({
  kind: 'source-expression',
  sourceText,
});

const synthesizeExpression = expression => {
  const result = ts.transform(ts.getSynthesizedDeepClone(expression), [
    context => {
      const visit = node =>
        ts.isNumericLiteral(node)
          ? ts.factory.createNumericLiteral(node.text)
          : ts.visitEachChild(node, visit, context);
      return node => ts.visitNode(node, visit);
    },
  ]);
  const synthesized = result.transformed[0];
  result.dispose();
  return synthesized;
};

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
      ? synthesizeExpression(
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
  ['selectionFactories', schema.selectionFactories],
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
  ...(relation.ordered ? { ordered: true } : {}),
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
  const schemaImports = createSchemaImports({ schemaEntities, projectedNames, schemaImportPath });
  const deferredSchemaLocalNames = new Set(
    orderedSchemaEntities
      .filter(entity =>
        entity.entitySchemaProjection?.relations?.some(relation => relation.deferred),
      )
      .map(entity => entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`),
  );
  const reservedLocalNames = new Set([
    'defineEntitySchema',
    'field',
    ...orderedSchemaEntities
      .filter(entity => entity.entitySchemaProjection)
      .map(entity => entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`),
    ...schemaImports.flatMap(schemaImport =>
      schemaImport.bindings.map(binding => binding.localName),
    ),
  ]);
  const deferredDeclarationLocalNames = new Map();
  for (const localName of deferredSchemaLocalNames) {
    const stem = `${localName}Base`;
    let declarationLocalName = stem;
    let suffix = 2;
    while (reservedLocalNames.has(declarationLocalName)) {
      declarationLocalName = `${stem}${suffix}`;
      suffix += 1;
    }
    reservedLocalNames.add(declarationLocalName);
    deferredDeclarationLocalNames.set(localName, declarationLocalName);
  }
  const initializationNames = new Map(projectedNames);
  for (const entity of orderedSchemaEntities) {
    const localName = entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`;
    if (!deferredSchemaLocalNames.has(localName)) continue;
    const baseLocalName = deferredDeclarationLocalNames.get(localName);
    if (entity.entityDefinitionName)
      initializationNames.set(entity.entityDefinitionName, baseLocalName);
    if (entity.entityName) initializationNames.set(entity.entityName, baseLocalName);
  }
  const entitySchemas = orderedSchemaEntities
    .filter(entity => entity.entitySchemaProjection)
    .map(entity => {
      const projection = entity.entitySchemaProjection;
      const localName = entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`;
      const deferred = deferredSchemaLocalNames.has(localName);

      return {
        localName,
        ...(deferred
          ? { declarationLocalName: deferredDeclarationLocalNames.get(localName), deferred: true }
          : {}),
        entityName: projection.name,
        fields: sourceExpression(
          replaceProjectedEntityNames(projection.fieldsText, initializationNames),
        ),
        display: projection.displayText ? sourceExpression(projection.displayText) : undefined,
        freshness: projection.freshnessText
          ? sourceExpression(projection.freshnessText)
          : undefined,
        locators: projection.locatorsText ? sourceExpression(projection.locatorsText) : undefined,
        identity: projection.identityText ? sourceExpression(projection.identityText) : undefined,
        selectionFactories: projection.selectionFactoriesText
          ? sourceExpression(projection.selectionFactoriesText)
          : undefined,
        relations: (projection.relations ?? [])
          .filter(relation => !relation.deferred)
          .map(relation => createRelationModel(relation, initializationNames)),
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
  const usesField = entitySchemas.some(schema =>
    schemaExpressionEntries(schema).some(
      ([, expression]) => expression && /\bfield\./.test(expression.sourceText),
    ),
  );
  const usesFactories = entitySchemas.some(schema => schema.selectionFactories);
  const deferredRelations = orderedSchemaEntities.flatMap(entity => {
    const projection = entity.entitySchemaProjection;
    if (!projection) return [];

    const sourceLocalName = entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`;
    return (projection.relations ?? [])
      .filter(relation => relation.deferred)
      .map(relation => ({
        sourceLocalName,
        sourceDeclarationLocalName: deferredDeclarationLocalNames.get(sourceLocalName),
        ...createRelationModel(relation, initializationNames),
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
        ...(usesFactories
          ? [
              { importedName: 'withSelectionFactories', localName: 'withSelectionFactories' },
              { importedName: 'graphSchema', localName: 'graphSchema' },
            ]
          : []),
      ],
      schemaImports,
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

const createRelationArguments = relation => {
  const options = [
    ...(relation.via
      ? [
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier('via'),
            ts.factory.createStringLiteral(relation.via),
          ),
        ]
      : []),
    ...(relation.ordered
      ? [
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier('ordered'),
            ts.factory.createTrue(),
          ),
        ]
      : []),
  ];
  return [
    ts.factory.createStringLiteral(relation.name),
    ts.factory.createIdentifier(relation.targetLocalName),
    ...(options.length > 0 ? [ts.factory.createObjectLiteralExpression(options)] : []),
  ];
};

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
    if (!expression || method === 'selectionFactories') continue;

    initializer = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(initializer, ts.factory.createIdentifier(method)),
      undefined,
      [readExpression(expression)],
    );
  }
  for (const relation of schema.relations) {
    initializer = createRelationCall(initializer, relation);
  }
  if (schema.selectionFactories) {
    initializer = ts.factory.createCallExpression(
      ts.factory.createIdentifier('withSelectionFactories'),
      undefined,
      [initializer, readExpression(schema.selectionFactories)],
    );
  }

  return ts.factory.createVariableStatement(
    schema.deferred ? undefined : [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(schema.declarationLocalName ?? schema.localName),
          undefined,
          undefined,
          initializer,
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
};

const createDeferredRelationStatements = deferredRelations => {
  const relationsBySource = new Map();
  for (const relation of deferredRelations) {
    const relations = relationsBySource.get(relation.sourceLocalName) ?? [];
    relations.push(relation);
    relationsBySource.set(relation.sourceLocalName, relations);
  }
  return Array.from(relationsBySource.entries()).map(([sourceLocalName, relations]) => {
    let initializer = ts.factory.createIdentifier(relations[0].sourceDeclarationLocalName);
    for (const relation of relations) initializer = createRelationCall(initializer, relation);
    return ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(sourceLocalName),
            undefined,
            undefined,
            initializer,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
  });
};

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
    ...createDeferredRelationStatements(model.deferredRelations),
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
      ...createDeferredRelationStatements(model.deferredRelations),
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
