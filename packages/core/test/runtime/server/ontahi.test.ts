import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  compileQueryPlan,
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
  createOperationInvocationDispatcher,
  entityModule,
  entityModuleWithCapabilities,
  ontahi,
  operationGroup,
  relation,
  relationModule,
  type OntahiOperationGroupContext,
  valueRef,
} from '../../../src/runtime/server/index.js';
import type { OntahiApplicationBuilder } from '../../../src/runtime/server/ontahi.js';

describe('ontahi application composition root', () => {
  it('invokes bound entity operations directly and promotes refs to singleton selections', async () => {
    const TodoList = entity({
      name: 'TodoList',
      fields: {
        id: field.id(),
        name: field.nonEmptyString({ trim: true }),
      },
      operations: ({ self, commands, operation }) => ({
        list: operation({
          output: self.array(),
          run: () => commands.all().orderBy(list => list.name),
        }),
        rename: operation({
          input: graphSchema.object({
            list: self.one(),
            name: field.nonEmptyString({ trim: true }),
          }),
          output: self,
          run: ({ list, name }) => list.updateReturning({ name }, ['id', 'name']),
        }),
      }),
    });
    const dataset: InMemoryDataset = {
      TodoList: [{ id: 'list-research', name: 'Research backlog' }],
    };
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset }),
      entities: [TodoList],
    });

    expect(application.graph.entities.TodoList).toBe(TodoList);
    expect(TodoList.identityLocatorName).toBe('refById');
    expect(TodoList.refLocators.refById?.fields).toEqual(['id']);
    expect(application.graph.entities.TodoList.domain.list.exposure).toBe('server-only');
    expect(application.graph.entities.TodoList.domain.list.layer).toBe('TodoList');
    await expect(TodoList.list()).resolves.toMatchObject({
      ok: true,
      value: [{ id: 'list-research', name: 'Research backlog' }],
    });

    const list = TodoList.refById('list-research');
    await expect(TodoList.rename({ list, name: 'Research queue' })).resolves.toMatchObject({
      ok: true,
      value: { id: 'list-research', name: 'Research queue' },
    });
    expect(dataset.TodoList).toEqual([{ id: 'list-research', name: 'Research queue' }]);

    type RenameInput = Parameters<typeof TodoList.rename>[0];
    expectTypeOf<{ list: string; name: string }>().toMatchTypeOf<RenameInput>();
    expectTypeOf<{
      list: { id: string; name: string };
      name: string;
    }>().toMatchTypeOf<RenameInput>();
    await expect(
      TodoList.rename({ list: 'list-research', name: 'Research archive' }),
    ).resolves.toMatchObject({
      ok: true,
      value: { id: 'list-research', name: 'Research archive' },
    });
    await expect(
      TodoList.rename({
        list: { id: 'list-research', name: 'Stale browser snapshot' },
        name: 'Research library',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { id: 'list-research', name: 'Research library' },
    });
    expect(dataset.TodoList).toEqual([{ id: 'list-research', name: 'Research library' }]);
  });

  it('merges alternate locators into the conventional id identity', () => {
    const Profile = entity({
      name: 'Profile',
      fields: {
        id: field.id(),
        email: field.email(),
      },
      locators: {
        refByEmail: 'email',
      },
    });
    ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Profile: [] } }),
      entities: [Profile],
    });

    expect(Profile.identityLocatorName).toBe('refById');
    expect(Profile.refLocators.refById?.fields).toEqual(['id']);
    expect(Profile.refLocators.refByEmail?.fields).toEqual(['email']);
    expect(Profile.refById('profile-1')).toMatchObject({ locator: { id: 'profile-1' } });
    expect(Profile.refByEmail('reader@example.com')).toMatchObject({
      locator: { email: 'reader@example.com' },
    });
  });

  it('hydrates semantic selection inputs before operation implementations run', async () => {
    const Todo = entity({
      name: 'Todo',
      fields: {
        id: field.id(),
        completed: field.boolean(),
      },
      locators: { refById: 'id' },
      identity: 'refById',
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
        layer: 'todos',
      },
      operations: ({ self, operation }) => ({
        complete: operation({
          input: graphSchema.object({
            todos: self.many(),
          }),
          run: ({ todos }) => todos.update({ completed: true }),
        }),
      }),
    });
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', completed: false }],
    };
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset }),
      entities: [Todo],
    });

    await expect(Todo.complete({ todos: Todo.refById('todo-1') })).resolves.toMatchObject({
      ok: true,
    });
    expect(dataset.Todo).toEqual([{ id: 'todo-1', completed: true }]);

    dataset.Todo = [{ id: 'todo-1', completed: false }];
    const incompleteTodos = application.graph.entities.Todo.selection(todo =>
      todo.completed.eq(false),
    );
    await expect(Todo.complete({ todos: incompleteTodos })).resolves.toMatchObject({ ok: true });
    expect(dataset.Todo).toEqual([{ id: 'todo-1', completed: true }]);

    type CompleteInput = Parameters<typeof Todo.complete>[0];
    expectTypeOf<{ todos: string[] }>().toMatchTypeOf<CompleteInput>();
    expectTypeOf<{
      todos: Array<{ id: string; completed: boolean }>;
    }>().toMatchTypeOf<CompleteInput>();

    dataset.Todo = [{ id: 'todo-1', completed: false }];
    await expect(Todo.complete({ todos: ['todo-1'] })).resolves.toMatchObject({ ok: true });
    expect(dataset.Todo).toEqual([{ id: 'todo-1', completed: true }]);

    dataset.Todo = [{ id: 'todo-1', completed: false }];
    await expect(
      Todo.complete({ todos: [{ id: 'todo-1', completed: false }] }),
    ).resolves.toMatchObject({ ok: true });
    expect(dataset.Todo).toEqual([{ id: 'todo-1', completed: true }]);
  });

  it('projects reads directly from hydrated selection inputs', async () => {
    const Todo = entity({
      name: 'Todo',
      fields: {
        id: field.id(),
        title: field.string(),
      },
      locators: { refById: 'id' },
      identity: 'refById',
      operations: ({ self, operation }) => ({
        list: operation({
          input: self.many(),
          output: self.array(),
          run: todos => todos.orderBy(todo => todo.title).run(),
        }),
      }),
    });
    ontahi({
      storage: createInMemoryDataGraphStorage({
        dataset: {
          Todo: [
            { id: 'todo-b', title: 'Write examples' },
            { id: 'todo-a', title: 'Design fluent selections' },
          ],
        },
      }),
      entities: [Todo],
    });

    await expect(
      Todo.list(Todo.selection(todo => todo.id.in(['todo-a', 'todo-b']))),
    ).resolves.toMatchObject({
      ok: true,
      value: [
        { id: 'todo-a', title: 'Design fluent selections' },
        { id: 'todo-b', title: 'Write examples' },
      ],
    });
  });

  it('projects a Selection-shaped Operation result through one final Query', async () => {
    const Company = entity({
      name: 'Company',
      fields: { id: field.id(), name: field.string() },
    });
    const Owner = entity({
      name: 'Owner',
      fields: { id: field.id(), name: field.string(), company: field.ref(Company) },
    });
    const Truck = entity({
      name: 'Truck',
      fields: {
        id: field.id(),
        brand: field.string(),
        owner: field.nullable(field.ref(Owner)),
      },
    });
    const Driver = entity({
      name: 'Driver',
      fields: { id: field.id(), name: field.string() },
    });
    const Country = entity({
      name: 'Country',
      fields: { id: field.id(), code: field.string() },
    });
    const Place = entity({
      name: 'Place',
      fields: { id: field.id(), name: field.string(), country: field.ref(Country) },
    });
    const Stop = entity({
      name: 'Stop',
      fields: {
        id: field.id(),
        tripId: field.string(),
        order: field.integer(),
        place: field.ref(Place),
      },
    });
    const Trip = entity({
      name: 'Trip',
      fields: {
        id: field.id(),
        region: field.string(),
        status: field.string(),
        truck: field.ref(Truck),
        driver: field.nullable(field.ref(Driver)),
      },
      relations: { stops: relation.hasMany(Stop, { via: 'tripId' }) },
      operations: ({ self, commands, operation }) => ({
        available: operation({
          input: graphSchema.object({ trips: self.many() }),
          output: self.many(),
          run: ({ trips }) => trips.and(trip => trip.status.eq('available')),
        }),
        firstAvailable: operation({
          input: graphSchema.object({ trips: self.many() }),
          output: self.one(),
          run: ({ trips }) => trips.and(trip => trip.status.eq('available')),
        }),
        materializedTooEarly: operation({
          output: self.many(),
          run: () => commands.all().run() as never,
        }),
        implicitSelection: operation({
          run: () => commands.all(),
        }),
      }),
    });
    const TripList = Trip.view('TripList', {
      id: true,
      region: true,
      driver: true,
      truck: {
        brand: true,
        owner: { name: true, company: { name: true } },
      },
      stops: {
        order: true,
        place: { name: true, country: { code: true } },
      },
    });
    const baseStorage = createInMemoryDataGraphStorage({
      dataset: {
        Company: [{ id: 'company-1', name: 'Acme' }],
        Owner: [{ id: 'owner-1', name: 'Ada', company: 'company-1' }],
        Truck: [{ id: 'truck-1', brand: 'Volvo', owner: 'owner-1' }],
        Driver: [{ id: 'driver-1', name: 'Grace' }],
        Country: [{ id: 'country-1', code: 'AR' }],
        Place: [{ id: 'place-1', name: 'Rosario', country: 'country-1' }],
        Stop: [{ id: 'stop-1', tripId: 'trip-1', order: 1, place: 'place-1' }],
        Trip: [
          {
            id: 'trip-1',
            region: 'south',
            status: 'available',
            truck: 'truck-1',
            driver: 'driver-1',
          },
          {
            id: 'trip-2',
            region: 'south',
            status: 'assigned',
            truck: 'truck-1',
            driver: null,
          },
        ],
      },
    });
    const runtime = baseStorage.createRuntime();
    const runSpy = vi.spyOn(runtime, 'run');
    const getSpy = vi.spyOn(runtime, 'get');
    const storage = {
      ...baseStorage,
      createRuntime: () => runtime,
    };
    const application = ontahi({
      storage,
      entities: [Company, Owner, Truck, Driver, Country, Place, Stop, Trip],
    });

    const candidateTrips = Trip.selection(trip => trip.region.eq('south'));
    const call = Trip.available({ trips: candidateTrips }).as(TripList);

    const finalQuery = call.inspect();
    expect(finalQuery).toMatchObject({
      kind: 'query',
      root: { name: 'Trip' },
      select: {
        id: { kind: 'field-ref', fieldName: 'id' },
        region: { kind: 'field-ref', fieldName: 'region' },
        driver: { kind: 'field-ref', fieldName: 'driver' },
      },
      selection: { kind: 'and' },
    });
    expect(compileQueryPlan(finalQuery, undefined).includes).toMatchObject([
      {
        relationName: 'truck',
        targetEntity: 'Truck',
        includes: [
          {
            relationName: 'owner',
            targetEntity: 'Owner',
            includes: [{ relationName: 'company', targetEntity: 'Company', includes: [] }],
          },
        ],
      },
      {
        relationName: 'stops',
        targetEntity: 'Stop',
        includes: [
          {
            relationName: 'place',
            targetEntity: 'Place',
            includes: [{ relationName: 'country', targetEntity: 'Country', includes: [] }],
          },
        ],
      },
    ]);
    expect(runSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
    expect(() => Trip.materializedTooEarly().as(TripList).inspect()).toThrow(
      'Projectable operation "Trip.materializedTooEarly" must return a declarative Selection before materialization.',
    );
    const DriverView = Driver.view('DriverView', { name: true });
    expect(() => Trip.available({ trips: candidateTrips }).as(DriverView as never)).toThrow(
      'Cannot project Trip.available (Trip) as DriverView (Driver).',
    );

    await expect(call.run()).resolves.toMatchObject({
      ok: true,
      value: [
        {
          id: 'trip-1',
          region: 'south',
          driver: { kind: 'entity-ref', entityName: 'Driver' },
          truck: { brand: 'Volvo', owner: { name: 'Ada', company: { name: 'Acme' } } },
          stops: [{ order: 1, place: { name: 'Rosario', country: { code: 'AR' } } }],
        },
      ],
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).not.toHaveBeenCalled();

    runSpy.mockClear();
    const dispatcher = createOperationInvocationDispatcher(application);
    await expect(
      dispatcher({
        kind: 'invoke',
        operationId: 'Trip.available',
        input: { trips: candidateTrips.toJSON() },
        view: TripList.toJSON(),
      }),
    ).resolves.toMatchObject({
      kind: 'invocation-result',
      result: {
        ok: true,
        value: [
          {
            id: 'trip-1',
            truck: { owner: { company: { name: 'Acme' } } },
            stops: [{ place: { country: { code: 'AR' } } }],
          },
        ],
      },
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).not.toHaveBeenCalled();

    await expect(
      Trip.firstAvailable({ trips: candidateTrips }).as(TripList).run(),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        id: 'trip-1',
        region: 'south',
        truck: { brand: 'Volvo' },
      },
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledTimes(1);

    const eager = Trip.implicitSelection();
    expectTypeOf(eager).toMatchTypeOf<Promise<unknown>>();
    expect(eager).toBeInstanceOf(Promise);
    expect('as' in eager).toBe(false);
    await expect(eager).resolves.toMatchObject({ ok: true });
  });

  it('binds opaque operation groups without exposing their implementation type', async () => {
    const defineNoteOperations = ({ app, self }: OntahiOperationGroupContext) => ({
      inspect: app.operation.define({
        output: self.array(),
        run: () => Effect.succeed([]),
      }),
    });
    const NoteOperations = operationGroup(['inspect'] as const, defineNoteOperations);
    const Note = entity({
      name: 'Note',
      fields: { id: field.id() },
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
        layer: 'notes',
      },
      operations: context => NoteOperations(context),
    });
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Note: [] } }),
      entities: [Note],
    });

    expect(application.graph.entities.Note.domain.inspect.id).toBe('Note.inspect');
    await expect(
      application.invokeOperation(application.graph.entities.Note.domain.inspect, undefined),
    ).resolves.toMatchObject({ ok: true, value: [] });
  });

  it('rejects an operation group whose public names drift from its factory', () => {
    const NoteOperations = operationGroup(['inspect', 'archive'] as const, () => ({
      inspect: { kind: 'domain-operation' },
    }));

    expect(() =>
      NoteOperations({ app: {} as OntahiApplicationBuilder, self: {} as never }),
    ).toThrow('missing: archive');
  });

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
          output: self.array(),
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
    expect(Note.identityLocatorName).toBe('byId');
    expect(Note.refLocators.refById?.fields).toEqual(['id']);
    expect(Note.refLocators.byId?.fields).toEqual(['id']);
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
          run: () => {
            expect(typeof entities.Label.upsertMany).toBe('function');
            return Effect.succeed({
              requirement: app.require.requiresTenant(),
              labelEntity: entities.Label.entityName,
            });
          },
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

  it('resolves recursive semantic entity references independently of registration order', () => {
    const FolderEntryFields = {
      id: field.id(),
      folderId: field.id(),
    };
    const Folder = entity({
      name: 'Folder',
      fields: {
        id: field.id(),
      },
      relations: {
        entries: relation.hasMany(entity.ref('FolderEntry'), { via: 'folderId' }),
      },
      uses: {
        entities: {
          FolderEntry: entity.ref('FolderEntry'),
        },
      },
      operations: ({ commandsFor, entities }) => {
        expect(entities.FolderEntry.entityName).toBe('FolderEntry');
        commandsFor(entity.ref('FolderEntry', { fields: FolderEntryFields })).where(entry =>
          entry.folderId.eq('folder-1'),
        );
        return {};
      },
    });
    const FolderEntry = entity({
      name: 'FolderEntry',
      fields: FolderEntryFields,
      relations: {
        folder: relation.belongsTo(entity.ref('Folder'), { via: 'folderId' }),
      },
    });

    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Folder: [], FolderEntry: [] } }),
      entities: [FolderEntry, Folder],
    });

    expect((Folder.relations as Record<string, any>).entries.target).toBe(FolderEntry);
    expect((FolderEntry.relations as Record<string, any>).folder.target).toBe(Folder);
    expect((application.graph.getEntity('Folder') as any)?.relations.entries.target).toBe(
      FolderEntry,
    );
  });

  it('scopes reusable semantic refs to each application entity registry', () => {
    const TargetFields = { id: field.id() };
    const TargetRef = entity.ref('Target', { fields: TargetFields });
    const TargetA = entity({
      name: 'Target',
      fields: TargetFields,
    });
    const SourceA = entity({
      name: 'SourceA',
      fields: { id: field.id(), targetId: field.id() },
      relations: {
        target: relation.belongsTo(TargetRef, { via: 'targetId' }),
      },
    });
    ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { SourceA: [], Target: [] } }),
      entities: [SourceA, TargetA],
    });

    const TargetB = entity({
      name: 'Target',
      fields: TargetFields,
    });
    const SourceB = entity({
      name: 'SourceB',
      fields: { id: field.id(), targetId: field.id() },
      relations: {
        target: relation.belongsTo(TargetRef, { via: 'targetId' }),
      },
    });
    ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { SourceB: [], Target: [] } }),
      entities: [SourceB, TargetB],
    });

    expect(SourceA.relations.target.target).toBe(TargetA);
    expect(SourceB.relations.target.target).toBe(TargetB);
  });

  it('validates a reused declaration against every application entity registry', () => {
    const Target = entity({
      name: 'Target',
      fields: { id: field.id() },
    });
    const Source = entity({
      name: 'Source',
      fields: { id: field.id(), targetId: field.id() },
      relations: {
        target: relation.belongsTo(entity.ref('Target'), { via: 'targetId' }),
      },
    });
    ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Source: [], Target: [] } }),
      entities: [Source, Target],
    });

    expect(() =>
      ontahi({
        storage: createInMemoryDataGraphStorage({ dataset: { Source: [] } }),
        entities: [Source],
      }),
    ).toThrow('Entity reference Target is not registered.');
  });

  it('rejects semantic entity references to entities outside the application', () => {
    const Note = entity({
      name: 'Note',
      fields: { id: field.id(), externalId: field.id() },
      relations: {
        external: relation.belongsTo(entity.ref('External'), { via: 'externalId' }),
      },
    });

    expect(() =>
      ontahi({
        storage: createInMemoryDataGraphStorage({ dataset: { Note: [] } }),
        entities: [Note],
      }),
    ).toThrow('Entity reference External is not registered.');
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

  it('derives an inverse relation from a target reference field', () => {
    const TodoFields = {
      id: field.id(),
      title: field.string(),
    };
    const TodoRef = entity.ref('Todo', { fields: TodoFields });
    const Todo = entity({
      name: 'Todo',
      fields: TodoFields,
      relations: () => ({
        tagAssignments: relation.inverse(TodoTag.fields.todo),
      }),
    });
    const Tag = entity({
      name: 'Tag',
      fields: { id: field.id(), name: field.string() },
    });
    const TodoTag = entity({
      name: 'TodoTag',
      fields: {
        todo: field.ref(TodoRef),
        tag: field.ref(Tag),
      },
    });

    ontahi({
      storage: createInMemoryDataGraphStorage({ dataset: { Todo: [], Tag: [], TodoTag: [] } }),
      entities: [Todo, Tag, TodoTag],
    });

    expect(TodoTag.relations.todo).toMatchObject({
      relationKind: 'belongsTo',
      target: Todo,
      sourceField: 'todo',
    });
    expect(Todo.relations.tagAssignments).toMatchObject({
      relationKind: 'hasMany',
      target: TodoTag,
      targetField: 'todo',
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
