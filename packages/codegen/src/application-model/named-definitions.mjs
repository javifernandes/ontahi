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
  // A shared Value may first appear on a server-only Operation. Keep the portable projection
  // discovered by a client-visible use, rather than re-emitting the server resolver expression.
  const portableDefinitions = new Map(
    definitions
      .filter(definition => definition.variantInputs?.length)
      .map(definition => [namedDefinitionOrigin(definition), definition]),
  );

  for (const candidate of definitions) {
    const origin = namedDefinitionOrigin(candidate);
    const definition = portableDefinitions.get(origin) ?? candidate;
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
