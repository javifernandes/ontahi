import { entity, field } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  analyzeSelectionDocument,
  completeConsoleDocument,
  parseConsoleDocument,
  reflectSelectionLanguageEntity,
} from '../index.js';

const application = {
  entities: [
    {
      name: 'TodoItem',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'title', type: 'string', nullable: false },
        { name: 'completed', type: 'boolean', nullable: false },
      ],
    },
  ],
} as const;

describe('Console Graph Read language', () => {
  it.each(['where', 'first', 'one', 'many', 'count', 'exists', 'limit', 'orderBy'])(
    'keeps %s available as a Field and Entity identifier',
    name => {
      const reflected = { name, fields: [{ name, type: 'number', nullable: false }] };
      const selection = analyzeSelectionDocument(`${name} = 2`, reflected);
      expect(selection.syntaxDiagnostics).toEqual([]);
      expect(selection.semanticDiagnostics).toEqual([]);
      expect(selection.selection?.expression).toEqual({
        kind: 'predicate',
        fieldName: name,
        operator: 'eq',
        value: 2,
      });
      const console = analyzeConsoleDocument(
        `${name}.where(${name} = 2).orderBy(${name}).limit(3).many()`,
        { entities: [reflected] },
      );
      expect(console.syntaxDiagnostics).toEqual([]);
      expect(console.semanticDiagnostics).toEqual([]);
      expect(console.request).toMatchObject({
        mode: 'run',
        limit: 3,
        selection: { entityName: name, expression: selection.selection?.expression },
        orderBy: [{ fieldName: name, direction: 'asc' }],
      });
    },
  );
  it('reuses the Selection grammar inside a keyword-free Query expression', () => {
    const analysis = analyzeConsoleDocument(
      'TodoItem.where(completed = false and title = "Draft").many()',
      application,
    );

    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.syntax.expression).toMatchObject({
      kind: 'graph-read',
      entity: { kind: 'entity-name', text: 'TodoItem', from: 0, to: 8 },
      where: { kind: 'where-member', text: 'where' },
      selection: { kind: 'and' },
      terminal: { kind: 'many-member', text: 'many' },
    });
    expect(analysis.request).toEqual({
      version: 1,
      kind: 'graph-read',
      mode: 'run',
      selection: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'and',
          operands: [
            {
              kind: 'predicate',
              fieldName: 'completed',
              operator: 'eq',
              value: false,
            },
            { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Draft' },
          ],
        },
      },
      orderBy: [],
      limit: 25,
      cardinality: 'many',
    });
  });

  it.each([
    ['many', 'many-member', 'run', 'many'],
    ['first', 'first-member', 'get', undefined],
    ['one', 'one-member', 'get', 'one'],
    ['count', 'count-member', 'count', undefined],
    ['exists', 'exists-member', 'get', undefined],
  ] as const)(
    'defaults %s() to the canonical all Selection',
    (terminal, terminalKind, mode, cardinality) => {
      const analysis = analyzeConsoleDocument(`TodoItem.${terminal}()`, application);

      expect(analysis.syntaxDiagnostics).toEqual([]);
      expect(analysis.semanticDiagnostics).toEqual([]);
      expect(analysis.syntax.expression).toMatchObject({
        kind: 'graph-read',
        entity: { text: 'TodoItem' },
        terminal: { kind: terminalKind, text: terminal },
      });
      expect(analysis.syntax.expression?.where).toBeUndefined();
      expect(analysis.syntax.expression?.selection).toBeUndefined();
      expect(analysis.request).toEqual({
        version: 1,
        kind: 'graph-read',
        mode,
        selection: {
          kind: 'selection',
          entityName: 'TodoItem',
          expression: { kind: 'all' },
        },
        orderBy: [],
        ...(mode === 'count' ? {} : { limit: terminal === 'exists' ? 1 : 25 }),
        ...(cardinality ? { cardinality } : {}),
      });
    },
  );

  it('counts an explicit Selection without applying row cardinality or limit', () => {
    const analysis = analyzeConsoleDocument(
      'TodoItem.where(completed = false).count()',
      application,
    );

    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.request).toEqual({
      version: 1,
      kind: 'graph-read',
      mode: 'count',
      selection: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: {
          kind: 'predicate',
          fieldName: 'completed',
          operator: 'eq',
          value: false,
        },
      },
      orderBy: [],
    });
  });

  it('uses an explicit row limit with filtered and unfiltered reads', () => {
    const unfiltered = analyzeConsoleDocument('TodoItem.limit(2).many()', application);
    expect(unfiltered.syntaxDiagnostics).toEqual([]);
    expect(unfiltered.semanticDiagnostics).toEqual([]);
    expect(unfiltered.syntax.expression).toMatchObject({
      limit: { kind: 'limit-member', text: 'limit' },
      limitValue: { kind: 'number-literal', value: 2 },
      terminal: { kind: 'many-member' },
    });
    expect(unfiltered.request).toMatchObject({
      mode: 'run',
      limit: 2,
      selection: { expression: { kind: 'all' } },
    });

    const filtered = analyzeConsoleDocument(
      'TodoItem.where(completed = false).limit(5).many()',
      application,
    );
    expect(filtered.syntaxDiagnostics).toEqual([]);
    expect(filtered.semanticDiagnostics).toEqual([]);
    expect(filtered.request).toMatchObject({
      mode: 'run',
      limit: 5,
      selection: {
        expression: {
          kind: 'predicate',
          fieldName: 'completed',
          operator: 'eq',
          value: false,
        },
      },
    });
  });

  it('rejects invalid limits and count combinations before execution', () => {
    for (const source of ['TodoItem.limit(-1).many()', 'TodoItem.limit(1.5).many()']) {
      const analysis = analyzeConsoleDocument(source, application);
      expect(analysis.semanticDiagnostics).toEqual([
        expect.objectContaining({
          channel: 'semantic',
          code: 'console.semantic.invalid-limit',
          message: 'Console Graph Read limit must be a non-negative integer.',
        }),
      ]);
      expect(analysis.request).toBeUndefined();
    }

    for (const terminal of ['first', 'one', 'count', 'exists']) {
      const analysis = analyzeConsoleDocument(`TodoItem.limit(2).${terminal}()`, application);
      expect(analysis.semanticDiagnostics).toEqual([
        expect.objectContaining({
          channel: 'semantic',
          code: 'console.semantic.unsupported-limit',
          message: '.limit(...) can only be combined with .many().',
        }),
      ]);
      expect(analysis.request).toBeUndefined();
    }
  });

  it('keeps unknown Entities separate from nested Selection diagnostics', () => {
    expect(analyzeConsoleDocument('Missing.where(all).many()', application)).toMatchObject({
      syntaxDiagnostics: [],
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'console.semantic.unknown-entity',
          message: 'Unknown Entity Missing.',
          from: 0,
          to: 7,
        },
      ],
    });
    expect(
      analyzeConsoleDocument('TodoItem.where(missing = true).many()', application),
    ).toMatchObject({
      syntaxDiagnostics: [],
      semanticDiagnostics: [
        {
          channel: 'semantic',
          code: 'selection.semantic.unknown-field',
          from: 15,
          to: 22,
        },
      ],
    });
  });

  it('lowers one() to the existing exact-one Graph Read cardinality', () => {
    const analysis = analyzeConsoleDocument('TodoItem.where(id = "todo-1").one()', application);

    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.syntax.expression?.terminal).toMatchObject({
      kind: 'one-member',
      text: 'one',
    });
    expect(analysis.request).toMatchObject({
      kind: 'graph-read',
      mode: 'get',
      cardinality: 'one',
    });
  });

  it('lowers first() to the existing nullable get intent without strict cardinality', () => {
    const analysis = analyzeConsoleDocument(
      'TodoItem.where(completed = false).first()',
      application,
    );

    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.syntax.expression?.terminal).toMatchObject({
      kind: 'first-member',
      text: 'first',
    });
    expect(analysis.request).toMatchObject({
      kind: 'graph-read',
      mode: 'get',
    });
    expect(analysis.request).not.toHaveProperty('cardinality');
  });

  it('reports an incomplete terminal as Console syntax rather than Selection semantics', () => {
    expect(parseConsoleDocument('TodoItem.where(completed = false)')).toMatchObject({
      syntaxDiagnostics: [
        {
          channel: 'syntax',
          code: 'console.syntax.invalid',
          message:
            'Expected .orderBy(...), .limit(...), .first(), .one(), .many(), .count(), or .exists() after the Selection expression.',
        },
      ],
    });
    expect(parseConsoleDocument('TodoItem.limit().many()')).toMatchObject({
      syntaxDiagnostics: [
        {
          channel: 'syntax',
          code: 'console.syntax.invalid',
          message: 'Expected a numeric row limit inside .limit(...).',
        },
      ],
    });
    expect(parseConsoleDocument('TodoItem.limit(2)')).toMatchObject({
      syntaxDiagnostics: [
        {
          channel: 'syntax',
          code: 'console.syntax.invalid',
          message: 'Expected .many() after .limit(...).',
        },
      ],
    });
  });

  it('reuses Selection completions at their full-document source range', () => {
    expect(completeConsoleDocument('To', 2, application)).toMatchObject({
      from: 0,
      to: 2,
      items: [{ label: 'TodoItem', apply: 'TodoItem', kind: 'entity' }],
    });

    const document = 'TodoItem.where(comp).many()';
    const position = document.indexOf('comp') + 4;
    const completion = completeConsoleDocument(document, position, application);
    expect(completion).toMatchObject({
      from: document.indexOf('comp'),
      to: document.indexOf('comp') + 4,
    });
    expect(completion.items).toContainEqual(
      expect.objectContaining({ label: 'completed', apply: 'completed', kind: 'field' }),
    );

    const directTerminalDocument = 'TodoItem.m';
    expect(
      completeConsoleDocument(directTerminalDocument, directTerminalDocument.length, application)
        .items,
    ).toEqual([expect.objectContaining({ label: 'many', apply: 'many()', kind: 'member' })]);

    const countDocument = 'TodoItem.c';
    expect(completeConsoleDocument(countDocument, countDocument.length, application).items).toEqual(
      [expect.objectContaining({ label: 'count', apply: 'count()', kind: 'member' })],
    );

    const limitDocument = 'TodoItem.where(all).l';
    expect(completeConsoleDocument(limitDocument, limitDocument.length, application).items).toEqual(
      [expect.objectContaining({ label: 'limit', apply: 'limit(', kind: 'member' })],
    );

    const limitedTerminalDocument = 'TodoItem.limit(2).';
    expect(
      completeConsoleDocument(
        limitedTerminalDocument,
        limitedTerminalDocument.length,
        application,
      ).items.map(item => item.label),
    ).toEqual(['many']);

    const terminalDocument = 'TodoItem.where(all).o';
    expect(
      completeConsoleDocument(terminalDocument, terminalDocument.length, application).items,
    ).toContainEqual(expect.objectContaining({ label: 'one', apply: 'one()', kind: 'member' }));
    const firstDocument = 'TodoItem.where(all).f';
    expect(
      completeConsoleDocument(firstDocument, firstDocument.length, application).items,
    ).toContainEqual(expect.objectContaining({ label: 'first', apply: 'first()', kind: 'member' }));
  });

  it('lowers filtered exists to a bounded nullable get, independent of the display limit', () => {
    const analysis = analyzeConsoleDocument(
      'TodoItem.where(completed = false).exists()',
      application,
      { limit: 0 },
    );
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.request).toEqual({
      version: 1,
      kind: 'graph-read',
      mode: 'get',
      selection: {
        kind: 'selection',
        entityName: 'TodoItem',
        expression: { kind: 'predicate', fieldName: 'completed', operator: 'eq', value: false },
      },
      orderBy: [],
      limit: 1,
    });
  });

  it('offers exists only without row modifiers and diagnoses incomplete arguments', () => {
    for (const source of ['TodoItem.ex', 'TodoItem.where(completed = false).ex']) {
      expect(completeConsoleDocument(source, source.length, application).items).toEqual([
        {
          label: 'exists',
          apply: 'exists()',
          kind: 'member',
          detail: 'Whether any Entity matches the Selection',
        },
      ]);
    }
    for (const source of ['TodoItem.orderBy(title).', 'TodoItem.limit(2).']) {
      expect(
        completeConsoleDocument(source, source.length, application).items.map(item => item.label),
      ).not.toContain('exists');
    }
    for (const source of ['TodoItem.exists', 'TodoItem.exists(', 'TodoItem.exists(true)']) {
      expect(analyzeConsoleDocument(source, application).request).toBeUndefined();
      expect(parseConsoleDocument(source).syntaxDiagnostics.length).toBeGreaterThan(0);
    }
    const invalid = analyzeConsoleDocument('TodoItem.orderBy(title).exists()', application);
    expect(invalid.request).toBeUndefined();
    expect(invalid.semanticDiagnostics).toEqual([
      expect.objectContaining({
        code: 'console.semantic.unsupported-order',
        message: '.orderBy(...) cannot be combined with .exists().',
      }),
    ]);
  });

  it('projects Core Entity definitions into the existing Selection reflection input', () => {
    const TodoList = entity('TodoList', { id: field.id(), name: field.string() });
    const TodoItem = entity('TodoItem', {
      id: field.id(),
      list: field.ref(TodoList),
      completed: field.boolean(),
    }).manyToMany('children', entity('Child', { id: field.id() }));

    expect(reflectSelectionLanguageEntity(TodoItem)).toEqual({
      name: 'TodoItem',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        {
          name: 'list',
          type: 'reference',
          nullable: false,
          reference: {
            entityName: 'TodoList',
            identity: { name: 'refById', fields: ['id'] },
          },
        },
        { name: 'completed', type: 'boolean', nullable: false },
      ],
      relations: [{ name: 'list' }, { name: 'children' }],
    });
  });
});
