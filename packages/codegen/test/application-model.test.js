import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  analyzeOntahiApplication,
  analyzeGraphApiModule,
  analyzeSpecificDomainEntityExport,
  createFileSystemSourceLoader,
  formatCodegenDiagnostic,
  renderGeneratedClientEntityModule,
  renderGeneratedTaskDefinitionRegistryModule,
} from '../src/index.mjs';

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  );
});

describe('Ontahi application declaration analysis', () => {
  it('discovers graph entities without application-specific imports', () => {
    const analysis = analyzeGraphApiModule(`
      import { defineGraphApi } from '@ontahi/core/data-graph';
      import { Note } from './note';
      import { Notebook } from './notebook';

      export const ExampleGraphApi = defineGraphApi({
        entities: { Note, Notebook },
      });
    `);

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.definition).toMatchObject({
      apiExportName: 'ExampleGraphApi',
      entities: [
        { importedIdentifier: 'Note', importPath: './note' },
        { importedIdentifier: 'Notebook', importPath: './notebook' },
      ],
    });
  });

  it('discovers entities built inside the ontahi application composition root', () => {
    const analysis = analyzeGraphApiModule(`
      import { ontahi } from '@ontahi/core/runtime/server';
      import { defineNote } from './note';

      export const NotesApplication = ontahi({
        storage,
        entities: app => ({
          Note: defineNote(app),
        }),
      });
    `);

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.definition).toMatchObject({
      apiExportName: 'NotesApplication',
      entities: [
        {
          entityExportName: 'Note',
          importedIdentifier: 'defineNote',
          importPath: './note',
        },
      ],
    });
  });

  it('discovers unified entities registered as an array', () => {
    const analysis = analyzeGraphApiModule(`
      import { ontahi } from '@ontahi/core/runtime/server';
      import { Note } from './note';

      export const NotesApplication = ontahi({
        storage,
        entities: [Note],
      });
    `);

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.definition).toMatchObject({
      apiExportName: 'NotesApplication',
      entities: [
        {
          entityExportName: 'Note',
          importedIdentifier: 'Note',
          importPath: './note',
        },
      ],
    });
  });

  it('projects operations from a unified entity declaration', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity } from '@ontahi/core/entity';

        export const Note = entity({
          name: 'Note',
          fields: {},
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'notes',
          },
          operations: ({ self, operation }) => ({
            list: operation({
              output: graphSchema.array(self),
              bridge: { query: [() => 'all'] },
              run: () => [],
            }),
          }),
        });
      `,
      'Note',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Note',
      entityDefinitionName: 'Note',
      entityDefinitionLocalName: 'NoteSchema',
      operations: [
        {
          name: 'list',
          authority: 'server',
          exposure: 'bridge',
          outputSchemaText: 'graphSchema.array(NoteSchema)',
        },
      ],
    });
  });

  it('projects operation metadata from an embedded Ontahi DSL declaration', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { field, value } from '@ontahi/core/data-graph';
        import { app } from './application';

        const NoteEntity = { name: 'Note' };

        export const Note = app.graph.defineEntity(NoteEntity, {
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'notes',
          },
          domainOperations: {
            create: app.operation.define({
              input: value('CreateNoteInput', { title: field.string() }),
              bridge: { command: true },
              run: input => input,
            }),
          },
        });
      `,
      'Note',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Note',
      entityExportName: 'Note',
      operations: [
        {
          name: 'create',
          authority: 'server',
          exposure: 'bridge',
        },
      ],
    });
  });

  it('projects operation metadata from an exported entity builder', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        const NoteEntity = { name: 'Note' };

        export const defineNote = app =>
          app.graph.defineEntity(NoteEntity, {
            domainOperationDefaults: {
              authority: 'server',
              exposure: 'bridge',
              layer: 'notes',
            },
            domainOperations: {
              list: app.operation.define({
                run: () => [],
              }),
            },
          });
      `,
      'defineNote',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Note',
      entityExportName: 'defineNote',
      operations: [
        {
          name: 'list',
          authority: 'server',
          exposure: 'bridge',
        },
      ],
    });
  });

  it('projects selection input contracts into generated client operations', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { graphSchema, value } from '@ontahi/core/data-graph';
        import { app } from './application';

        const BookEntity = { name: 'Book' };
        const DeleteBooksInput = value('DeleteBooksInput', {
          books: graphSchema.selection(BookEntity, { cardinality: 'many' }),
        });

        export const Book = app.graph.defineEntity(BookEntity, {
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'books',
          },
          domainOperations: {
            deleteBooks: app.operation.define({
              input: DeleteBooksInput,
              output: graphSchema.array(BookEntity),
              run: input => input,
            }),
          },
        });
      `,
      'Book',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition?.operations[0]).toMatchObject({
      name: 'deleteBooks',
      inputSchemaText:
        "value('DeleteBooksInput', {\n          books: graphSchema.selection(BookEntity, { cardinality: 'many' }),\n        })",
      outputSchemaText: 'graphSchema.array(BookEntity)',
    });

    const source = renderGeneratedClientEntityModule({
      entities: [analysis.definition],
    });

    expect(source).toContain('  graphSchema,');
    expect(source).toContain('  value,');
    expect(source).toContain("import { BookEntity } from './schema';");
    expect(source).toMatch(
      /input: value\('DeleteBooksInput', \{\s+books: graphSchema\.selection\(BookEntity, \{ cardinality: 'many' \}\),\s+\}\),/,
    );
    expect(source).toContain('output: graphSchema.array(BookEntity),');
  });

  it('analyzes a filesystem application once into a serializable projection-neutral model', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-application-'));
    const sourceRoot = path.join(directory, 'src');
    const graphApiPath = path.join(sourceRoot, 'graph.ts');
    const noteSourcePath = path.join(sourceRoot, 'domain/note/index.ts');
    const taskSourcePath = path.join(sourceRoot, 'domain/note/archive-task.ts');
    const tagSourcePath = path.join(sourceRoot, 'domain/tag.ts');
    tempDirectories.push(directory);

    await mkdir(path.dirname(noteSourcePath), { recursive: true });
    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Note } from '@/domain/note';
        import { Tag } from '@/domain/tag';

        export const NotesGraphApi = defineGraphApi({
          entities: { Note, Tag },
        });
      `,
      'utf8',
    );
    await writeFile(
      noteSourcePath,
      `
        import { field, value } from '@ontahi/core/data-graph';
        import { app } from '../../application';
        import {
          ArchiveNoteInput,
          ArchiveNoteOutput,
          ArchiveNoteProgress,
          archiveNoteTaskId,
          archiveNoteStep,
          runArchiveNote,
        } from './archive-task';

        const NoteEntity = { name: 'Note' };

        export const Note = app.graph.defineEntity(NoteEntity, {
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'notes',
            durable: { runtime: 'local-workflow' },
          },
          domainOperations: {
            create: app.operation.define({
              input: value('CreateNoteInput', { title: field.string() }),
              output: value('CreateNoteOutput', { id: field.string() }),
              bridge: { command: true },
              run: input => input,
            }),
            archive: app.operation.define({
              input: ArchiveNoteInput,
              output: ArchiveNoteOutput,
              exposure: 'server-only',
              ingress: [
                app.ingress.http({
                  method: 'POST',
                  route: '/notes/archive',
                  provider: 'notes-api',
                  channel: 'notes.archive',
                }),
              ],
              durable: {
                taskId: archiveNoteTaskId,
                progress: ArchiveNoteProgress,
                finalOutput: ArchiveNoteOutput,
                steps: [archiveNoteStep],
              },
              run: runArchiveNote,
            }),
          },
        });
      `,
      'utf8',
    );
    await writeFile(
      taskSourcePath,
      `
        import { field, value } from '@ontahi/core/data-graph';
        import { defineTaskStep } from '@ontahi/core/runtime/server/tasks';

        export const ArchiveNoteInput = value('ArchiveNoteInput', { id: field.string() });
        export const ArchiveNoteOutput = value('ArchiveNoteOutput', { archived: field.boolean() });
        export const ArchiveNoteProgress = value('ArchiveNoteProgress', { percent: field.number() });
        export const archiveNoteTaskId = 'notes.archive';
        const archiveNoteStepId = 'archive-note';
        export const archiveNoteStep = defineTaskStep({ id: archiveNoteStepId });
        export const runArchiveNote = input => input;
      `,
      'utf8',
    );
    await writeFile(tagSourcePath, `export const Tag = { name: 'Tag' };`, 'utf8');

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({
        rootDir: directory,
        aliases: { '@': sourceRoot },
      }),
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.graph).toMatchObject({
      exportName: 'NotesGraphApi',
      sourcePath: graphApiPath,
    });
    expect(analysis.entities).toHaveLength(2);
    expect(analysis.entities.find(entity => entity.entityName === 'Tag')).toMatchObject({
      declarationKind: 'graph-reference',
      operations: [],
    });
    expect(analysis.operations.map(operation => operation.name)).toEqual(['create', 'archive']);
    expect(analysis.clientEntities).toMatchObject([
      {
        entityName: 'Note',
        operations: [{ name: 'create', exposure: 'bridge' }],
      },
    ]);
    expect(analysis.tasks).toMatchObject([
      {
        entityName: 'Note',
        name: 'archive',
        runtime: 'local-workflow',
        taskId: 'notes.archive',
        steps: [{ id: 'archive-note' }],
      },
    ]);
    expect(analysis.ingress).toMatchObject([
      {
        entityName: 'Note',
        operationName: 'archive',
        operationId: 'Note.archive',
      },
    ]);
    expect(analysis.sourcePaths).toEqual(
      [graphApiPath, noteSourcePath, tagSourcePath, taskSourcePath].sort(),
    );
    expect(JSON.parse(JSON.stringify(analysis))).toEqual(analysis);
  });

  it('resolves NodeNext JavaScript import specifiers to TypeScript sources', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-nodenext-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    const noteSourcePath = path.join(directory, 'note.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Note } from './note.js';
        export const NotesGraphApi = defineGraphApi({ entities: { Note } });
      `,
      'utf8',
    );
    await writeFile(noteSourcePath, `export const Note = { name: 'Note' };`, 'utf8');

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.entities).toMatchObject([{ entityName: 'Note' }]);
    expect(analysis.sourcePaths).toEqual([graphApiPath, noteSourcePath].sort());
  });

  it('discovers entities from an Ontahi application declaration', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-application-'));
    const graphApiPath = path.join(directory, 'application.ts');
    const noteSourcePath = path.join(directory, 'note.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineOntahiApplication } from '@ontahi/core/runtime/server';
        import { Note } from './note.js';
        export const NotesApplication = defineOntahiApplication({
          entities: { Note },
          runtime: {},
        });
      `,
      'utf8',
    );
    await writeFile(noteSourcePath, `export const Note = { name: 'Note' };`, 'utf8');

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.entities).toMatchObject([{ entityName: 'Note' }]);
  });

  it('continues past the graph overload of an Ontahi application declaration', () => {
    const analysis = analyzeGraphApiModule(`
      import { defineGraphApi } from '@ontahi/core/data-graph';
      import { defineOntahiApplication } from '@ontahi/core/runtime/server';
      import { Note } from './note';

      export const NotesApplication = defineOntahiApplication({
        graph: NotesGraphApi,
        runtime,
      });

      export const NotesGraphApi = defineGraphApi({
        entities: { Note },
      });
    `);

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.definition).toMatchObject({
      apiExportName: 'NotesGraphApi',
      entities: [{ entityExportName: 'Note', importPath: './note' }],
    });
  });

  it('reports the unsupported graph overload accurately when its graph is not discoverable', () => {
    const analysis = analyzeGraphApiModule(`
      import { defineOntahiApplication } from '@ontahi/core/runtime/server';
      import { NotesGraphApi } from './graph';

      export const NotesApplication = defineOntahiApplication({
        graph: NotesGraphApi,
        runtime,
      });
    `);

    expect(analysis.diagnostics).toEqual([
      'NotesApplication uses defineOntahiApplication({ graph, runtime }), but the referenced graph declaration could not be discovered in this module.',
    ]);
  });

  it('returns declaration-oriented diagnostics for unresolved graph entities', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-diagnostic-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { MissingNote } from './missing-note';
        export const NotesGraphApi = defineGraphApi({ entities: { MissingNote } });
      `,
      'utf8',
    );

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toMatchObject([
      {
        code: 'entity-source-unresolved',
        declaration: 'NotesGraphApi.entities.MissingNote',
        sourcePath: graphApiPath,
        importPath: './missing-note',
      },
    ]);
    expect(formatCodegenDiagnostic(analysis.diagnostics[0])).toContain(
      '(NotesGraphApi.entities.MissingNote): [entity-source-unresolved]',
    );
  });

  it('renders a browser-safe client entity projection', () => {
    const source = renderGeneratedClientEntityModule({
      schemaImportPath: './schema.js',
      entities: [
        {
          entityName: 'Note',
          entityDefinitionName: 'NoteEntity',
          helperTexts: [],
          operations: [
            {
              name: 'find',
              authority: 'server',
              exposure: 'bridge',
              bridgeQueryText: 'input => [input.id]',
            },
          ],
        },
      ],
    });

    expect(source).toContain('// This file is generated by @ontahi/codegen.');
    expect(source).toContain("from './schema.js';");
    expect(source).toContain('export const Note = defineClientEntity(NoteEntity');
    expect(source).toContain('find: defineClientDomainOperation({');
    expect(source).toContain('input: graphSchema.void(),');
    expect(source).not.toContain('input: undefined,');
  });

  it('renders a lightweight task registry projection', () => {
    const source = renderGeneratedTaskDefinitionRegistryModule({
      tasks: [
        {
          kind: 'imported',
          entityName: 'Note',
          name: 'archive',
          importPath: './note-task',
          importedIdentifier: 'archiveNoteTask',
        },
      ],
    });

    expect(source).toContain('// This file is generated by @ontahi/codegen.');
    expect(source).toContain("import {\n  archiveNoteTask,\n} from './note-task';");
    expect(source).toContain('[archiveNoteTask.id, archiveNoteTask as TaskDefinition');
  });
});
