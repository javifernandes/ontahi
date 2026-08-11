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
      const inputSchemaText = replaceProjectedEntityNames(
        operation.inputSchemaText,
        projectedNames,
      );
      const outputSchemaText = replaceProjectedEntityNames(
        operation.outputSchemaText,
        projectedNames,
      );
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

const renderEntitySchemaProjection = (definition, projectedNames = new Map()) => {
  const projection = definition.entitySchemaProjection;
  if (!projection) {
    return undefined;
  }

  const localName = definition.entityDefinitionLocalName ?? `${definition.entityName}Schema`;
  const steps = [
    `defineEntitySchema('${projection.name}', ${projection.fieldsText})`,
    ...(projection.displayText ? [`.display(${projection.displayText})`] : []),
    ...(projection.freshnessText ? [`.freshness(${projection.freshnessText})`] : []),
    ...(projection.locatorsText ? [`.locators(${projection.locatorsText})`] : []),
    ...(projection.identityText ? [`.identity(${projection.identityText})`] : []),
    ...(projection.relations ?? [])
      .filter(relation => !relation.deferred)
      .map(
        relation =>
          `.${relation.kind}('${relation.name}', ${
            projectedNames.get(relation.targetName) ?? relation.targetName
          }${relation.via ? `, { via: '${relation.via}' }` : ''})`,
      ),
  ];

  return {
    localName,
    text: `export const ${localName} = ${steps.join('\n  ')};`,
    deferredTexts: (projection.relations ?? [])
      .filter(relation => relation.deferred)
      .map(
        relation =>
          `${localName}.${relation.kind}('${relation.name}', ${
            projectedNames.get(relation.targetName) ?? relation.targetName
          }${relation.via ? `, { via: '${relation.via}' }` : ''});`,
      ),
  };
};

const orderSchemaProjections = definitions => {
  const definitionsByName = new Map();
  definitions.forEach(definition => {
    if (definition.entityDefinitionName) {
      definitionsByName.set(definition.entityDefinitionName, definition);
    }
    if (definition.entityName) {
      definitionsByName.set(definition.entityName, definition);
    }
  });
  const ordered = [];
  const visited = new Set();
  const visit = definition => {
    if (visited.has(definition)) return;
    visited.add(definition);
    for (const relation of definition.entitySchemaProjection?.relations ?? []) {
      if (relation.deferred) continue;
      const target = definitionsByName.get(relation.targetName);
      if (target) visit(target);
    }
    ordered.push(definition);
  };
  definitions.forEach(visit);
  return ordered;
};

export const renderGeneratedClientEntityModule = ({
  entities,
  schemaEntities = entities,
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
  const schemaTexts = [...inputSchemaTexts, ...outputSchemaTexts];
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
  const projectedSchemasUseField = schemaEntities.some(entity =>
    /\bfield\./.test(entity.entitySchemaProjection?.fieldsText ?? ''),
  );
  const relationDefinitions = entities.filter(entity => entity.relation);
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
  const entitySchemaProjections = orderSchemaProjections(schemaEntities)
    .map(entity => renderEntitySchemaProjection(entity, projectedNames))
    .filter(Boolean);
  const deferredEntityRelationTexts = entitySchemaProjections.flatMap(
    projection => projection.deferredTexts,
  );
  const projectedEntityNames = new Set(
    schemaEntities
      .filter(entity => entity.entitySchemaProjection)
      .flatMap(entity => [entity.entityDefinitionName, entity.entityName])
      .filter(Boolean),
  );
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
      ),
    )
    .join('\n\n');
  const entityDefinitionImports = Array.from(
    new Set(
      entities.flatMap(entity =>
        [
          ...(entity.entityDefinitionName ? [entity.entityDefinitionName] : []),
          ...(entity.entitySchemaProjection?.relations?.map(relation => relation.targetName) ?? []),
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
  const entityDefinitionImportPaths = new Map(
    [...schemaEntities, ...entities].flatMap(entity => [
      ...(entity.entityDefinitionName && entity.entityDefinitionImportPath
        ? [[entity.entityDefinitionName, entity.entityDefinitionImportPath]]
        : []),
      ...(entity.entitySchemaProjection?.relations?.flatMap(relation =>
        relation.targetImportPath ? [[relation.targetName, relation.targetImportPath]] : [],
      ) ?? []),
    ]),
  );
  const importsByPath = new Map();
  for (const name of entityDefinitionImports) {
    const importPath = entityDefinitionImportPaths.get(name) ?? schemaImportPath;
    const names = importsByPath.get(importPath) ?? [];
    names.push(name);
    importsByPath.set(importPath, names);
  }
  const schemaImportSection =
    importsByPath.size > 0
      ? `${Array.from(importsByPath.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([importPath, names]) =>
            names.length === 1
              ? `import { ${names[0]}${
                  entityDefinitionAliases.has(names[0])
                    ? ` as ${entityDefinitionAliases.get(names[0])}`
                    : ''
                } } from '${importPath}';`
              : `import {\n${names
                  .map(
                    name =>
                      `  ${name}${
                        entityDefinitionAliases.has(name)
                          ? ` as ${entityDefinitionAliases.get(name)}`
                          : ''
                      },`,
                  )
                  .join('\n')}\n} from '${importPath}';`,
          )
          .join('\n')}\n\n`
      : '';
  const coreImports = [
    ...(usesCacheRef ? ['cacheRef'] : []),
    ...(usesCreateEntityRef ? ['createEntityRef'] : []),
    'defineClientDomainOperation',
    'defineClientEntity',
    ...(entitySchemaProjections.length > 0 ? ['entity as defineEntitySchema'] : []),
    ...(usesField || projectedSchemasUseField ? ['field'] : []),
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

${schemaImportSection}${entitySchemaProjections.map(projection => projection.text).join('\n\n')}${
    entitySchemaProjections.length > 0 ? '\n\n' : ''
  }${deferredEntityRelationTexts.join('\n')}${
    deferredEntityRelationTexts.length > 0 ? '\n\n' : ''
  }${helperSection}${entityExports}
`);
};

const capitalizeIdentifier = value => `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;

const createUniqueGeneratedName = (preferredName, fallbackName, usedNames) => {
  const initialName = preferredName ?? fallbackName;

  if (!initialName) {
    throw new Error(`Cannot generate a unique name without a preferred name.`);
  }

  if (!usedNames.has(initialName)) {
    usedNames.add(initialName);
    return initialName;
  }

  const baseName = fallbackName ?? initialName;
  let candidate = baseName;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}${index}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
};

const createUniqueTaskImportName = (task, usedNames) =>
  createUniqueGeneratedName(
    task.importedIdentifier ?? task.exportName,
    `${task.entityName}${capitalizeIdentifier(task.name)}TaskDefinition`,
    usedNames,
  );

export const renderGeneratedTaskDefinitionRegistryModule = ({ tasks }) => {
  const usedImportNames = new Set();
  const importsByPath = new Map();
  const addNamedImport = ({ importPath, importedIdentifier, fallbackName }) => {
    const localName = createUniqueGeneratedName(importedIdentifier, fallbackName, usedImportNames);
    const imports = importsByPath.get(importPath) ?? [];
    imports.push({
      importedIdentifier,
      localName,
    });
    importsByPath.set(importPath, imports);
    return localName;
  };
  const tasksWithLocalNames = tasks.map(task => {
    if (task.kind === 'generated') {
      const addContractImport = (contract, suffix) =>
        contract
          ? {
              ...contract,
              localName: addNamedImport({
                importPath: contract.importPath,
                importedIdentifier: contract.importedIdentifier,
                fallbackName: `${task.localName ?? task.exportName}${suffix}`,
              }),
            }
          : undefined;

      return {
        ...task,
        localName: createUniqueTaskImportName(task, usedImportNames),
        ...(task.taskIdReference
          ? {
              taskIdReference: {
                ...task.taskIdReference,
                localName: addNamedImport({
                  importPath: task.taskIdReference.importPath,
                  importedIdentifier: task.taskIdReference.importedIdentifier,
                  fallbackName: `${task.localName ?? task.exportName}TaskId`,
                }),
              },
            }
          : {}),
        input: addContractImport(task.input, 'InputSchema'),
        progress: addContractImport(task.progress, 'ProgressSchema'),
        finalOutput: addContractImport(task.finalOutput, 'OutputSchema'),
        run: addContractImport(task.run, 'Run'),
        steps: task.steps.map(step => ({
          ...step,
          localName: addNamedImport({
            importPath: step.importPath,
            importedIdentifier: step.importedIdentifier,
            fallbackName: `${task.localName ?? task.exportName}${capitalizeIdentifier(
              step.importedIdentifier,
            )}`,
          }),
        })),
      };
    }

    return {
      ...task,
      localName: addNamedImport({
        importPath: task.importPath,
        importedIdentifier: task.importedIdentifier,
        fallbackName: `${task.entityName}${capitalizeIdentifier(task.name)}TaskDefinition`,
      }),
    };
  });

  const taskImports = Array.from(importsByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([importPath, importedTasks]) => {
      const namedImports = importedTasks
        .map(imported =>
          imported.localName === imported.importedIdentifier
            ? `  ${imported.importedIdentifier},`
            : `  ${imported.importedIdentifier} as ${imported.localName},`,
        )
        .join('\n');

      return `import {\n${namedImports}\n} from '${importPath}';`;
    })
    .join('\n');
  const generatedTaskDefinitions = tasksWithLocalNames
    .filter(task => task.kind === 'generated')
    .map(task =>
      [
        `const ${task.localName} = defineTask({`,
        `  id: ${task.taskIdReference ? task.taskIdReference.localName : `'${task.taskId}'`},`,
        `  input: ${task.input.localName},`,
        ...(task.progress ? [`  progress: ${task.progress.localName},`] : []),
        ...(task.finalOutput ? [`  output: ${task.finalOutput.localName},`] : []),
        `  steps: [${task.steps.map(step => step.localName).join(', ')}],`,
        `  run: ${task.run.localName},`,
        '});',
      ].join('\n'),
    )
    .join('\n\n');
  const registryEntries = tasksWithLocalNames
    .map(task => `  [${task.localName}.id, ${task.localName} as TaskDefinition<unknown, unknown>],`)
    .join('\n');

  return `import 'server-only';

// This file is generated by @ontahi/codegen. Do not edit by hand.

import {
  ${tasksWithLocalNames.some(task => task.kind === 'generated') ? 'defineTask,' : ''}
  type TaskDefinition,
} from '@ontahi/core/runtime/server/tasks';

${taskImports ? `${taskImports}\n` : ''}
${generatedTaskDefinitions}

const taskDefinitions = new Map<string, TaskDefinition<unknown, unknown>>([
${registryEntries}
]);

export const getAppTaskDefinition = (taskId: string) => taskDefinitions.get(taskId);
`;
};
