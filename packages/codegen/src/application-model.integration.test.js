import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { importGeneratedModule } from './generated-module/generated-module.test-support.js';
import {
  analyzeOntahiApplication,
  analyzeGraphApiModule,
  analyzeSpecificDomainEntityExport,
  createFileSystemSourceLoader,
  formatCodegenDiagnostic,
  renderGeneratedClientEntityModule,
  renderGeneratedOperationConditionRegistryModule,
  renderGeneratedTaskDefinitionRegistryModule,
} from './index.mjs';

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  );
});

describe('Ontahi application declaration analysis', () => {
  it('inventories one imported Value declaration reused by multiple Operations', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-nominal-reuse-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Note } from './note';
        import { Task } from './task';

        export const WorkGraph = defineGraphApi({ entities: { Note, Task } });
      `,
      'utf8',
    );
    await writeFile(
      path.join(directory, 'shared-output.ts'),
      `
        import { field, value } from '@ontahi/core/data-graph';

        export const SharedOutput = value('SharedOutput', { id: field.id() });
      `,
      'utf8',
    );
    for (const [name, operationName] of [
      ['Note', 'create'],
      ['Task', 'schedule'],
    ]) {
      await writeFile(
        path.join(directory, `${name.toLowerCase()}.ts`),
        `
          import { entity, field } from '@ontahi/core/entity';
          import { SharedOutput } from './shared-output';

          export const ${name} = entity({
            name: '${name}',
            fields: { id: field.id() },
            domainOperationDefaults: {
              authority: 'server',
              exposure: 'bridge',
              layer: 'work',
            },
            operations: ({ operation }) => ({
              ${operationName}: operation({ output: SharedOutput, run: input => input }),
            }),
          });
        `,
        'utf8',
      );
    }

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.namedDefinitions).toEqual([
      expect.objectContaining({ kind: 'entity', name: 'Note' }),
      expect.objectContaining({ kind: 'entity', name: 'Task' }),
      expect.objectContaining({
        kind: 'value',
        name: 'SharedOutput',
        declaration: 'SharedOutput',
        sourcePath: path.join(directory, 'shared-output.ts'),
      }),
    ]);
  });

  it('rejects distinct Value declarations with the same nominal name', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-nominal-conflict-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    const noteSourcePath = path.join(directory, 'note.ts');
    const taskSourcePath = path.join(directory, 'task.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Note } from './note';
        import { Task } from './task';

        export const WorkGraph = defineGraphApi({ entities: { Note, Task } });
      `,
      'utf8',
    );
    for (const name of ['Note', 'Task']) {
      await writeFile(
        path.join(directory, `${name.toLowerCase()}.ts`),
        `
          import { entity, field, value } from '@ontahi/core/entity';

          const Output = value('SharedOutput', { ${name.toLowerCase()}: field.id() });

          export const ${name} = entity({
            name: '${name}',
            fields: { id: field.id() },
            domainOperationDefaults: {
              authority: 'server',
              exposure: 'bridge',
              layer: 'work',
            },
            operations: ({ operation }) => ({
              run: operation({ output: Output, run: input => input }),
            }),
          });
        `,
        'utf8',
      );
    }

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([
      {
        code: 'model-name-conflict',
        sourcePath: taskSourcePath,
        declaration: 'Output',
        message: `Model name "SharedOutput" is claimed by Value Output (${noteSourcePath}) and Value Output (${taskSourcePath}). Reuse one declaration or choose distinct names.`,
      },
    ]);
    expect(
      analysis.namedDefinitions
        .filter(definition => definition.name === 'SharedOutput')
        .map(({ kind, name, declaration, sourcePath }) => ({
          kind,
          name,
          declaration,
          sourcePath,
        })),
    ).toEqual([
      {
        kind: 'value',
        name: 'SharedOutput',
        declaration: 'Output',
        sourcePath: noteSourcePath,
      },
    ]);
  });

  it('rejects an Entity and Value that claim the same nominal name', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-cross-kind-conflict-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Trip } from './trip';

        export const TripsGraph = defineGraphApi({ entities: { Trip } });
      `,
      'utf8',
    );
    await writeFile(
      path.join(directory, 'trip.ts'),
      `
        import { entity, field, value } from '@ontahi/core/entity';

        const TripOutput = value('Trip', { id: field.id() });

        export const Trip = entity({
          name: 'Trip',
          fields: { id: field.id() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'trips',
          },
          operations: ({ operation }) => ({
            available: operation({ output: TripOutput, run: input => input }),
          }),
        });
      `,
      'utf8',
    );

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'model-name-conflict',
        declaration: 'TripOutput',
        message: expect.stringMatching(/Entity.*Value|Value.*Entity/),
      }),
    );
  });

  it('discovers entities from a transitional application registry batch', () => {
    const analysis = analyzeGraphApiModule(`
      import { Note } from './note';
      import { Notebook } from './notebook';

      export const NotesApplication = application.registerBoundEntities({
        ...application.graph.entities,
        Note,
        Notebook,
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
        {
          entityExportName: 'Notebook',
          importedIdentifier: 'Notebook',
          importPath: './notebook',
        },
      ],
    });
  });

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

  it('rejects syntactically invalid graph source before analyzing recovered declarations', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-invalid-graph-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Note } from './note';

        export const NotesGraph = defineGraphApi({ entities: { Note } });
        export const Invalid = {
      `,
      'utf8',
    );

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([
      {
        code: 'graph-declaration-invalid',
        message: expect.stringMatching(/^Invalid TypeScript source at \d+:\d+: /),
        sourcePath: graphApiPath,
      },
    ]);
    expect(analysis.entities).toEqual([]);
  });

  it('rejects syntactically invalid entity source before analyzing its recovered declaration', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-invalid-entity-'));
    const graphApiPath = path.join(directory, 'graph.ts');
    const noteSourcePath = path.join(directory, 'note.ts');
    tempDirectories.push(directory);

    await writeFile(
      graphApiPath,
      `
        import { defineGraphApi } from '@ontahi/core/data-graph';
        import { Note } from './note';

        export const NotesGraph = defineGraphApi({ entities: { Note } });
      `,
      'utf8',
    );
    await writeFile(
      noteSourcePath,
      `
        import { entity, field } from '@ontahi/core/entity';

        export const Note = entity({
          name: 'Note',
          fields: { id: field.id() },
        });
        export const Invalid = {
      `,
      'utf8',
    );

    const analysis = analyzeOntahiApplication({
      graphApiPath,
      sourceLoader: createFileSystemSourceLoader({ rootDir: directory }),
    });

    expect(analysis.diagnostics).toEqual([
      {
        code: 'entity-declaration-invalid',
        declaration: 'NotesGraph.entities.Note',
        importPath: './note',
        message: expect.stringMatching(/^Invalid TypeScript source at \d+:\d+: /),
        sourcePath: noteSourcePath,
      },
    ]);
    expect(analysis.entities).toEqual([]);
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

  it('projects atomic operations from unified and public factory declarations', async () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity } from '@ontahi/core/entity';
        import { defineDomainOperation } from '@ontahi/core/runtime/server';

        export const Note = entity({
          name: 'Note',
          fields: {},
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'notes',
          },
          operations: ({ self, operation }) => ({
            list: operation.atomic({
              input: graphSchema.object({ notes: self.many() }),
              output: self.array(),
              bridge: { query: [() => 'all'] },
              run: () => [],
            }),
            archive: defineDomainOperation.atomic({
              run: () => undefined,
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
      entitySchemaProjection: {
        name: 'Note',
        fieldsText: '{}',
      },
      operations: [
        {
          name: 'list',
          authority: 'server',
          exposure: 'bridge',
          execution: { atomicity: 'required' },
          inputSchemaText: 'graphSchema.object({ notes: NoteSchema.many() })',
          outputSchemaText: 'NoteSchema.array()',
        },
        {
          name: 'archive',
          authority: 'server',
          exposure: 'bridge',
          execution: { atomicity: 'required' },
        },
      ],
    });

    const source = renderGeneratedClientEntityModule({
      entities: [analysis.definition],
      operationContracts: 'selection',
    });

    expect(source).toContain('input: graphSchema.object({ notes: NoteSchema.many() }),');
    expect(source).not.toContain('output: NoteSchema.array(),');

    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-atomic-operation-'));
    tempDirectories.push(directory);
    const generated = await importGeneratedModule({ directory, source });

    expect(generated.Note.domain.list.execution).toEqual({ atomicity: 'required' });
    expect(generated.Note.domain.archive.execution).toEqual({ atomicity: 'required' });
  }, 30_000);

  it('preserves existing Ref input semantics in generated client operations', async () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity } from '@ontahi/core/entity';

        export const Note = entity({
          name: 'Note',
          fields: { id: field.id(), title: field.string() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'notes',
          },
          operations: ({ self, operation }) => ({
            inspect: operation({
              input: graphSchema.object({ note: graphSchema.existingRef(self) }),
              run: ({ note }) => note,
            }),
          }),
        });
      `,
      'Note',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition?.operations[0]).toMatchObject({
      name: 'inspect',
      inputSchemaText: 'graphSchema.object({ note: graphSchema.existingRef(NoteSchema) })',
    });

    const source = renderGeneratedClientEntityModule({
      entities: [analysis.definition],
      operationConditionsImportPath: './unused-operation-conditions.js',
    });
    expect(source).toContain(
      'input: graphSchema.object({ note: graphSchema.existingRef(NoteSchema) }),',
    );
    expect(source).not.toContain('unused-operation-conditions');

    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-existing-ref-'));
    tempDirectories.push(directory);
    const generated = await importGeneratedModule({ directory, source });

    expect(generated.Note.domain.inspect.input.fields.note).toMatchObject({
      fieldType: 'reference',
      referenceRequirement: 'existing',
      target: { name: 'Note' },
    });
  }, 30_000);

  it('compiles named Operation conditions from real Ref input schemas without executing them', async () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity } from '@ontahi/core/entity';

        export const Course = entity({
          name: 'Course',
          fields: { id: field.id() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'classroom',
          },
          operations: ({ self, operation }) => ({
            transfer: operation.atomic({
              input: graphSchema.object({
                previousCourse: graphSchema.existingRef(self),
                nextCourse: graphSchema.existingRef(self),
              }),
              contracts: {
                pre: {
                  differentCourses: ({ previousCourse, nextCourse }) =>
                    !previousCourse.is(nextCourse),
                },
              },
              run: () => undefined,
            }),
          }),
        });
      `,
      'Course',
      { sourcePath: '/examples/classroom/src/classroom.ts' },
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition?.operations[0]).toMatchObject({
      name: 'transfer',
      conditions: {
        pre: [
          {
            name: 'differentCourses',
            expression: {
              version: 1,
              expression: {
                kind: 'not',
                operand: {
                  kind: 'ref-identity',
                  operator: 'is',
                  left: { kind: 'input-ref', input: 'previousCourse' },
                  right: { kind: 'input-ref', input: 'nextCourse' },
                },
              },
            },
          },
        ],
      },
    });

    const operation = { ...analysis.definition.operations[0], entityName: 'Course' };
    const registrySource = renderGeneratedOperationConditionRegistryModule({
      operations: [operation],
    });
    const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-codegen-operation-conditions-'));
    tempDirectories.push(directory);
    const generatedRegistry = await importGeneratedModule({ directory, source: registrySource });
    expect(generatedRegistry.operationConditions.operations['Course.transfer']).toEqual({
      pre: [
        expect.objectContaining({
          id: 'Course.transfer.pre.differentCourses',
          dependencies: [
            { kind: 'input-ref', input: 'previousCourse' },
            { kind: 'input-ref', input: 'nextCourse' },
          ],
        }),
      ],
    });

    const clientSource = renderGeneratedClientEntityModule({
      entities: [analysis.definition],
      operationConditionsImportPath: './operation-conditions.js',
    });
    expect(clientSource).toContain(
      "import { operationConditions } from './operation-conditions.js';",
    );
    expect(clientSource).toContain(
      "conditions: operationConditions.operations['Course.transfer'],",
    );
  }, 30_000);

  it('locates unsupported portable condition syntax in the author source', () => {
    const sourcePath = '/examples/classroom/src/classroom.ts';
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity } from '@ontahi/core/entity';

        export const Course = entity({
          name: 'Course',
          fields: { id: field.id() },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'classroom',
          },
          operations: ({ self, operation }) => ({
            transfer: operation({
              input: graphSchema.object({
                previousCourse: graphSchema.existingRef(self),
                nextCourse: graphSchema.existingRef(self),
              }),
              contracts: {
                pre: {
                  differentCourses: ({ previousCourse, nextCourse }) =>
                    previousCourse.id !== nextCourse.id,
                },
              },
              run: () => undefined,
            }),
          }),
        });
      `,
      'Course',
      { sourcePath },
    );

    expect(analysis?.definition?.operations).toEqual([]);
    expect(analysis?.diagnostics).toEqual([
      expect.stringMatching(
        new RegExp(
          `^${sourcePath.replaceAll('/', '\\/')}:\\d+:\\d+ \\[model_expression_unsupported_operator\\]`,
        ),
      ),
    ]);
  });

  it('projects a schema-only unified entity', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity } from '@ontahi/core/entity';

        export const Comment = entity({
          name: 'Comment',
          fields: { id: field.id(), body: field.string() },
          locators: { refById: 'id' },
          identity: 'refById',
        });
      `,
      'Comment',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Comment',
      entityDefinitionName: 'Comment',
      entityDefinitionLocalName: 'CommentSchema',
      entitySchemaProjection: {
        name: 'Comment',
        fieldsText: '{ id: field.id(), body: field.string() }',
      },
      operations: [],
    });
  });

  it('projects operations through an opaque operation group boundary', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity, operationGroup } from '@ontahi/core/runtime/server';

        const NoteOutput = graphSchema.object({ id: graphSchema.string() });
        const ArchiveNoteInput = graphSchema.object({ id: graphSchema.string() });

        const defineNoteOperations = app => ({
          list: app.operation.define({
            output: graphSchema.array(NoteOutput),
            bridge: { query: [() => 'all'] },
            run: () => [],
          }),
          archive: app.operation.define({
            input: ArchiveNoteInput,
            bridge: { invalidate: [['Note']] },
            run: () => ({ archived: true }),
          }),
        });

        const NoteOperations = operationGroup(
          ['list', 'archive'],
          defineNoteOperations,
        );

        export const Note = entity({
          name: 'Note',
          fields: {},
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'notes',
          },
          operations: ({ app }) => NoteOperations(app),
        });
      `,
      'Note',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition.operations).toMatchObject([
      { name: 'list', outputSchemaText: 'graphSchema.array(NoteOutput)' },
      {
        name: 'archive',
        inputSchemaText: 'graphSchema.object({ id: graphSchema.string() })',
      },
    ]);
  });

  it('projects nominal semantic relation references from unified entities', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entity, relation } from '@ontahi/core/runtime/server';

        export const Folder = entity({
          name: 'Folder',
          fields: { id: field.id() },
          relations: {
            entries: relation.hasMany(entity.ref('FolderEntry'), { via: 'folderId' }),
          },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
          },
          operations: ({ operation }) => ({
            list: operation({ bridge: {}, run: () => [] }),
          }),
        });
      `,
      'Folder',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition.entitySchemaProjection?.relations).toEqual([
      {
        name: 'entries',
        kind: 'hasMany',
        targetName: 'FolderEntry',
        via: 'folderId',
        deferred: true,
      },
    ]);
  });

  it('inlines imported field declarations into browser schema projections', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { SharedFields } from './shared-fields';
        import { entity } from '@ontahi/core/entity';

        export const Note = entity({
          name: 'Note',
          fields: SharedFields,
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
          },
          operations: ({ operation }) => ({
            list: operation({
              bridge: {},
              run: () => [],
            }),
          }),
        });
      `,
      'Note',
      {
        sourcePath: '/app/note.ts',
        resolveImportSource: (_sourcePath, importPath) =>
          importPath === './shared-fields'
            ? {
                sourcePath: '/app/shared-fields.ts',
                sourceText: `
                  import { field } from '@ontahi/core/data-graph';
                  export const SharedFields = {
                    id: field.id(),
                    title: field.string(),
                  };
                `,
              }
            : undefined,
      },
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition.entitySchemaProjection?.fieldsText).toContain('id: field.id()');
    expect(analysis?.definition.entitySchemaProjection?.fieldsText).toContain(
      'title: field.string()',
    );
    expect(analysis?.definition.entitySchemaProjection?.fieldsText).not.toBe('SharedFields');
  });

  it('discovers semantic reference fields in unified entities', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { TodoList } from './todo-list';
        import { entity } from '@ontahi/core/entity';

        const TodoFields = {
          id: field.id(),
          list: field.ref(TodoList),
        };

        export const Todo = entity({
          name: 'Todo',
          fields: TodoFields,
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
          },
          operations: ({ operation }) => ({
            list: operation({ bridge: {}, run: () => [] }),
          }),
        });
      `,
      'Todo',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition.entitySchemaProjection?.referenceFields).toEqual([
      {
        name: 'list',
        targetName: 'TodoList',
        targetImportPath: './todo-list',
      },
    ]);
  });

  it('projects an imported entity schema for a deferred server binder', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { NoteEntity } from './note-schema';

        export const NoteModule = entityModule({
          entity: NoteEntity,
          bind: app => app.graph.defineEntity(NoteEntity, {
            domainOperationDefaults: {
              authority: 'server',
              exposure: 'bridge',
            },
            domainOperations: {
              list: app.operation.define({
                bridge: {},
                run: () => [],
              }),
            },
          }),
        });
      `,
      'NoteModule',
      {
        sourcePath: '/app/note.ts',
        resolveImportSource: (_sourcePath, importPath) =>
          importPath === './note-schema'
            ? {
                sourcePath: '/app/note-schema.ts',
                sourceText: `
                  import { field } from '@ontahi/core/data-graph';
                  import { entity } from '@ontahi/core/entity';

                  export const NoteEntity = entity({
                    name: 'Note',
                    fields: { id: field.id(), title: field.string() },
                    display: { primary: 'title' },
                    locators: { byId: 'id' },
                    identity: 'byId',
                  });
                `,
              }
            : undefined,
      },
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Note',
      entitySchemaProjection: {
        name: 'Note',
        fieldsText: '{ id: field.id(), title: field.string() }',
        displayText: "{ primary: 'title' }",
        locatorsText: "{ byId: 'id' }",
        identityText: "'byId'",
      },
    });
  });

  it('projects operations from a transitionally registered bound entity', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        export const Note = application.registerBoundEntity(
          NoteEntity,
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
          }),
        );
      `,
      'Note',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Note',
      entityDefinitionName: 'NoteEntity',
      operations: [
        {
          name: 'list',
          authority: 'server',
          exposure: 'bridge',
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
        import { BookEntity } from '@/features/books/schema';

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
    expect(analysis?.definition).toMatchObject({
      entityDefinitionImportPath: '@/features/books/schema',
    });

    const source = renderGeneratedClientEntityModule({
      entities: [analysis.definition],
    });

    expect(source).toContain('  graphSchema,');
    expect(source).toContain('  value,');
    expect(source).toContain('import { BookEntity } from "@/features/books/schema";');
    expect(source).toMatch(
      /input: value\('DeleteBooksInput', \{\s+books: graphSchema\.selection\(BookEntity, \{ cardinality: 'many' \}\),\s+\}\),/,
    );
    expect(source).toContain('output: graphSchema.array(BookEntity),');
  });

  it('analyzes domain operations declared from bound entity values', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { app } from './application';
        import { BookEntity } from './schema';

        export const Book = app.graph.defineEntity(BookEntity, {
          values: {
            bySlug: valueRef((slug: string) => [slug]),
          },
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'bridge',
            layer: 'books',
          },
          domainOperations: ({ values }) => ({
            findBySlug: app.operation.define({
              cache: {
                value: input => values.bySlug(input.slug),
              },
              run: input => input,
            }),
          }),
        });
      `,
      'Book',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Book',
      operations: [
        {
          name: 'findBySlug',
          authority: 'server',
          exposure: 'bridge',
        },
      ],
    });
  });

  it('analyzes domain operations behind a deferred entity module binder', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entityModuleWithCapabilities } from '@ontahi/core/runtime/server';
        import { TaskRunEntity } from './schema';

        const selectCapabilities = app => ({ require: app.require });
        const defineTaskRunOperations = (app, capabilities) => ({
          getMine: app.operation.define({
            bridge: {
              query: [input => input.taskId],
            },
            requires: [capabilities.require.authRequired()],
            run: input => input,
          }),
        });
        const bindTaskRun = (app, capabilities) =>
          app.graph.defineEntity(TaskRunEntity, {
            domainOperationDefaults: {
              authority: 'server',
              exposure: 'bridge',
            },
            domainOperations: defineTaskRunOperations(app, capabilities),
          });

        export const TaskRunModule = entityModuleWithCapabilities<
          typeof TaskRunEntity,
          ReturnType<typeof bindTaskRun>,
          {},
          ReturnType<typeof selectCapabilities>
        >({
          entity: TaskRunEntity,
          capabilities: selectCapabilities,
          bind: bindTaskRun,
        });
      `,
      'TaskRunModule',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'TaskRun',
      operations: [
        {
          name: 'getMine',
          authority: 'server',
          exposure: 'bridge',
        },
      ],
    });
  });

  it('analyzes a deferred entity module whose binder returns a local entity declaration', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { entityModuleWithCapabilities } from '@ontahi/core/runtime/server';
        import { BookEntity } from './schema';

        const bindBook = app => {
          const listOperation = app.operation.define({
            run: () => [],
          });
          const Book = app.graph.defineEntity(BookEntity, {
            domainOperationDefaults: {
              authority: 'server',
              exposure: 'bridge',
            },
            domainOperations: {
              list: listOperation,
            },
          });

          return Book;
        };

        export const BookModule = entityModuleWithCapabilities({
          entity: BookEntity,
          capabilities: () => ({}),
          bind: bindBook,
        });
      `,
      'BookModule',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'Book',
      operations: [{ name: 'list' }],
    });
  });

  it('analyzes domain operations behind a deferred relation module binder', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
        import { relationModule } from '@ontahi/core/runtime/server';
        import { BookWithCollaboratorsEntity } from './schema';

        export const BookCollaboratorsModule = relationModule({
          name: 'BookCollaborators',
          bind: app =>
            app.graph.defineRelation(BookWithCollaboratorsEntity, 'collaborators', {
              entityName: 'BookCollaborators',
              domainOperationDefaults: {
                authority: 'server',
                exposure: 'bridge',
              },
              domainOperations: {
                invite: app.operation.define({
                  run: input => input,
                }),
              },
            }),
        });
      `,
      'BookCollaboratorsModule',
    );

    expect(analysis?.diagnostics).toEqual([]);
    expect(analysis?.definition).toMatchObject({
      entityName: 'BookCollaborators',
      relation: {
        sourceName: 'Book',
        relationName: 'collaborators',
      },
      operations: [
        {
          name: 'invite',
          authority: 'server',
          exposure: 'bridge',
        },
      ],
    });
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
    expect(source).toContain('from "./schema.js";');
    expect(source).toContain('export const Note = defineClientEntity(NoteEntity');
    expect(source).toContain('find: defineClientDomainOperation({');
  });

  it('avoids named Value bindings that collide with imported entity bindings', () => {
    const namedValue = {
      kind: 'value',
      name: 'TripListItem',
      declaration: 'TripListItem',
      sourcePath: '/app/trip-list-item.ts',
      schemaText: "value('TripListItem', { id: field.id() })",
    };
    const source = renderGeneratedClientEntityModule({
      schemaImportPath: './schema.js',
      namedDefinitions: [namedValue],
      entities: [
        {
          entityName: 'Trip',
          entityDefinitionName: 'TripListItemEntity',
          entityDefinitionLocalName: 'TripListItemValue',
          helperTexts: [],
          operations: [
            {
              name: 'available',
              authority: 'server',
              exposure: 'bridge',
              outputSchemaText: namedValue.schemaText,
              outputNamedDefinition: namedValue,
            },
          ],
        },
      ],
    });

    expect(source).toContain(
      'import { TripListItemEntity as TripListItemValue } from "./schema.js";',
    );
    expect(source).toContain("const TripListItemValue2 = value('TripListItem'");
    expect(source).toContain('output: TripListItemValue2,');
  });

  it('renders a self-contained browser entity schema projection', () => {
    const source = renderGeneratedClientEntityModule({
      entities: [
        {
          entityName: 'Note',
          entityExportName: 'Note',
          entityDefinitionName: 'Note',
          entityDefinitionLocalName: 'NoteSchema',
          entitySchemaProjection: {
            name: 'Note',
            fieldsText: '{ id: field.id(), title: field.string() }',
            displayText: "{ primary: 'title' }",
            locatorsText: "{ byId: 'id' }",
            identityText: "'byId'",
          },
          helperTexts: [],
          operations: [
            {
              name: 'find',
              authority: 'server',
              exposure: 'bridge',
            },
          ],
        },
      ],
    });

    expect(source).toContain('entity as defineEntitySchema');
    expect(source).toContain(
      'export const NoteSchema = defineEntitySchema("Note", { id: field.id(), title: field.string() })',
    );
    expect(source).toContain(".display({ primary: 'title' })");
    expect(source).toContain(".locators({ byId: 'id' })");
    expect(source).toContain(".identity('byId')");
    expect(source).toContain('export const Note = defineClientEntity(NoteSchema');
    expect(source).not.toMatch(/from ['"]\.\/schema['"]/);
  });

  it('rewrites semantic entity names in graph outputs to browser projections', () => {
    const source = renderGeneratedClientEntityModule({
      entities: [
        {
          entityName: 'CommentMessage',
          entityExportName: 'CommentMessage',
          entityDefinitionName: 'CommentMessage',
          entityDefinitionLocalName: 'CommentMessageSchema',
          entitySchemaProjection: {
            name: 'CommentMessage',
            fieldsText: '{ id: field.id() }',
          },
          helperTexts: [],
          operations: [],
        },
        {
          entityName: 'CommentThread',
          entityExportName: 'CommentThread',
          entityDefinitionName: 'CommentThread',
          entityDefinitionLocalName: 'CommentThreadSchema',
          entitySchemaProjection: {
            name: 'CommentThread',
            fieldsText: '{ id: field.id() }',
          },
          helperTexts: [],
          operations: [
            {
              name: 'list',
              authority: 'server',
              exposure: 'bridge',
              graphOutputText:
                'graphOutput.array(graphOutput.entity(CommentThreadSchema, { messages: graphOutput.array(graphOutput.entity(CommentMessage)) }))',
            },
          ],
        },
      ],
    });

    expect(source).toContain('graphOutput.entity(CommentThreadSchema');
    expect(source).toContain('graphOutput.entity(CommentMessageSchema)');
    expect(source).not.toMatch(/from ['"]\.\/schema\.js['"]/);
  });

  it('rewrites semantic entity names in operation schemas to browser projections', () => {
    const source = renderGeneratedClientEntityModule({
      entities: [
        {
          entityName: 'TodoList',
          entityExportName: 'TodoList',
          entityDefinitionName: 'TodoList',
          entityDefinitionLocalName: 'TodoListSchema',
          entitySchemaProjection: {
            name: 'TodoList',
            fieldsText: '{ id: field.id() }',
          },
          helperTexts: [],
          operations: [],
        },
        {
          entityName: 'Todo',
          entityExportName: 'Todo',
          entityDefinitionName: 'Todo',
          entityDefinitionLocalName: 'TodoSchema',
          entitySchemaProjection: {
            name: 'Todo',
            fieldsText: '{ id: field.id(), listId: field.id() }',
          },
          helperTexts: [],
          operations: [
            {
              name: 'listForList',
              authority: 'server',
              exposure: 'bridge',
              inputSchemaText: 'graphSchema.object({ list: TodoList.one() })',
              outputSchemaText: 'Todo.array()',
            },
          ],
        },
      ],
    });

    expect(source).toContain('input: graphSchema.object({ list: TodoListSchema.one() }),');
    expect(source).toContain('output: TodoSchema.array(),');
  });

  it('projects schema-only relation targets before their consumers', () => {
    const source = renderGeneratedClientEntityModule({
      entities: [
        {
          entityName: 'Book',
          entityExportName: 'Book',
          entityDefinitionName: 'Book',
          entityDefinitionLocalName: 'BookSchema',
          entitySchemaProjection: {
            name: 'Book',
            fieldsText: '{ id: field.id() }',
            relations: [
              {
                kind: 'hasMany',
                name: 'progress',
                targetName: 'ReadingProgress',
                via: 'bookId',
              },
            ],
          },
          helperTexts: [],
          operations: [{ name: 'find', authority: 'server', exposure: 'bridge' }],
        },
      ],
      schemaEntities: [
        {
          entityName: 'Book',
          entityDefinitionName: 'Book',
          entityDefinitionLocalName: 'BookSchema',
          entitySchemaProjection: {
            name: 'Book',
            fieldsText: '{ id: field.id() }',
            relations: [
              {
                kind: 'hasMany',
                name: 'progress',
                targetName: 'ReadingProgress',
                via: 'bookId',
              },
            ],
          },
        },
        {
          entityName: 'ReadingProgress',
          entityDefinitionName: 'ReadingProgressEntity',
          entityDefinitionLocalName: 'ReadingProgressSchema',
          entitySchemaProjection: {
            name: 'ReadingProgress',
            fieldsText: '{ bookId: field.id() }',
          },
        },
      ],
    });

    expect(source.indexOf('export const ReadingProgressSchema')).toBeLessThan(
      source.indexOf('export const BookSchema'),
    );
    expect(source).toContain('.hasMany("progress", ReadingProgressSchema, { via: "bookId" })');
    expect(source).not.toMatch(/from ['"]\.\/schema['"]/);
  });

  it('projects semantic reference targets before their consumers', () => {
    const source = renderGeneratedClientEntityModule({
      entities: [
        {
          entityName: 'Todo',
          entityExportName: 'Todo',
          entityDefinitionName: 'Todo',
          entityDefinitionLocalName: 'TodoSchema',
          entitySchemaProjection: {
            name: 'Todo',
            fieldsText: '{ id: field.id(), list: field.ref(TodoList) }',
            referenceFields: [{ name: 'list', targetName: 'TodoList' }],
          },
          helperTexts: [],
          operations: [],
        },
      ],
      schemaEntities: [
        {
          entityName: 'Todo',
          entityDefinitionName: 'Todo',
          entityDefinitionLocalName: 'TodoSchema',
          entitySchemaProjection: {
            name: 'Todo',
            fieldsText: '{ id: field.id(), list: field.ref(TodoList) }',
            referenceFields: [{ name: 'list', targetName: 'TodoList' }],
          },
        },
        {
          entityName: 'TodoList',
          entityDefinitionName: 'TodoList',
          entityDefinitionLocalName: 'TodoListSchema',
          entitySchemaProjection: {
            name: 'TodoList',
            fieldsText: '{ id: field.id() }',
          },
        },
      ],
    });

    expect(source.indexOf('export const TodoListSchema')).toBeLessThan(
      source.indexOf('export const TodoSchema'),
    );
    expect(source).toContain('list: field.ref(TodoListSchema)');
    expect(source).not.toMatch(/from ['"]\.\/schema['"]/);
  });

  it('renders a semantic task registry projection', () => {
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
    expect(source).toContain('import { archiveNoteTask } from "./note-task";');
    expect(source).toContain('[archiveNoteTask.id, archiveNoteTask as TaskDefinition');
  });
});
