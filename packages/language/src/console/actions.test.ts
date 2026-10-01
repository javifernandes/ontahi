import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  convertConsoleDocument,
} from '../index.js';
import type { ConsoleLanguageApplicationReflection } from '../model/contracts.js';

const application: ConsoleLanguageApplicationReflection = {
  entities: [
    {
      name: 'TodoList',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
      ],
      relations: [],
    },
  ],
  commands: [
    {
      entityName: 'TodoList',
      actions: ['create', 'update', 'delete'],
      selectionActions: ['update', 'delete'],
    },
  ],
  operations: [
    {
      id: 'TodoList.createList',
      entityName: 'TodoList',
      name: 'createList',
      input: {
        kind: 'object',
        role: 'object',
        fields: {
          name: { kind: 'scalar', type: 'string' },
          parent: { kind: 'entity-ref', entityName: 'TodoList' },
        },
        unknownKeys: 'strip',
      },
    },
    {
      id: 'TodoList.clear',
      entityName: 'TodoList',
      name: 'clear',
      input: { kind: 'void' },
    },
    {
      id: 'TodoList.refresh',
      entityName: 'TodoList',
      name: 'refresh',
    },
    {
      id: 'TodoList.batch',
      entityName: 'TodoList',
      name: 'batch',
      input: {
        kind: 'object',
        role: 'object',
        unknownKeys: 'strip',
        fields: {
          parents: {
            kind: 'array',
            item: {
              kind: 'named',
              name: 'Parent',
              item: { kind: 'entity-ref', entityName: 'TodoList' },
            },
          },
          details: {
            kind: 'record',
            value: { kind: 'scalar', type: 'json' },
          },
          labels: { kind: 'array', item: { kind: 'scalar', type: 'string' } },
        },
      },
    },
  ],
};

const affordedApplication: ConsoleLanguageApplicationReflection = {
  entities: [
    {
      name: 'Document',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'title', type: 'string', nullable: false },
        { name: 'note', type: 'string', nullable: false },
        { name: 'archivedAt', type: 'string', nullable: true },
        { name: 'published', type: 'boolean', nullable: false },
        { name: 'secret', type: 'string', nullable: false },
      ],
    },
  ],
  commands: [
    {
      entityName: 'Document',
      actions: ['create', 'update', 'delete'],
      selectionActions: ['update', 'delete'],
      affordances: [
        {
          kind: 'entity-mutation-affordance',
          entityName: 'Document',
          action: 'create',
          values: {
            kind: 'object',
            role: 'object',
            unknownKeys: 'strict',
            fields: {
              title: {
                kind: 'scalar',
                type: 'string',
                field: { source: 'caller-required', nullable: false },
              },
              note: {
                kind: 'optional',
                item: { kind: 'scalar', type: 'string' },
                field: { source: 'caller-optional', nullable: false },
              },
              archivedAt: {
                kind: 'nullable',
                item: { kind: 'scalar', type: 'string' },
                field: { source: 'caller-required', nullable: true },
              },
              published: {
                kind: 'default',
                item: { kind: 'scalar', type: 'boolean' },
                defaultValue: false,
                field: { source: 'defaulted', nullable: false },
              },
            },
          },
        },
        {
          kind: 'entity-mutation-affordance',
          entityName: 'Document',
          action: 'update',
          target: {
            exact: {
              reference: { kind: 'entity-ref', entityName: 'Document' },
              locator: {
                kind: 'object',
                role: 'object',
                unknownKeys: 'strict',
                fields: { id: { kind: 'scalar', type: 'id' } },
              },
            },
            selection: {
              fields: {
                title: { schema: { kind: 'scalar', type: 'string' }, operators: ['eq'] },
              },
            },
          },
          values: {
            kind: 'object',
            role: 'object',
            unknownKeys: 'strict',
            fields: { title: { kind: 'scalar', type: 'string' } },
          },
        },
        {
          kind: 'entity-mutation-affordance',
          entityName: 'Document',
          action: 'delete',
          target: {
            exact: {
              reference: { kind: 'entity-ref', entityName: 'Document' },
              locator: {
                kind: 'object',
                role: 'object',
                unknownKeys: 'strict',
                fields: { id: { kind: 'scalar', type: 'id' } },
              },
            },
            selection: {
              fields: {
                title: { schema: { kind: 'scalar', type: 'string' }, operators: ['eq'] },
              },
            },
          },
        },
      ],
    },
  ],
};

describe('Console actions', () => {
  it('lowers a reflected TS Operation to the canonical operation family', () => {
    expect(
      analyzeConsoleDocument(
        'TodoList.createList({ name: "Inbox", parent: { id: "parent-1" } })',
        application,
      ).execution,
    ).toEqual({
      family: 'operation',
      body: {
        version: 1,
        kind: 'invoke',
        operationId: 'TodoList.createList',
        input: {
          name: 'Inbox',
          parent: {
            kind: 'entity-ref',
            entityName: 'TodoList',
            locator: { id: 'parent-1' },
          },
        },
      },
    });
  });

  it('lowers create, update, and delete to canonical graph-command requests', () => {
    const cases = [
      ['TodoList.create({ id: "list-1", name: "Inbox" })', 'create'],
      ['TodoList.ref({ id: "list-1" }).update({ name: "Today" })', 'update'],
      ['TodoList.ref({ id: "list-1" }).delete()', 'delete'],
    ] as const;
    for (const [source, action] of cases) {
      const execution = analyzeConsoleDocument(source, application).execution;
      expect(execution).toMatchObject({
        family: 'graph.command',
        body: { kind: 'graph-command', command: { action, entityName: 'TodoList' } },
      });
    }
  });

  it('supports equivalent declarative action syntax and round trips dialects', () => {
    const declarative = 'update TodoList {"id":"list-1"} with {"name":"Today"}';
    const analysis = analyzeConsoleDocument(declarative, application, { dialect: 'declarative' });
    expect(analysis.execution).toMatchObject({
      family: 'graph.command',
      body: { command: { action: 'update' } },
    });
    expect(convertConsoleDocument(declarative, application, 'ts', { dialect: 'declarative' })).toBe(
      'TodoList.ref({"id":"list-1"}).update({"name":"Today"})',
    );
  });

  it('lowers Selection updates and deletes to version 3 Graph Commands', () => {
    for (const [source, dialect, action] of [
      ['TodoList.where(name = "Inbox").update({ name: "Today" })', 'ts', 'update'],
      ['TodoList.where(name = "Inbox").delete()', 'ts', 'delete'],
      ['update TodoList where { name = "Inbox" } with { name: "Today" }', 'declarative', 'update'],
      ['delete TodoList where { name = "Inbox" }', 'declarative', 'delete'],
    ] as const) {
      expect(analyzeConsoleDocument(source, application, { dialect }).execution).toMatchObject({
        family: 'graph.command',
        body: {
          version: 3,
          command: {
            action,
            entityName: 'TodoList',
            target: {
              kind: 'selection',
              entityName: 'TodoList',
              expression: {
                kind: 'predicate',
                fieldName: 'name',
                operator: 'eq',
                value: 'Inbox',
              },
            },
          },
        },
      });
    }
  });

  it('round trips Selection mutations between dialects', () => {
    const declarative = 'delete TodoList where { name = "Inbox" }';
    expect(convertConsoleDocument(declarative, application, 'ts', { dialect: 'declarative' })).toBe(
      'TodoList.where(name = "Inbox").delete()',
    );
    expect(
      convertConsoleDocument(
        'TodoList.where(name = "Inbox").update({ name: "Today" })',
        application,
        'declarative',
      ),
    ).toBe('update TodoList where name = "Inbox" with {"name":"Today"}');
    expect(
      convertConsoleDocument('TodoList.where(name = "Inbox").delete()', application, 'declarative'),
    ).toBe('delete TodoList where name = "Inbox"');
  });

  it('requires separately advertised Selection mutation capabilities', () => {
    const withoutSelectionCommands = {
      ...application,
      commands: [{ entityName: 'TodoList', actions: ['create', 'update', 'delete'] as const }],
    };
    expect(
      analyzeConsoleDocument('delete TodoList where { name = "Inbox" }', withoutSelectionCommands, {
        dialect: 'declarative',
      }).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'console.semantic.invalid-command' })]);
    expect(
      analyzeConsoleDocument('delete TodoList where { missing = "Inbox" }', application, {
        dialect: 'declarative',
      }).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'selection.semantic.unknown-field' })]);
  });

  it('parses nested structured values and normalizes wrapped Entity Ref inputs', () => {
    expect(
      analyzeConsoleDocument(
        'TodoList.batch({ parents: [{ id: "p-1" },], details: { active: true, count: 2, note: null }, labels: ["a", "b"] })',
        application,
      ).execution,
    ).toMatchObject({
      family: 'operation',
      body: {
        input: {
          parents: [{ kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'p-1' } }],
          details: { active: true, count: 2, note: null },
          labels: ['a', 'b'],
        },
      },
    });
  });

  it('preserves __proto__ as structured data without changing object prototypes', () => {
    const analysis = analyzeConsoleDocument(
      'TodoList.batch({ parents: [], details: { "__proto__": { polluted: true } }, labels: [] })',
      application,
    );
    const input = (analysis.execution?.body as { input?: Record<string, unknown> }).input;
    const details = input?.details as Record<string, unknown>;

    expect(Object.getPrototypeOf(details)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(details, '__proto__')).toBe(true);
    expect(details.__proto__).toEqual({ polluted: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('diagnoses invalid structured values and protocol-unsafe numbers', () => {
    expect(
      analyzeConsoleDocument('TodoList.createList({ name: "\\x" })', application).syntaxDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'console.syntax.invalid' })]);
    expect(
      analyzeConsoleDocument('TodoList.createList({ name: 1e999 })', application)
        .semanticDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'console.semantic.invalid-input' })]);
    expect(
      analyzeConsoleDocument('TodoList.create({ id: "x", name: 1e999 })', application)
        .semanticDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'console.semantic.invalid-command' })]);
  });

  it('enforces reflected input presence and advertised Command availability', () => {
    expect(
      analyzeConsoleDocument('TodoList.createList()', application).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'console.semantic.invalid-input' })]);
    expect(analyzeConsoleDocument('TodoList.clear({})', application).semanticDiagnostics).toEqual([
      expect.objectContaining({ code: 'console.semantic.invalid-input' }),
    ]);
    expect(analyzeConsoleDocument('TodoList.clear()', application).execution).toMatchObject({
      family: 'operation',
      body: { operationId: 'TodoList.clear' },
    });
    expect(analyzeConsoleDocument('TodoList.refresh()', application).execution).toMatchObject({
      family: 'operation',
      body: { operationId: 'TodoList.refresh' },
    });
    expect(
      analyzeConsoleDocument('TodoList.create({ id: "x" })', {
        ...application,
        commands: [],
      }).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ code: 'console.semantic.invalid-command' })]);
  });

  it('rejects unknown Operations before transport', () => {
    expect(analyzeConsoleDocument('TodoList.missing({})', application)).toMatchObject({
      semanticDiagnostics: [{ code: 'console.semantic.unknown-operation' }],
    });
  });

  it('completes reflected Operations and Entity Commands from the TS Entity member', () => {
    expect(completeConsoleDocument('TodoList.cr', 11, application).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'createList' }),
        expect.objectContaining({ label: 'create' }),
      ]),
    );
  });

  it('completes Declarative action keywords and their eligible Entities', () => {
    expect(completeConsoleDocument('up', 2, application, { dialect: 'declarative' }).items).toEqual(
      [expect.objectContaining({ label: 'update', apply: 'update ' })],
    );
    expect(
      completeConsoleDocument('update To', 9, application, { dialect: 'declarative' }).items,
    ).toEqual([expect.objectContaining({ label: 'TodoList' })]);
    expect(
      completeConsoleDocument('invoke To', 9, application, { dialect: 'declarative' }).items,
    ).toEqual([expect.objectContaining({ label: 'TodoList' })]);
    expect(
      completeConsoleDocument('invoke TodoList.cr', 18, application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: 'createList', apply: 'createList ' })]);
    expect(
      completeConsoleDocument('invoke TodoList.createList ', 27, application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: 'with', apply: 'with { }', cursorOffset: 7 })]);
    expect(
      completeConsoleDocument('invoke TodoList.clear ', 22, application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([]);
    const emptyInput = 'invoke TodoList.createList with { }';
    expect(
      completeConsoleDocument(emptyInput, emptyInput.indexOf('}'), application, {
        dialect: 'declarative',
      }).items.map(item => item.label),
    ).toEqual(['name', 'parent']);
    const fieldInput = 'invoke TodoList.createList with { na }';
    expect(
      completeConsoleDocument(fieldInput, fieldInput.indexOf(' }'), application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: 'name', apply: 'name: ""' })]);
    const valueInput = 'invoke TodoList.createList with { name:  }';
    expect(
      completeConsoleDocument(valueInput, valueInput.indexOf(' }'), application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: '""', apply: '""' })]);
    const nextField = 'invoke TodoList.createList with { name: "Inbox",  }';
    expect(
      completeConsoleDocument(nextField, nextField.indexOf(' }'), application, {
        dialect: 'declarative',
      }).items.map(item => item.label),
    ).toEqual(['parent']);
    expect(
      analyzeConsoleDocument('update', application, { dialect: 'declarative' }).semanticDiagnostics,
    ).toEqual([]);
    expect(
      completeConsoleDocument('update TodoList ', 16, application, {
        dialect: 'declarative',
      }).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '{ id }', apply: '{ id: "" }', cursorOffset: 7 }),
        expect.objectContaining({ label: 'where' }),
      ]),
    );
    expect(
      completeConsoleDocument('update TodoList { id: "list-1" } ', 34, application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: 'with', apply: 'with { }', cursorOffset: 7 })]);
    expect(
      analyzeConsoleDocument('update TodoList', application, { dialect: 'declarative' })
        .syntaxDiagnostics,
    ).toEqual([expect.objectContaining({ message: 'Expected a complete update expression.' })]);
    const emptyLocator = 'update TodoList {  }';
    expect(
      completeConsoleDocument(emptyLocator, emptyLocator.indexOf('}'), application, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: 'id', apply: 'id: ""', cursorOffset: 5 })]);
    const emptyUpdate = 'update TodoList { id:"list-1" } with {  }';
    expect(
      completeConsoleDocument(
        emptyUpdate,
        emptyUpdate.indexOf('}', emptyUpdate.indexOf('with')),
        application,
        {
          dialect: 'declarative',
        },
      ).items,
    ).toEqual([expect.objectContaining({ label: 'name', apply: 'name: ""', cursorOffset: 7 })]);
    const partialUpdate = 'update TodoList { id:"list-1" } with { na }';
    expect(
      completeConsoleDocument(
        partialUpdate,
        partialUpdate.indexOf(' }', partialUpdate.indexOf('with')),
        application,
        { dialect: 'declarative' },
      ).items,
    ).toEqual([expect.objectContaining({ label: 'name', apply: 'name: ""' })]);
  });

  it('completes Selection mutation targets and terminals', () => {
    expect(
      completeConsoleDocument('delete TodoList ', 16, application, { dialect: 'declarative' })
        .items,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'where' })]));
    expect(
      completeConsoleDocument('delete TodoList where { na', 26, application, {
        dialect: 'declarative',
      }).items,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'name' })]));
    expect(
      completeConsoleDocument('TodoList.where(name = "Inbox").', 32, application).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'update' }),
        expect.objectContaining({ label: 'delete' }),
      ]),
    );
    expect(
      completeConsoleDocument(
        'update TodoList where { name = "Inbox" } ',
        'update TodoList where { name = "Inbox" } '.length,
        application,
        { dialect: 'declarative' },
      ).items,
    ).toEqual([expect.objectContaining({ label: 'with', apply: 'with { }' })]);

    const selectionOnly = {
      ...application,
      commands: [
        { entityName: 'TodoList', actions: [] as const, selectionActions: ['delete'] as const },
      ],
    };
    expect(
      completeConsoleDocument('de', 2, selectionOnly, { dialect: 'declarative' }).items,
    ).toEqual([expect.objectContaining({ label: 'delete' })]);
    expect(
      completeConsoleDocument('delete To', 9, selectionOnly, { dialect: 'declarative' }).items,
    ).toEqual([expect.objectContaining({ label: 'TodoList' })]);
    expect(
      completeConsoleDocument('delete TodoList ', 16, selectionOnly, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: 'where' })]);
  });

  it('uses reflected mutation affordances for fields, presence, and diagnostics', () => {
    expect(
      completeConsoleDocument('create Document ', 16, affordedApplication, {
        dialect: 'declarative',
      }).items,
    ).toEqual([expect.objectContaining({ label: '{…}' })]);
    const create = 'create Document {  }';
    const createItems = completeConsoleDocument(create, create.indexOf('}'), affordedApplication, {
      dialect: 'declarative',
    }).items;
    expect(createItems.map(item => item.label)).toEqual([
      'title',
      'note',
      'archivedAt',
      'published',
    ]);
    expect(createItems.find(item => item.label === 'published')?.detail).toContain('defaulted');
    expect(createItems.find(item => item.label === 'archivedAt')?.detail).toContain('nullable');

    expect(
      analyzeConsoleDocument('create Document { archivedAt: null }', affordedApplication, {
        dialect: 'declarative',
      }).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ message: 'Field title is required.' })]);
    expect(
      analyzeConsoleDocument(
        'create Document { title: "Draft", archivedAt: null, secret: "hidden" }',
        affordedApplication,
        { dialect: 'declarative' },
      ).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ message: 'Field secret is not writable.' })]);
    expect(
      analyzeConsoleDocument(
        'create Document { title: "Draft", archivedAt: null }',
        affordedApplication,
        { dialect: 'declarative' },
      ).semanticDiagnostics,
    ).toEqual([]);

    const update = 'update Document { id: "doc-1" } with {  }';
    expect(
      completeConsoleDocument(update, update.lastIndexOf('}'), affordedApplication, {
        dialect: 'declarative',
      }).items.map(item => item.label),
    ).toEqual(['title']);
    expect(
      analyzeConsoleDocument(
        'update Document { id: "doc-1" } with { secret: "hidden" }',
        affordedApplication,
        { dialect: 'declarative' },
      ).semanticDiagnostics,
    ).toEqual([expect.objectContaining({ message: 'Field secret is not writable.' })]);
  });

  it('narrows Selection completion and diagnostics to the published mutation policy', () => {
    expect(
      completeConsoleDocument('delete Document where {  }', 24, affordedApplication, {
        dialect: 'declarative',
      }).items.map(item => item.label),
    ).toContain('title');
    expect(
      completeConsoleDocument('delete Document where {  }', 24, affordedApplication, {
        dialect: 'declarative',
      }).items.map(item => item.label),
    ).not.toContain('secret');
    expect(
      analyzeConsoleDocument('delete Document where { secret = "x" }', affordedApplication, {
        dialect: 'declarative',
      }).semanticDiagnostics,
    ).toEqual([
      expect.objectContaining({ message: 'Field secret is not available for this mutation.' }),
    ]);
    expect(
      analyzeConsoleDocument('delete Document where { title in ["x"] }', affordedApplication, {
        dialect: 'declarative',
      }).semanticDiagnostics,
    ).toEqual([
      expect.objectContaining({ message: 'Operator in is not available for Field title.' }),
    ]);
  });
});
