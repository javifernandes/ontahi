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
  commands: [{ entityName: 'TodoList', actions: ['create', 'update', 'delete'] }],
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
    ).toEqual([expect.objectContaining({ label: '{ id }', apply: '{ id: "" }', cursorOffset: 7 })]);
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
});
