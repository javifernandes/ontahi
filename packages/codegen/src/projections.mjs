const INLINE_BRIDGE_QUERY_INPUT_TYPE_PATTERN = /(:\s*)(\{\s*[^{}]*?\s*\})(\s*\)\s*=>)/g;

const normalizeInlineBridgeQueryInputType = typeText => typeText.replace(/\s+/g, ' ').trim();

const collectEntityDefinitionNamesFromText = text =>
  Array.from(text.matchAll(/\b[A-Z][A-Za-z0-9_]*Entity\b/g), match => match[0]);

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

const renderClientEntityExport = (definition, relationDefinitionsBySource = new Map()) => {
  const entityExportName = definition.entityName;
  const entityArgument = definition.entityDefinitionName
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

      if (operation.inputSchemaText) {
        lines.push(`      input: ${operation.inputSchemaText},`);
      }

      if (operation.durableRuntime) {
        lines.push('      durable: {');
        lines.push(`        runtime: '${operation.durableRuntime}',`);
        lines.push('      },');
      }

      if (operation.graphOutputText) {
        lines.push(`      graphOutput: ${operation.graphOutputText},`);
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

export const renderGeneratedClientEntityModule = ({ entities }) => {
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
    entity.operations.flatMap(operation => operation.inputSchemaText ?? []),
  );
  const usesCacheRef =
    clientCacheTexts.some(text => /\bcacheRef\b/.test(text)) ||
    helperTexts.some(helperText => /\bcacheRef\b/.test(helperText));
  const usesGraphOutput =
    graphOutputTexts.some(text => /\bgraphOutput\b/.test(text)) ||
    helperTexts.some(helperText => /\bgraphOutput\b/.test(helperText));
  const usesCreateEntityRef =
    clientCacheTexts.some(text => /\bcreateEntityRef\b/.test(text)) ||
    helperTexts.some(helperText => /\bcreateEntityRef\b/.test(helperText));
  const usesGraphSchema = inputSchemaTexts.some(text => /\bgraphSchema\b/.test(text));
  const usesGraphSelection = inputSchemaTexts.some(text => /\bgraphSelection\b/.test(text));
  const usesValue = inputSchemaTexts.some(text => /\bvalue\s*\(/.test(text));
  const usesField = inputSchemaTexts.some(text => /\bfield\./.test(text));
  const relationDefinitions = entities.filter(entity => entity.relation);
  const relationDefinitionsBySource = new Map();
  for (const relationDefinition of relationDefinitions) {
    const sourceRelations =
      relationDefinitionsBySource.get(relationDefinition.relation.sourceName) ?? [];
    sourceRelations.push(relationDefinition);
    relationDefinitionsBySource.set(relationDefinition.relation.sourceName, sourceRelations);
  }
  const orderedEntities = [...relationDefinitions, ...entities.filter(entity => !entity.relation)];
  const entityExports = orderedEntities
    .map(entity => renderClientEntityExport(entity, relationDefinitionsBySource))
    .join('\n\n');
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
              ...entity.operations.flatMap(operation => operation.inputSchemaText ?? []),
            ].join('\n'),
          ),
        ].filter(Boolean),
      ),
    ),
  ).sort();
  const schemaImportSection =
    entityDefinitionImports.length > 0
      ? `import {\n${entityDefinitionImports.map(name => `  ${name},`).join('\n')}\n} from './schema';\n\n`
      : '';

  return hoistClientBridgeQueryInputTypes(`'use client';

// This file is generated by @ontahi/codegen. Do not edit by hand.

import {
${usesCacheRef ? '  cacheRef,\n' : ''}
${usesCreateEntityRef ? '  createEntityRef,\n' : ''}
  defineClientDomainOperation,
  defineClientEntity,
${usesField ? '  field,\n' : ''}
${usesGraphOutput ? '  graphOutput,\n' : ''}
${usesGraphSchema ? '  graphSchema,\n' : ''}
${usesGraphSelection ? '  graphSelection,\n' : ''}
${usesQueryRef ? '  queryRef,\n' : ''}
${usesValue ? '  value,\n' : ''}
} from '@ontahi/core/data-graph';

${schemaImportSection}
${helperSection}
${entityExports}
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
