export {
  renderSemanticTaskDefinitionRegistryModule as renderGeneratedTaskDefinitionRegistryModule,
} from './generated-module/task-registry.mjs';
import {
  createClientEntitySchemaModuleModel,
  printClientEntitySchemaImports,
  printClientEntitySchemaStatements,
} from './generated-module/client-entity-schema.mjs';

const INLINE_BRIDGE_QUERY_INPUT_TYPE_PATTERN = /(:\s*)(\{\s*[^{}]*?\s*\})(\s*\)\s*=>)/g;

const normalizeInlineBridgeQueryInputType = typeText => typeText.replace(/\s+/g, ' ').trim();

const collectEntityDefinitionNamesFromText = text =>
  Array.from(text.matchAll(/\b[A-Z][A-Za-z0-9_]*Entity\b/g), match => match[0]);

const replaceProjectedEntityNames = (text, projectedNames) => {
  if (!text) return text;

  return Array.from(projectedNames.entries()).reduce(
    (current, [sourceName, projectedName]) =>
      current.replace(new RegExp(`\\b${sourceName}\\b`, 'g'), projectedName),
    text,
  );
};

const containsEntityTargetSchema = text =>
  /\b(?:graphSelection|graphSchema\.selection)\b/.test(text) ||
  /\b[A-Z][A-Za-z0-9_$]*\.(?:one|many)\s*\(/.test(text);

const shouldRenderInputContract = (operation, operationContracts) =>
  Boolean(operation.inputSchemaText) &&
  (operationContracts === 'all' ||
    (operationContracts === 'selection' && containsEntityTargetSchema(operation.inputSchemaText)));

const hoistClientBridgeQueryInputTypes = sourceText => {
  const aliasesByType = new Map();

  const withAliases = sourceText.replace(
    INLINE_BRIDGE_QUERY_INPUT_TYPE_PATTERN,
    (_match, prefix, typeText, suffix) => {
      const normalizedTypeText = normalizeInlineBridgeQueryInputType(typeText);
      let alias = aliasesByType.get(normalizedTypeText);

      if (!alias) {
        alias = {
          name: `BridgeQueryInput${aliasesByType.size + 1}`,
          typeText,
        };
        aliasesByType.set(normalizedTypeText, alias);
      }

      return `${prefix}${alias.name}${suffix}`;
    },
  );

  if (aliasesByType.size === 0) {
    return sourceText;
  }

  const aliasDeclarations = Array.from(aliasesByType.values())
    .map(alias => `type ${alias.name} = ${alias.typeText};`)
    .join('\n\n');

  return withAliases.replace(
    /import \{[\s\S]*?\} from '@ontahi\/core\/data-graph';/,
    match => `${match}\n\n${aliasDeclarations}`,
  );
};

const renderClientEntityExport = (
  definition,
  relationDefinitionsBySource = new Map(),
  operationContracts = 'all',
  projectedNames = new Map(),
  namedDefinitionLocalNames = new Map(),
) => {
  const entityExportName = definition.entityName;
  const entityArgument = definition.entitySchemaProjection
    ? (definition.entityDefinitionLocalName ?? `${definition.entityName}Schema`)
    : definition.entityDefinitionLocalName
      ? definition.entityDefinitionLocalName
      : definition.entityDefinitionName
        ? definition.entityDefinitionName
        : `'${definition.entityName}'`;
  const relationDefinitions = relationDefinitionsBySource.get(definition.entityName) ?? [];
  const relationBlock =
    relationDefinitions.length > 0
      ? `  relations: {
${relationDefinitions
  .map(
    relationDefinition => `    ${relationDefinition.relation.relationName}: {
      sourceName: '${relationDefinition.relation.sourceName}',
      domain: ${relationDefinition.entityName}.domain,
    },`,
  )
  .join('\n')}
  },
`
      : '';
  const operationBlocks = definition.operations
    .map(operation => {
      const graphOutputText = replaceProjectedEntityNames(
        operation.graphOutputText,
        projectedNames,
      );
      const inputSchemaText = operation.inputNamedDefinition
        ? (namedDefinitionLocalNames.get(operation.inputNamedDefinition.name) ??
          replaceProjectedEntityNames(operation.inputSchemaText, projectedNames))
        : replaceProjectedEntityNames(operation.inputSchemaText, projectedNames);
      const outputSchemaText = operation.outputNamedDefinition
        ? (namedDefinitionLocalNames.get(operation.outputNamedDefinition.name) ??
          replaceProjectedEntityNames(operation.outputSchemaText, projectedNames))
        : replaceProjectedEntityNames(operation.outputSchemaText, projectedNames);
      const lines = [
        `    ${operation.name}: defineClientDomainOperation({`,
        `      authority: '${operation.authority}',`,
        `      exposure: '${operation.exposure}',`,
        '      bridge: {',
      ];

      if (operation.bridgeQueryText) {
        lines.push(`        query: ${operation.bridgeQueryText},`);
      }

      if (operation.bridgeInvalidateText) {
        lines.push(`        invalidate: ${operation.bridgeInvalidateText},`);
      }

      lines.push('      },');

      if (shouldRenderInputContract(operation, operationContracts)) {
        lines.push(`      input: ${inputSchemaText},`);
      } else if (operationContracts === 'all') {
        lines.push('      input: graphSchema.void(),');
      }
      if (operationContracts === 'all' && outputSchemaText) {
        lines.push(`      output: ${outputSchemaText},`);
      }

      if (operation.durableRuntime) {
        lines.push('      durable: {');
        lines.push(`        runtime: '${operation.durableRuntime}',`);
        lines.push('      },');
      }

      if (graphOutputText) {
        lines.push(`      graphOutput: ${graphOutputText},`);
      }

      if (operation.clientCacheText) {
        lines.push(`      clientCache: ${operation.clientCacheText},`);
      }

      lines.push('    }),');
      return lines.join('\n');
    })
    .join('\n');

  return `export const ${entityExportName} = defineClientEntity(${entityArgument}, {
${relationBlock}
  domainOperations: {
${operationBlocks}
  },
});`;
};

export const renderGeneratedClientEntityModule = ({
  entities,
  schemaEntities = entities,
  namedDefinitions = [],
  schemaImportPath = './schema',
  operationContracts = 'all',
}) => {
  const helperTexts = Array.from(new Set(entities.flatMap(entity => entity.helperTexts ?? [])));
  const helperSection = helperTexts.length > 0 ? `${helperTexts.join('\n\n')}\n\n` : '';
  const usesQueryRef = helperTexts.some(helperText => /\bqueryRef\b/.test(helperText));
  const graphOutputTexts = entities.flatMap(entity =>
    entity.operations.flatMap(operation => operation.graphOutputText ?? []),
  );
  const clientCacheTexts = entities.flatMap(entity =>
    entity.operations.flatMap(operation => operation.clientCacheText ?? []),
  );
  const inputSchemaTexts = entities.flatMap(entity =>
    entity.operations.flatMap(operation =>
      shouldRenderInputContract(operation, operationContracts)
        ? (operation.inputSchemaText ?? [])
        : [],
    ),
  );
  const outputSchemaTexts =
    operationContracts === 'all'
      ? entities.flatMap(entity =>
          entity.operations.flatMap(operation => operation.outputSchemaText ?? []),
        )
      : [];
  const namedValueDefinitions = namedDefinitions.filter(
    definition => definition.kind === 'value' && definition.schemaText,
  );
  const schemaTexts = [
    ...inputSchemaTexts,
    ...outputSchemaTexts,
    ...namedValueDefinitions.map(definition => definition.schemaText),
  ];
  const usesCacheRef =
    clientCacheTexts.some(text => /\bcacheRef\b/.test(text)) ||
    helperTexts.some(helperText => /\bcacheRef\b/.test(helperText));
  const usesGraphOutput =
    graphOutputTexts.some(text => /\bgraphOutput\b/.test(text)) ||
    helperTexts.some(helperText => /\bgraphOutput\b/.test(helperText));
  const usesCreateEntityRef =
    clientCacheTexts.some(text => /\bcreateEntityRef\b/.test(text)) ||
    helperTexts.some(helperText => /\bcreateEntityRef\b/.test(helperText));
  const usesGraphSchema =
    schemaTexts.some(text => /\bgraphSchema\b/.test(text)) ||
    (operationContracts === 'all' &&
      entities.some(entity => entity.operations.some(operation => !operation.inputSchemaText)));
  const usesGraphSelection = schemaTexts.some(text => /\bgraphSelection\b/.test(text));
  const usesValue = schemaTexts.some(text => /\bvalue\s*\(/.test(text));
  const usesField = schemaTexts.some(text => /\bfield\./.test(text));
  const relationDefinitions = entities.filter(entity => entity.relation);
  const schemaResult = createClientEntitySchemaModuleModel({ schemaEntities, schemaImportPath });
  if (schemaResult.diagnostics.length > 0) {
    throw new Error(
      `Cannot emit client Entity schemas:\n${schemaResult.diagnostics
        .map(diagnostic =>
          `${diagnostic.entityName}.${diagnostic.expression}: ${diagnostic.message}`,
        )
        .join('\n')}`,
    );
  }
  const schemaModel = schemaResult.model;
  const entitySchemaSection = printClientEntitySchemaStatements(schemaModel);
  const projectedNames = new Map(
    schemaEntities
      .filter(entity => entity.entitySchemaProjection && entity.entityDefinitionName)
      .flatMap(entity => {
        const projectedName = entity.entityDefinitionLocalName ?? `${entity.entityName}Schema`;

        return [
          [entity.entityDefinitionName, projectedName],
          [entity.entityName, projectedName],
        ];
      }),
  );
  const projectedEntityNames = new Set(
    schemaEntities
      .filter(entity => entity.entitySchemaProjection)
      .flatMap(entity => [entity.entityDefinitionName, entity.entityName])
      .filter(Boolean),
  );
  const entityDefinitionImports = Array.from(
    new Set(
      entities.flatMap(entity =>
        [
          ...(entity.entityDefinitionName ? [entity.entityDefinitionName] : []),
          ...collectEntityDefinitionNamesFromText(
            [
              ...(entity.helperTexts ?? []),
              ...entity.operations.flatMap(operation => operation.graphOutputText ?? []),
              ...entity.operations.flatMap(operation => operation.clientCacheText ?? []),
              ...entity.operations.flatMap(operation =>
                shouldRenderInputContract(operation, operationContracts)
                  ? (operation.inputSchemaText ?? [])
                  : [],
              ),
              ...(operationContracts === 'all'
                ? entity.operations.flatMap(operation => operation.outputSchemaText ?? [])
                : []),
            ].join('\n'),
          ),
        ].filter(name => name && !projectedEntityNames.has(name)),
      ),
    ),
  ).sort();
  const entityDefinitionAliases = new Map(
    entities
      .filter(entity => entity.entityDefinitionName && entity.entityDefinitionLocalName)
      .map(entity => [entity.entityDefinitionName, entity.entityDefinitionLocalName]),
  );
  const usedGeneratedNames = new Set([
    ...entities.map(entity => entity.entityName),
    ...schemaModel.entitySchemas.map(schema => schema.localName),
    ...entityDefinitionImports.map(name => entityDefinitionAliases.get(name) ?? name),
  ]);
  const namedDefinitionLocalNames = new Map();
  const namedValueDefinitionTexts = namedValueDefinitions.map(definition => {
    const identifierName = definition.name.replace(/[^A-Za-z0-9_$]/g, '_');
    const safeIdentifierName = /^[A-Za-z_$]/.test(identifierName)
      ? identifierName
      : `_${identifierName}`;
    let localName = `${safeIdentifierName}Value`;
    let suffix = 2;
    while (usedGeneratedNames.has(localName)) {
      localName = `${safeIdentifierName}Value${suffix}`;
      suffix += 1;
    }
    usedGeneratedNames.add(localName);
    namedDefinitionLocalNames.set(definition.name, localName);
    return `const ${localName} = ${replaceProjectedEntityNames(
      definition.schemaText,
      projectedNames,
    )};`;
  });
  const relationDefinitionsBySource = new Map();
  for (const relationDefinition of relationDefinitions) {
    const sourceRelations =
      relationDefinitionsBySource.get(relationDefinition.relation.sourceName) ?? [];
    sourceRelations.push(relationDefinition);
    relationDefinitionsBySource.set(relationDefinition.relation.sourceName, sourceRelations);
  }
  const orderedEntities = [...relationDefinitions, ...entities.filter(entity => !entity.relation)];
  const entityExports = orderedEntities
    .map(entity =>
      renderClientEntityExport(
        entity,
        relationDefinitionsBySource,
        operationContracts,
        projectedNames,
        namedDefinitionLocalNames,
      ),
    )
    .join('\n\n');
  const entityDefinitionImportPaths = new Map(
    [...schemaEntities, ...entities].flatMap(entity => [
      ...(entity.entityDefinitionName && entity.entityDefinitionImportPath
        ? [[entity.entityDefinitionName, entity.entityDefinitionImportPath]]
        : []),
      ...(entity.entitySchemaProjection?.relations?.flatMap(relation =>
        relation.targetImportPath ? [[relation.targetName, relation.targetImportPath]] : [],
      ) ?? []),
      ...(entity.entitySchemaProjection?.referenceFields?.flatMap(referenceField =>
        referenceField.targetImportPath
          ? [[referenceField.targetName, referenceField.targetImportPath]]
          : [],
      ) ?? []),
    ]),
  );
  const importsByPath = new Map(
    schemaModel.schemaImports.map(schemaImport => [
      schemaImport.moduleSpecifier,
      [...schemaImport.bindings],
    ]),
  );
  for (const name of entityDefinitionImports) {
    const importPath = entityDefinitionImportPaths.get(name) ?? schemaImportPath;
    const bindings = importsByPath.get(importPath) ?? [];
    const localName = entityDefinitionAliases.get(name) ?? name;
    if (!bindings.some(binding => binding.importedName === name)) {
      bindings.push({ importedName: name, localName });
    }
    importsByPath.set(importPath, bindings);
  }
  const schemaImportSection = printClientEntitySchemaImports({
    ...schemaModel,
    schemaImports: Array.from(importsByPath.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([moduleSpecifier, bindings]) => ({
        moduleSpecifier,
        bindings: bindings.sort((left, right) =>
          left.importedName.localeCompare(right.importedName),
        ),
      })),
  });
  const schemaCoreImports = schemaModel.coreImports.map(binding =>
    binding.importedName === binding.localName
      ? binding.importedName
      : `${binding.importedName} as ${binding.localName}`,
  );
  const schemaImportsField = schemaModel.coreImports.some(
    binding => binding.importedName === 'field',
  );
  const coreImports = [
    ...(usesCacheRef ? ['cacheRef'] : []),
    ...(usesCreateEntityRef ? ['createEntityRef'] : []),
    'defineClientDomainOperation',
    'defineClientEntity',
    ...schemaCoreImports,
    ...(usesField && !schemaImportsField ? ['field'] : []),
    ...(usesGraphOutput ? ['graphOutput'] : []),
    ...(usesGraphSchema ? ['graphSchema'] : []),
    ...(usesGraphSelection ? ['graphSelection'] : []),
    ...(usesQueryRef ? ['queryRef'] : []),
    ...(usesValue ? ['value'] : []),
  ];

  return hoistClientBridgeQueryInputTypes(`'use client';

// This file is generated by @ontahi/codegen. Do not edit by hand.

import {
${coreImports.map(name => `  ${name},`).join('\n')}
} from '@ontahi/core/data-graph';

${schemaImportSection}${schemaImportSection ? '\n' : ''}${entitySchemaSection}${
    entitySchemaSection ? '\n' : ''
  }${namedValueDefinitionTexts.join('\n\n')}${
    namedValueDefinitionTexts.length > 0 ? '\n\n' : ''
  }${helperSection}${entityExports}
`);
};
