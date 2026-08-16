const namedDefinitionOrigin = definition =>
  `${definition.kind}:${definition.sourcePath ?? ''}:${definition.declaration}`;

const formatNamedDefinitionOrigin = definition =>
  `${definition.kind === 'entity' ? 'Entity' : 'Value'} ${definition.declaration}${
    definition.sourcePath ? ` (${definition.sourcePath})` : ''
  }`;

export const collectNamedDefinitions = entities => {
  const definitions = [
    ...entities.map(entity => ({
      kind: 'entity',
      name: entity.entityName,
      declaration: entity.importedIdentifier ?? entity.entityExportName ?? entity.entityName,
      sourcePath: entity.sourcePath,
    })),
    ...entities.flatMap(entity =>
      entity.operations.flatMap(operation => operation.namedDefinitions ?? []),
    ),
  ];
  const uniqueOrigins = new Set();
  const definitionsByName = new Map();
  const namedDefinitions = [];
  const diagnostics = [];

  for (const definition of definitions) {
    const origin = namedDefinitionOrigin(definition);
    if (uniqueOrigins.has(origin)) continue;
    uniqueOrigins.add(origin);

    const existing = definitionsByName.get(definition.name);
    if (existing) {
      diagnostics.push({
        code: 'model-name-conflict',
        message: `Model name "${definition.name}" is claimed by ${formatNamedDefinitionOrigin(existing)} and ${formatNamedDefinitionOrigin(definition)}. Reuse one declaration or choose distinct names.`,
        sourcePath: definition.sourcePath,
        declaration: definition.declaration,
      });
      continue;
    }

    definitionsByName.set(definition.name, definition);
    namedDefinitions.push(definition);
  }

  return { namedDefinitions, diagnostics };
};
