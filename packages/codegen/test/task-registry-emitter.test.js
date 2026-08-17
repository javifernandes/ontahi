import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  createTaskRegistryModuleModel,
  printTaskRegistryModule,
} from '../src/generated-module/task-registry.mjs';
import { renderGeneratedTaskDefinitionRegistryModule } from '../src/projections.mjs';

const summarizeTaskRegistry = source => {
  const sourceFile = ts.createSourceFile(
    'task-registry.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map(statement => ({
      moduleSpecifier: statement.moduleSpecifier.text,
      bindings:
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
          ? statement.importClause.namedBindings.elements.map(element => ({
              importedName: element.propertyName?.text ?? element.name.text,
              localName: element.name.text,
              typeOnly: element.isTypeOnly,
            }))
          : [],
    }));
  const registryDeclaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => declaration.name.getText(sourceFile) === 'taskDefinitions');
  const entries = registryDeclaration?.initializer?.arguments?.[0]?.elements.map(entry =>
    entry.elements.map(element => element.getText(sourceFile)),
  );

  return { imports, entries };
};

describe('semantic task registry emitter', () => {
  it('models and prints an imported-task registry in semantic parity with the legacy renderer', () => {
    const tasks = [
      {
        kind: 'imported',
        entityName: 'Note',
        name: 'archive',
        importPath: './note-task',
        importedIdentifier: 'archiveNoteTask',
      },
    ];

    const result = createTaskRegistryModuleModel({ tasks });

    expect(result).toEqual({
      diagnostics: [],
      model: {
        kind: 'task-definition-registry-module',
        taskImports: [
          {
            moduleSpecifier: './note-task',
            bindings: [
              {
                importedName: 'archiveNoteTask',
                localName: 'archiveNoteTask',
              },
            ],
          },
        ],
        registryEntries: [{ localName: 'archiveNoteTask' }],
      },
    });

    const semanticSource = printTaskRegistryModule(result.model);
    const legacySource = renderGeneratedTaskDefinitionRegistryModule({ tasks });

    expect(summarizeTaskRegistry(semanticSource)).toEqual(summarizeTaskRegistry(legacySource));
    expect(
      ts.createSourceFile(
        'task-registry.ts',
        semanticSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      ).parseDiagnostics,
    ).toEqual([]);
  });

  it('keeps generated tasks outside the first semantic model cut', () => {
    const result = createTaskRegistryModuleModel({
      tasks: [{ kind: 'generated', name: 'archive' }],
    });

    expect(result).toEqual({
      diagnostics: ['Semantic task registry emission does not support generated tasks yet.'],
    });
  });
});
