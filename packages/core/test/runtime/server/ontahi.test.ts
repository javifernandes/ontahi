import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  defineGraphOperation,
  entity as defineEntitySchema,
  field,
  graphSchema,
  mapRelation,
  type InMemoryDataset,
} from '../../../src/data-graph/index.js';
import {
  entity,
  entityModule,
  entityModuleWithCapabilities,
  ontahi,
  relation,
  relationModule,
  valueRef,
} from '../../../src/runtime/server/index.js';
import type { OntahiApplicationBuilder } from '../../../src/runtime/server/ontahi.js';

describe('ontahi application composition root', () => {
  it('binds storage, entities, operations, runtime, and reflection in one declaration', async () => {
    const Note = entity({
      name: 'Note',
      fields: {
        id: field.id(),
        title: field.string(),
        version: field.string(),
      },
      display: {
        primary: 'title',
        search: ['title'],
      },
      freshness: {
        version: 'version',
      },
      locators: { byId: 'id' },
      identity: 'byId',
      values: {
        list: valueRef(),
        byId: valueRef((id: string) => [id]),
      },
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'bridge',
        layer: 'notes',
      },
      operations: ({ self, commands, operation }) => ({
        list: operation({
          output: graphSchema.array(self),
          run: () => commands.all(),
        }),
      }),
    });
    const dataset: InMemoryDataset = {
      Note: [{ id: 'note-1', title: 'One root', version: 'v1' }],
    };
    const storage = createInMemoryDataGraphStorage({ dataset });
    const bindEntities = vi.spyOn(storage, 'bindEntities');
    const application = ontahi({
      storage,
      entities: [Note],
    });

    expect(bindEntities).toHaveBeenCalledWith([Note]);
    const operation = application.graph.getDomainOperation('Note.list');
    expect(operation).toBeDefined();
    expect(application.graph.getEntity('Note')?.entityName).toBe('Note');
    expect(application.graph.getEntity('Note')?.displayMetadata).toEqual({
      primary: 'title',
      search: ['title'],
    });
    expect(application.graph.getEntity('Note')?.freshnessMetadata).toEqual({
      version: 'version',
    });
    expect(application.graph.entities.Note.values.list()).toEqual({
      entity: 'Note',
      kind: 'list',
    });
    expect(application.graph.entities.Note.values.byId('note-1')).toEqual({
      entity: 'Note',
      kind: 'byId',
      id: ['note-1'],
    });
    expect(application.registerBoundEntities({ Note })).toBe(application.graph);
    expect(application.graph.entities.Note).toBe(Note);
    expect(application.storage.kind).toBe('in-memory');
    expect(application.storage.dataset).toBe(dataset);
    await expect(application.invokeOperation(operation!, undefined)).resolves.toMatchObject({
      ok: true,
      kind: 'success',
      value: [{ id: 'note-1', title: 'One root', version: 'v1' }],
    });
    await expect(
      application.reflectedEntityDataReader?.readEntityData({ entityName: 'Note' }),
    ).resolves.toMatchObject({
      rows: [{ id: 'note-1', title: 'One root', version: 'v1' }],
    });
  });

  it('injects typed sibling entities and application capabilities into unified operations', () => {
    const Label = entity({
      name: 'Label',
      fields: {
        id: field.id(),
        name: field.string(),
      },
    });
    const requiresTenant = () => ({ kind: 'requirement' as const });
    const Book = entity({
      name: 'Book',
      fields: {
        id: field.id(),
        title: field.string(),
      },
      uses: {
        capabilities: {
          require: { requiresTenant },
        },
        entities: { Label },
      },
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
        layer: 'books',
      },
      operations: ({ app, entities }) => ({
        inspectDependencies: app.operation.define({
          run: () =>
            Effect.succeed({
              requirement: app.require.requiresTenant(),
              labelEntity: entities.Label.entityName,
            }),
        }),
      }),
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Book: [], Label: [] } }),
      capabilities: {
        require: { requiresTenant },
      },
      entities: [Book, Label],
    });

    return expect(
      application.invokeOperation(
        application.graph.entities.Book.domain.inspectDependencies,
        undefined,
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        requirement: { kind: 'requirement' },
        labelEntity: 'Label',
      },
    });
  });

  it('classifies graph and domain operations from one unified declaration', () => {
    const Note = entity({
      name: 'Note',
      fields: {
        id: field.id(),
      },
      exposure: 'browser-direct',
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'bridge',
        layer: 'notes',
      },
      operations: ({ app, commands }) => ({
        save: defineGraphOperation({
          authority: 'client-safe',
          exposure: 'browser-direct',
          run: (input: { id: string }) =>
            commands.upsert(input, {
              conflictOn: ['id'],
              strategy: 'merge',
            }),
        }),
        inspect: app.operation.define({
          run: () => Effect.succeed('ok'),
        }),
      }),
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Note: [] } }),
      entities: [Note],
    });

    expect(application.graph.entities.Note.graph.exposure).toBe('browser-direct');
    expect(application.graph.entities.Note.operations.save.id).toBe('Note.save');
    expect(application.graph.entities.Note.domain.inspect.id).toBe('Note.inspect');
  });

  it('prepares lazy entity relations before binding the application graph', () => {
    const Book = entity({
      name: 'Book',
      fields: {
        id: field.id(),
        title: field.string(),
      },
    });
    let relationsEvaluated = false;
    let operationSawPreparedRelation = false;
    let storageSawPreparedRelation = false;
    const BookLabel = entity({
      name: 'BookLabel',
      fields: {
        id: field.id(),
        bookId: field.id(),
      },
      relations: () => {
        relationsEvaluated = true;
        return {
          book: relation.belongsTo(Book),
        };
      },
      operations: ({ self }) => {
        operationSawPreparedRelation = self.relations.book?.target === Book;
        return {};
      },
    });

    expect(relationsEvaluated).toBe(false);

    const storage = createInMemoryDataGraphStorage({ dataset: {} });
    const application = ontahi({
      storage: {
        ...storage,
        bindEntities: entities => {
          const boundBookLabel = entities.find(entity => entity.name === 'BookLabel');
          storageSawPreparedRelation = boundBookLabel?.relations.book?.target === Book;
          storage.bindEntities?.(entities);
        },
      },
      entities: [Book, BookLabel],
    });

    expect(relationsEvaluated).toBe(true);
    expect(storageSawPreparedRelation).toBe(true);
    expect(operationSawPreparedRelation).toBe(true);
    expect(BookLabel.relations.book).toMatchObject({
      kind: 'relation',
      relationKind: 'belongsTo',
      target: Book,
    });
    expect(application.graph.getEntity('BookLabel')?.relations.book?.target).toBe(Book);
  });

  it('declares a has-many relation through the target foreign-key field', () => {
    const BookLabel = entity({
      name: 'BookLabel',
      fields: {
        id: field.id(),
        bookId: field.id(),
      },
    });
    const Book = entity({
      name: 'Book',
      fields: {
        id: field.id(),
      },
      relations: {
        labels: relation.hasMany(BookLabel, { via: 'bookId' }),
      },
    });

    expect(Book.relations.labels).toMatchObject({
      relationKind: 'hasMany',
      target: BookLabel,
      targetField: 'bookId',
    });
  });

  it('prepares immediate relations for existing physical mapping declarations', () => {
    const Book = entity({
      name: 'Book',
      fields: {
        id: field.id(),
      },
    });
    const BookLabel = entity({
      name: 'BookLabel',
      fields: {
        id: field.id(),
        bookId: field.id(),
      },
      relations: {
        book: relation.belongsTo(Book),
      },
    });

    expect(
      mapRelation(BookLabel, 'book', {
        type: 'many-to-one',
        from: 'book_labels.book_id',
        to: 'books.id',
      }),
    ).toMatchObject({
      mapping: {
        type: 'many-to-one',
        fromTable: 'book_labels',
        fromColumn: 'book_id',
        toTable: 'books',
        toColumn: 'id',
      },
    });
  });

  it('composes unified declarations with deferred migration modules', () => {
    const Note = entity({
      name: 'Note',
      fields: {
        id: field.id(),
      },
    });
    const LegacyLabelSchema = defineEntitySchema('LegacyLabel', {
      id: field.id(),
    });
    const LegacyLabel = entityModule({
      entity: LegacyLabelSchema,
      bind: app => app.graph.defineEntity(LegacyLabelSchema),
    });

    const application = ontahi({
      storage: createInMemoryDataGraphStorage(),
      entities: [Note],
    });

    expect(application.graph.entityNames).toEqual(['Note']);
    const boundLegacyLabel = application.registerEntity(LegacyLabel);

    expect(application.graph.entityNames).toEqual(['Note', 'LegacyLabel']);
    expect(application.graph.listEntities()).toContain(boundLegacyLabel);
  });

  it('pre-binds every semantic entity for deferred module dependencies', () => {
    const NoteSchema = defineEntitySchema('CatalogNote', {
      id: field.id(),
      labelId: field.id(),
    });
    const Label = entity({
      name: 'CatalogLabel',
      fields: {
        id: field.id(),
      },
    });
    const Note = entityModule({
      entity: NoteSchema,
      bind: (app, { entities }) => {
        expect(entities.CatalogLabel).toBeDefined();
        return app.graph.defineEntity(NoteSchema, {
          domainOperationDefaults: {
            authority: 'server',
            exposure: 'server-only',
          },
          domainOperations: {
            labels: app.operation.define({
              run: () => entities.CatalogLabel.all(),
            }),
          },
        });
      },
    });

    const application = ontahi({
      storage: createInMemoryDataGraphStorage(),
      entities: [Note, Label],
    });

    expect(application.graph.entityNames).toEqual(['CatalogNote', 'CatalogLabel']);
  });

  it('can replace the binder of a unified declaration without losing its preparation', () => {
    const Note = entity({
      name: 'Note',
      fields: {
        id: field.id(),
      },
    });
    const NoteComment = entity({
      name: 'NoteComment',
      fields: {
        id: field.id(),
        noteId: field.id(),
      },
      relations: () => ({
        note: relation.belongsTo(Note),
      }),
    });
    let customBinderCalled = false;
    const WrappedNoteComment = entityModule({
      entity: NoteComment,
      bind: app => {
        customBinderCalled = true;
        return app.graph.defineEntity(NoteComment);
      },
    });

    const application = ontahi({
      storage: createInMemoryDataGraphStorage(),
      entities: [Note, WrappedNoteComment],
    });

    expect(NoteComment.relations.note?.target).toBe(Note);
    expect(customBinderCalled).toBe(true);
    expect(application.graph.getEntity('NoteComment')).toBeDefined();
  });

  it('exposes typed application capabilities during deferred binding', () => {
    type TestCapabilities = {
      auth: {
        currentUserId: () => string;
      };
    };
    const LegacyNoteSchema = defineEntitySchema('LegacyNote', {
      id: field.id(),
    });
    let boundUserId: string | undefined;
    const LegacyNote = entityModule({
      entity: LegacyNoteSchema,
      bind: (app: OntahiApplicationBuilder<TestCapabilities>) => {
        boundUserId = app.auth.currentUserId();
        return app.graph.defineEntity(LegacyNoteSchema);
      },
    });

    const application = ontahi({
      storage: createInMemoryDataGraphStorage(),
      capabilities: {
        auth: {
          currentUserId: () => 'user-1',
        },
      },
      entities: [LegacyNote],
    });

    expect(boundUserId).toBe('user-1');
    expect(application.app.auth.currentUserId()).toBe('user-1');
  });

  it('lets a deferred binder select only the application capabilities it consumes', () => {
    type TestCapabilities = {
      auth: {
        currentUserId: () => string;
      };
    };
    const LegacyNoteSchema = defineEntitySchema('CapabilityBoundNote', {
      id: field.id(),
    });
    let boundUserId: string | undefined;
    const LegacyNote = entityModuleWithCapabilities({
      entity: LegacyNoteSchema,
      capabilities: (app: OntahiApplicationBuilder<TestCapabilities>) => ({
        currentUserId: app.auth.currentUserId,
      }),
      bind: (app, capabilities) => {
        boundUserId = capabilities.currentUserId();
        return app.graph.defineEntity(LegacyNoteSchema);
      },
    });

    ontahi({
      storage: createInMemoryDataGraphStorage(),
      capabilities: {
        auth: {
          currentUserId: () => 'user-1',
        },
      },
      entities: [LegacyNote],
    });

    expect(boundUserId).toBe('user-1');
  });

  it('composes relation modules without presenting them to storage as entities', () => {
    const Book = entity({
      name: 'RelationModuleBook',
      fields: {
        id: field.id(),
      },
    });
    const Label = entity({
      name: 'RelationModuleLabel',
      fields: {
        id: field.id(),
        bookId: field.id(),
      },
    });
    const BookWithLabels = Book.hasMany('labels', Label);
    const BookLabels = relationModule({
      name: 'RelationModuleBookLabels',
      bind: app =>
        app.graph.defineRelation(BookWithLabels, 'labels', {
          entityName: 'RelationModuleBookLabels',
        }),
    });
    const boundEntitySets: string[][] = [];
    const storage = createInMemoryDataGraphStorage();

    const application = ontahi({
      storage: {
        ...storage,
        bindEntities: entities => {
          boundEntitySets.push(entities.map(entity => entity.name));
          storage.bindEntities?.(entities);
        },
      },
      entities: [Book, Label, BookLabels],
    });

    expect(application.graph.entityNames).toEqual([
      'RelationModuleBook',
      'RelationModuleLabel',
      'RelationModuleBookLabels',
    ]);
    expect(boundEntitySets).toEqual([['RelationModuleBook', 'RelationModuleLabel']]);
    expect(application.graph.entities.RelationModuleBookLabels.relation).toMatchObject({
      source: 'RelationModuleBook',
      name: 'labels',
      target: 'RelationModuleLabel',
    });
  });
});
