import {
  analyzeExportedStringConstant,
  analyzeExportedTaskStep,
  analyzeGraphApiModule,
  analyzeSpecificDomainEntityExport,
} from './operation-contracts/metadata-analyzer.mjs';

const diagnostic = ({ code, message, sourcePath, declaration, importPath }) => ({
  code,
  message,
  sourcePath,
  ...(declaration ? { declaration } : {}),
  ...(importPath ? { importPath } : {}),
});

const emptyApplicationAnalysis = ({ graphApiPath, diagnostics = [] }) => ({
  kind: 'ontahi-application-analysis',
  graph: {
    sourcePath: graphApiPath,
    entities: [],
  },
  entities: [],
  operations: [],
  clientEntities: [],
  tasks: [],
  ingress: [],
  sourcePaths: [],
  diagnostics,
});

const declarationName = (apiExportName, entityExportName) =>
  apiExportName ? `${apiExportName}.entities.${entityExportName}` : entityExportName;

const enrichTaskRuntimeReferences = (task, resolveImportSource) => {
  const taskIdSource = task.taskIdReference
    ? resolveImportSource(task.sourcePath, task.taskIdReference.importPath)
    : undefined;
  const resolvedTaskId = task.taskIdReference
    ? taskIdSource
      ? analyzeExportedStringConstant(
          taskIdSource.sourceText,
          task.taskIdReference.importedIdentifier,
          { sourcePath: taskIdSource.sourcePath },
        ).value
      : undefined
    : undefined;
  const steps = (task.steps ?? []).map(step => {
    const stepSource = resolveImportSource(task.sourcePath, step.importPath);
    const stepAnalysis = stepSource
      ? analyzeExportedTaskStep(stepSource.sourceText, step.importedIdentifier, {
          sourcePath: stepSource.sourcePath,
        })
      : undefined;

    return {
      ...step,
      ...(stepAnalysis?.definition?.id ? { id: stepAnalysis.definition.id } : {}),
    };
  });

  return {
    ...task,
    ...(resolvedTaskId ? { taskId: resolvedTaskId } : {}),
    steps,
  };
};

const toSerializableValue = value => {
  if (Array.isArray(value)) {
    return value.map(toSerializableValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toSerializableValue(item)]),
    );
  }

  return value;
};

export const formatCodegenDiagnostic = item => {
  const location = [item.sourcePath, item.declaration ? `(${item.declaration})` : undefined]
    .filter(Boolean)
    .join(' ');

  return `${location ? `${location}: ` : ''}[${item.code}] ${item.message}`;
};

export const analyzeOntahiApplication = ({ graphApiPath, sourceLoader }) => {
  if (!graphApiPath) {
    throw new Error('analyzeOntahiApplication requires graphApiPath.');
  }
  if (!sourceLoader?.readSource || !sourceLoader?.resolveImportSource) {
    throw new Error(
      'analyzeOntahiApplication requires a sourceLoader with readSource and resolveImportSource.',
    );
  }

  let graphSource;
  try {
    graphSource = sourceLoader.readSource(graphApiPath);
  } catch (error) {
    return emptyApplicationAnalysis({
      graphApiPath,
      diagnostics: [
        diagnostic({
          code: 'graph-source-unresolved',
          message: error instanceof Error ? error.message : String(error),
          sourcePath: graphApiPath,
        }),
      ],
    });
  }

  const sourcePaths = new Set([graphSource.sourcePath]);
  const graphAnalysis = analyzeGraphApiModule(graphSource.sourceText);

  if (!graphAnalysis.definition || graphAnalysis.diagnostics.length > 0) {
    return {
      ...emptyApplicationAnalysis({
        graphApiPath: graphSource.sourcePath,
        diagnostics: graphAnalysis.diagnostics.map(message =>
          diagnostic({
            code: 'graph-declaration-invalid',
            message,
            sourcePath: graphSource.sourcePath,
          }),
        ),
      }),
      sourcePaths: [...sourcePaths],
    };
  }

  const diagnostics = [];
  const entities = [];
  const operations = [];
  const clientEntities = [];
  const tasks = [];
  const ingress = [];
  const graphEntityReferences = [];
  const resolveImportSource = (fromSourcePath, importPath) => {
    const resolved = sourceLoader.resolveImportSource(fromSourcePath, importPath);

    if (resolved?.sourcePath) {
      sourcePaths.add(resolved.sourcePath);
    }

    return resolved;
  };

  for (const entityReference of graphAnalysis.definition.entities) {
    const declaration = declarationName(
      graphAnalysis.definition.apiExportName,
      entityReference.entityExportName,
    );
    const entitySource = resolveImportSource(graphSource.sourcePath, entityReference.importPath);

    graphEntityReferences.push({
      ...entityReference,
      ...(entitySource?.sourcePath ? { sourcePath: entitySource.sourcePath } : {}),
    });

    if (!entitySource) {
      diagnostics.push(
        diagnostic({
          code: 'entity-source-unresolved',
          message: `Could not resolve ${entityReference.importPath}.`,
          sourcePath: graphSource.sourcePath,
          declaration,
          importPath: entityReference.importPath,
        }),
      );
      continue;
    }

    const entityAnalysis = analyzeSpecificDomainEntityExport(
      entitySource.sourceText,
      entityReference.importedIdentifier,
      {
        sourcePath: entitySource.sourcePath,
        resolveImportSource,
      },
    );

    if (!entityAnalysis) {
      entities.push({
        declarationKind: 'graph-reference',
        entityName: entityReference.entityExportName,
        entityExportName: entityReference.entityExportName,
        importedIdentifier: entityReference.importedIdentifier,
        importPath: entityReference.importPath,
        sourcePath: entitySource.sourcePath,
        operations: [],
        tasks: [],
        ingress: [],
      });
      continue;
    }

    if (entityAnalysis.diagnostics.length > 0 || !entityAnalysis.definition) {
      diagnostics.push(
        ...entityAnalysis.diagnostics.map(message =>
          diagnostic({
            code: 'entity-declaration-invalid',
            message,
            sourcePath: entitySource.sourcePath,
            declaration,
            importPath: entityReference.importPath,
          }),
        ),
      );
      continue;
    }

    const definition = {
      declarationKind: entityAnalysis.definition.relation ? 'graph-relation' : 'graph-entity',
      ...entityAnalysis.definition,
      importedIdentifier: entityReference.importedIdentifier,
      importPath: entityReference.importPath,
      sourcePath: entitySource.sourcePath,
    };
    const entityOperations = definition.operations.map(operation => ({
      ...operation,
      entityName: definition.entityName,
      entityExportName: definition.entityExportName,
      sourcePath: definition.sourcePath,
    }));
    const entityTasks = (definition.tasks ?? [])
      .map(task => ({
        ...task,
        entityName: definition.entityName,
        entityExportName: definition.entityExportName,
        sourcePath: definition.sourcePath,
      }))
      .map(task => enrichTaskRuntimeReferences(task, resolveImportSource));
    const entityIngress = (definition.ingress ?? []).map(item => ({
      ...item,
      entityExportName: definition.entityExportName,
      sourcePath: definition.sourcePath,
    }));
    const clientOperations =
      definition.clientOperations ??
      definition.operations.filter(operation => operation.exposure === 'bridge');
    const analyzedEntity = {
      ...definition,
      tasks: entityTasks,
    };

    entities.push(analyzedEntity);
    operations.push(...entityOperations);
    tasks.push(...entityTasks);
    ingress.push(...entityIngress);

    if (clientOperations.length > 0) {
      clientEntities.push({
        ...analyzedEntity,
        operations: clientOperations,
        helperTexts: Array.from(
          new Set(clientOperations.flatMap(operation => operation.helperTexts ?? [])),
        ),
      });
    }
  }

  return toSerializableValue({
    kind: 'ontahi-application-analysis',
    graph: {
      exportName: graphAnalysis.definition.apiExportName,
      sourcePath: graphSource.sourcePath,
      entities: graphEntityReferences,
    },
    entities,
    operations,
    clientEntities,
    tasks,
    ingress,
    sourcePaths: [...sourcePaths].sort(),
    diagnostics,
  });
};
