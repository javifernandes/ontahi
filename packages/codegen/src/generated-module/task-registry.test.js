import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { assertGeneratedModuleTypechecks } from '../../test/support/generated-module.js';
import { renderGeneratedTaskDefinitionRegistryModule } from '../projections.mjs';

import {
  createTaskRegistryModuleModel,
  renderSemanticTaskDefinitionRegistryModule,
} from './task-registry.mjs';

const summarizeTaskRegistry = source => {
  const sourceFile = ts.createSourceFile(
    'task-registry.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = sourceFile.statements.filter(ts.isImportDeclaration).map(statement => ({
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
  const generatedTasks = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .filter(
      declaration =>
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        declaration.initializer.expression.getText(sourceFile) === 'defineTask',
    )
    .map(declaration => ({
      localName: declaration.name.getText(sourceFile),
      properties: declaration.initializer.arguments[0].properties.map(property => ({
        name: property.name.getText(sourceFile),
        value: property.initializer.getText(sourceFile),
      })),
    }));
  const entries = registryDeclaration?.initializer?.arguments?.[0]?.elements.map(entry =>
    entry.elements.map(element => element.getText(sourceFile)),
  );

  return { imports, generatedTasks, entries };
};

describe('semantic task registry emitter', () => {
  it('models and prints an imported-task registry through the public semantic renderer', () => {
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
        generatedTasks: [],
        registryEntries: [{ localName: 'archiveNoteTask' }],
      },
    });

    const semanticSource = renderSemanticTaskDefinitionRegistryModule({ tasks });
    const publicSource = renderGeneratedTaskDefinitionRegistryModule({ tasks });

    expect(summarizeTaskRegistry(semanticSource)).toEqual(summarizeTaskRegistry(publicSource));
    expect(publicSource).toBe(semanticSource);
    expect(renderSemanticTaskDefinitionRegistryModule({ tasks })).toBe(semanticSource);
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

  it('models and prints generated task contracts through the public semantic renderer', () => {
    const tasks = [
      {
        kind: 'generated',
        entityName: 'Note',
        name: 'archive',
        taskId: 'notes.archive',
        input: { importPath: './archive-task', importedIdentifier: 'ArchiveNoteInput' },
        progress: { importPath: './archive-task', importedIdentifier: 'ArchiveNoteProgress' },
        finalOutput: { importPath: './archive-task', importedIdentifier: 'ArchiveNoteOutput' },
        run: { importPath: './archive-task', importedIdentifier: 'runArchiveNote' },
        steps: [{ importPath: './archive-task', importedIdentifier: 'archiveNoteStep' }],
      },
    ];
    const result = createTaskRegistryModuleModel({
      tasks,
    });

    expect(result).toEqual({
      diagnostics: [],
      model: {
        kind: 'task-definition-registry-module',
        taskImports: [
          {
            moduleSpecifier: './archive-task',
            bindings: [
              { importedName: 'ArchiveNoteInput', localName: 'ArchiveNoteInput' },
              { importedName: 'ArchiveNoteProgress', localName: 'ArchiveNoteProgress' },
              { importedName: 'ArchiveNoteOutput', localName: 'ArchiveNoteOutput' },
              { importedName: 'runArchiveNote', localName: 'runArchiveNote' },
              { importedName: 'archiveNoteStep', localName: 'archiveNoteStep' },
            ],
          },
        ],
        generatedTasks: [
          {
            localName: 'NoteArchiveTaskDefinition',
            taskId: { kind: 'string', value: 'notes.archive' },
            inputLocalName: 'ArchiveNoteInput',
            progressLocalName: 'ArchiveNoteProgress',
            outputLocalName: 'ArchiveNoteOutput',
            stepLocalNames: ['archiveNoteStep'],
            runLocalName: 'runArchiveNote',
          },
        ],
        registryEntries: [{ localName: 'NoteArchiveTaskDefinition' }],
      },
    });

    const semanticSource = renderSemanticTaskDefinitionRegistryModule({ tasks });
    const publicSource = renderGeneratedTaskDefinitionRegistryModule({ tasks });

    expect(summarizeTaskRegistry(semanticSource)).toEqual(summarizeTaskRegistry(publicSource));
  });

  it('preserves imported task-id references and deterministic generated-name collisions', () => {
    const tasks = [
      {
        kind: 'imported',
        entityName: 'Existing',
        name: 'archive',
        importPath: './existing-task',
        importedIdentifier: 'NoteArchiveTaskDefinition',
      },
      {
        kind: 'generated',
        entityName: 'Note',
        name: 'archive',
        taskIdReference: {
          importPath: './archive-task',
          importedIdentifier: 'archiveNoteTaskId',
        },
        input: { importPath: './archive-task', importedIdentifier: 'ArchiveNoteInput' },
        run: { importPath: './archive-task', importedIdentifier: 'runArchiveNote' },
        steps: [{ importPath: './archive-task', importedIdentifier: 'archiveNoteStep' }],
      },
    ];

    const result = createTaskRegistryModuleModel({ tasks });

    expect(result.diagnostics).toEqual([]);
    expect(result.model.generatedTasks).toEqual([
      {
        localName: 'NoteArchiveTaskDefinition2',
        taskId: { kind: 'identifier', localName: 'archiveNoteTaskId' },
        inputLocalName: 'ArchiveNoteInput',
        progressLocalName: undefined,
        outputLocalName: undefined,
        runLocalName: 'runArchiveNote',
        stepLocalNames: ['archiveNoteStep'],
      },
    ]);
    expect(result.model.registryEntries).toEqual([
      { localName: 'NoteArchiveTaskDefinition' },
      { localName: 'NoteArchiveTaskDefinition2' },
    ]);

    expect(summarizeTaskRegistry(renderSemanticTaskDefinitionRegistryModule({ tasks }))).toEqual(
      summarizeTaskRegistry(renderGeneratedTaskDefinitionRegistryModule({ tasks })),
    );
  });

  it('emits a generated-task registry that passes semantic TypeScript validation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-task-registry-typecheck-'));

    try {
      const modulePath = path.join(directory, 'task-registry.mjs');
      const coreTasksPath = path.resolve(
        import.meta.dirname,
        '../../../core/dist/runtime/server/tasks.js',
      );
      const relativeCoreTasksPath = path
        .relative(directory, coreTasksPath)
        .replaceAll(path.sep, '/');
      const coreTasksSpecifier = relativeCoreTasksPath.startsWith('.')
        ? relativeCoreTasksPath
        : `./${relativeCoreTasksPath}`;
      const source = renderSemanticTaskDefinitionRegistryModule({
        tasks: [
          {
            kind: 'generated',
            entityName: 'Note',
            name: 'archive',
            taskId: 'notes.archive',
            input: { importPath: './archive-task', importedIdentifier: 'ArchiveNoteInput' },
            progress: {
              importPath: './archive-task',
              importedIdentifier: 'ArchiveNoteProgress',
            },
            finalOutput: {
              importPath: './archive-task',
              importedIdentifier: 'ArchiveNoteOutput',
            },
            run: { importPath: './archive-task', importedIdentifier: 'runArchiveNote' },
            steps: [{ importPath: './archive-task', importedIdentifier: 'archiveNoteStep' }],
          },
        ],
      })
        .replace('"server-only"', '"./server-only.js"')
        .replace('"@ontahi/core/runtime/server/tasks"', JSON.stringify(coreTasksSpecifier));

      await writeFile(path.join(directory, 'server-only.ts'), 'export {};', 'utf8');
      await writeFile(
        path.join(directory, 'archive-task.ts'),
        `
          export const ArchiveNoteInput = {} as any;
          export const ArchiveNoteProgress = {} as any;
          export const ArchiveNoteOutput = {} as any;
          export const archiveNoteStep = {} as any;
          export const runArchiveNote = (() => undefined) as any;
        `,
        'utf8',
      );

      await expect(
        assertGeneratedModuleTypechecks({
          modulePath,
          source,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
          },
        }),
      ).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
