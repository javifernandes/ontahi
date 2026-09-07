import { createInMemoryDataGraphRuntime, entity, field, query } from '@ontahi/core/data-graph';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { analyzeSelectionDocument, parseSelectionDocument } from './index.js';

const Item = {
  name: 'Item',
  fields: [
    { name: 'id', type: 'id', nullable: false },
    { name: 'title', type: 'string', nullable: false },
    { name: 'note', type: 'string', nullable: true },
    { name: 'completed', type: 'boolean', nullable: false },
    { name: 'notable', type: 'boolean', nullable: false },
    { name: 'a', type: 'boolean', nullable: false },
    { name: 'b', type: 'boolean', nullable: false },
    { name: 'c', type: 'boolean', nullable: false },
    { name: 'score', type: 'number', nullable: false },
    {
      name: 'status',
      type: 'enum',
      nullable: false,
      enumValues: ['open', 'blocked'],
    },
    { name: 'createdAt', type: 'date', nullable: false },
    { name: 'startsAt', type: 'string', valueType: 'DateTime', nullable: false },
    { name: 'metadata', type: 'json', nullable: false },
    {
      name: 'owner',
      type: 'reference',
      nullable: false,
      reference: { entityName: 'Person' },
    },
  ],
  relations: [{ name: 'comments' }],
} as const;

const expressionOf = (document: string) =>
  analyzeSelectionDocument(document, Item).selection?.expression;

describe('Selection document syntax', () => {
  it('parses scalar predicates into source-positioned recoverable syntax', () => {
    expect(parseSelectionDocument('completed = false')).toEqual({
      syntax: {
        kind: 'selection-document',
        from: 0,
        to: 17,
        expression: {
          kind: 'predicate',
          from: 0,
          to: 17,
          field: { kind: 'field-name', from: 0, to: 9, text: 'completed' },
          operator: {
            kind: 'predicate-operator',
            operator: 'eq',
            from: 10,
            to: 11,
            text: '=',
          },
          value: {
            kind: 'boolean-literal',
            from: 12,
            to: 17,
            text: 'false',
            value: false,
          },
        },
      },
      syntaxDiagnostics: [],
    });
  });

  it('treats keywords contextually instead of consuming identifier prefixes', () => {
    expect(expressionOf('notable = true')).toEqual({
      kind: 'predicate',
      fieldName: 'notable',
      operator: 'eq',
      value: true,
    });
    expect(expressionOf('note is null')).toEqual({
      kind: 'predicate',
      fieldName: 'note',
      operator: 'isNull',
    });
  });

  it('keeps an empty host document valid without inventing Selection meaning', () => {
    expect(analyzeSelectionDocument('   ', Item)).toEqual({
      syntax: { kind: 'selection-document', from: 0, to: 3, expression: undefined },
      syntaxDiagnostics: [],
      semanticDiagnostics: [],
    });
  });

  it.each([
    {
      document: 'completed',
      message: 'Expected a Selection operator after the Field name.',
    },
    {
      document: 'note is',
      message: 'Expected "null" after is.',
    },
    {
      document: 'score in',
      message: 'Expected a bracketed list literal after in.',
    },
    {
      document: 'completed =',
      message: 'Expected a string, number, or Boolean literal.',
    },
    {
      document: 'completed = false and',
      message: 'Expected a Selection expression.',
    },
    {
      document: 'not',
      message: 'Expected a Selection expression.',
    },
    {
      document: '(completed = false',
      message: 'Expected ")" to close the Selection expression.',
    },
    {
      document: 'id in ["a",',
      message: 'Expected a literal or "]" to complete the list.',
    },
  ])('recovers $document with a precise end range', ({ document, message }) => {
    const analysis = analyzeSelectionDocument(document, Item);

    expect(analysis.selection).toBeUndefined();
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.syntaxDiagnostics).toEqual([
      {
        channel: 'syntax',
        code: 'selection.syntax.invalid',
        message,
        from: document.length,
        to: document.length,
      },
    ]);
  });

  it('reports an unexpected token range before any recoverable expression', () => {
    expect(analyzeSelectionDocument('@', Item).syntaxDiagnostics).toEqual([
      {
        channel: 'syntax',
        code: 'selection.syntax.invalid',
        message: 'Expected all, none, a predicate, not, or a parenthesized Selection expression.',
        from: 0,
        to: 1,
      },
    ]);
  });

  it('rejects non-JSON string escaping in the syntax channel', () => {
    expect(analyzeSelectionDocument('title = "\\x"', Item).syntaxDiagnostics).toEqual([
      {
        channel: 'syntax',
        code: 'selection.syntax.invalid',
        message: 'String literals must use valid JSON escaping.',
        from: 8,
        to: 12,
      },
    ]);
  });
});

describe('Selection expression lowering', () => {
  it('applies not, and, and or with the documented precedence', () => {
    expect(expressionOf('not a = true and b = true or c = true')).toEqual({
      kind: 'or',
      operands: [
        {
          kind: 'and',
          operands: [
            {
              kind: 'not',
              operand: { kind: 'predicate', fieldName: 'a', operator: 'eq', value: true },
            },
            { kind: 'predicate', fieldName: 'b', operator: 'eq', value: true },
          ],
        },
        { kind: 'predicate', fieldName: 'c', operator: 'eq', value: true },
      ],
    });
  });

  it('retains parentheses in syntax while omitting them from canonical meaning', () => {
    const analysis = analyzeSelectionDocument('(a = true or b = true) and c = true', Item);

    expect(analysis.syntax.expression).toMatchObject({ kind: 'and' });
    expect(
      analysis.syntax.expression?.kind === 'and'
        ? analysis.syntax.expression.operands[0]
        : undefined,
    ).toMatchObject({
      kind: 'parenthesized',
      open: { from: 0, to: 1 },
      close: { from: 21, to: 22 },
    });
    expect(analysis.selection?.expression).toEqual({
      kind: 'and',
      operands: [
        {
          kind: 'or',
          operands: [
            { kind: 'predicate', fieldName: 'a', operator: 'eq', value: true },
            { kind: 'predicate', fieldName: 'b', operator: 'eq', value: true },
          ],
        },
        { kind: 'predicate', fieldName: 'c', operator: 'eq', value: true },
      ],
    });
    expect(JSON.stringify(analysis.selection)).not.toContain('parenthesized');
  });

  it.each([
    ['all', { kind: 'all' }],
    ['none', { kind: 'none' }],
    [
      'completed = false',
      { kind: 'predicate', fieldName: 'completed', operator: 'eq', value: false },
    ],
    ['title = "Draft"', { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'Draft' }],
    [
      'title = "A \\"quote\\""',
      { kind: 'predicate', fieldName: 'title', operator: 'eq', value: 'A "quote"' },
    ],
    [
      'id in ["item-1", "item-2"]',
      { kind: 'predicate', fieldName: 'id', operator: 'in', values: ['item-1', 'item-2'] },
    ],
    ['status = "open"', { kind: 'predicate', fieldName: 'status', operator: 'eq', value: 'open' }],
    ['note is null', { kind: 'predicate', fieldName: 'note', operator: 'isNull' }],
    ['score < 2', { kind: 'predicate', fieldName: 'score', operator: 'lt', value: 2 }],
    ['score <= 2', { kind: 'predicate', fieldName: 'score', operator: 'lte', value: 2 }],
    ['score > 2', { kind: 'predicate', fieldName: 'score', operator: 'gt', value: 2 }],
    ['score >= 2', { kind: 'predicate', fieldName: 'score', operator: 'gte', value: 2 }],
    ['score in [1, 3]', { kind: 'predicate', fieldName: 'score', operator: 'in', values: [1, 3] }],
    ['score in []', { kind: 'predicate', fieldName: 'score', operator: 'in', values: [] }],
    ['score = -1.5e2', { kind: 'predicate', fieldName: 'score', operator: 'eq', value: -150 }],
  ] as const)('lowers %s to the established Selection operator', (document, expected) => {
    expect(expressionOf(document)).toEqual(expected);
  });

  it('delegates all, none, and double-not normalization to Core', () => {
    expect(expressionOf('all and completed = true')).toEqual({
      kind: 'predicate',
      fieldName: 'completed',
      operator: 'eq',
      value: true,
    });
    expect(expressionOf('none or completed = true')).toEqual({
      kind: 'predicate',
      fieldName: 'completed',
      operator: 'eq',
      value: true,
    });
    expect(expressionOf('not not completed = true')).toEqual({
      kind: 'predicate',
      fieldName: 'completed',
      operator: 'eq',
      value: true,
    });
  });

  it('executes a nested lowered expression through the in-memory runtime', async () => {
    const RuntimeItem = entity('LanguageRuntimeItem', {
      id: field.id(),
      status: field.enum(['open', 'blocked', 'closed'] as const),
      score: field.number(),
      completed: field.boolean(),
    });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        LanguageRuntimeItem: [
          { id: 'one', status: 'open', score: 3, completed: false },
          { id: 'two', status: 'blocked', score: 1, completed: false },
          { id: 'three', status: 'closed', score: 4, completed: false },
          { id: 'four', status: 'blocked', score: 2, completed: true },
        ],
      },
    });
    const selection = analyzeSelectionDocument(
      '(status = "open" or status = "blocked") and score >= 2 and not completed = true',
      {
        name: RuntimeItem.name,
        fields: [
          {
            name: 'status',
            type: 'enum',
            nullable: false,
            enumValues: ['open', 'blocked', 'closed'],
          },
          { name: 'score', type: 'number', nullable: false },
          { name: 'completed', type: 'boolean', nullable: false },
        ],
      },
    ).selection!;

    const rows = await Effect.runPromise(
      runtime.run(
        query(RuntimeItem).where({ root: RuntimeItem, expression: selection.expression }),
        undefined,
      ),
    );
    expect(rows.map(row => row.id)).toEqual(['one']);
  });
});

describe('Selection expression semantics', () => {
  it('collects unknown Field and incompatible operator diagnostics across composition', () => {
    const analysis = analyzeSelectionDocument('missing = true or title > "a"', Item);

    expect(analysis.selection).toBeUndefined();
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([
      {
        channel: 'semantic',
        code: 'selection.semantic.unknown-field',
        message: 'Unknown Field Item.missing.',
        from: 0,
        to: 7,
      },
      {
        channel: 'semantic',
        code: 'selection.semantic.incompatible-operator',
        message: 'Operator > requires a number Field; Item.title is string.',
        from: 24,
        to: 25,
      },
    ]);
  });

  it.each([
    {
      document: 'score = "high"',
      code: 'selection.semantic.incompatible-field-type',
      from: 8,
      to: 14,
    },
    {
      document: 'title is null',
      code: 'selection.semantic.non-nullable-field',
      from: 6,
      to: 13,
    },
    {
      document: 'status = "closed"',
      code: 'selection.semantic.unknown-enum-value',
      from: 9,
      to: 17,
    },
    {
      document: 'score = 1e999',
      code: 'selection.semantic.non-finite-number',
      from: 8,
      to: 13,
    },
  ])('reports a precise $code range for $document', ({ document, code, from, to }) => {
    const analysis = analyzeSelectionDocument(document, Item);

    expect(analysis.selection).toBeUndefined();
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toHaveLength(1);
    expect(analysis.semanticDiagnostics[0]).toMatchObject({ code, from, to });
  });

  it.each([
    ['createdAt = "2026-01-01"', 'createdAt', 'date'],
    ['startsAt = "2026-01-01T00:00:00Z"', 'startsAt', 'DateTime'],
    ['metadata = "{}"', 'metadata', 'json'],
    ['owner = "person-1"', 'owner', 'reference'],
  ] as const)('rejects unsettled semantics for %s', (document, fieldName, type) => {
    expect(analyzeSelectionDocument(document, Item).semanticDiagnostics).toEqual([
      {
        channel: 'semantic',
        code: 'selection.semantic.unsupported-field-type',
        message: `Field Item.${fieldName} has unsupported ${type} semantics in this language version.`,
        from: 0,
        to: fieldName.length,
      },
    ]);
  });

  it('rejects reflected relation predicates explicitly', () => {
    expect(analyzeSelectionDocument('comments = "comment-1"', Item).semanticDiagnostics).toEqual([
      {
        channel: 'semantic',
        code: 'selection.semantic.unsupported-relation',
        message: 'Relation Item.comments predicates are unsupported in this language version.',
        from: 0,
        to: 8,
      },
    ]);
  });

  it('checks every member of an in-list against the reflected Field type', () => {
    const analysis = analyzeSelectionDocument('score in [1, "two", true]', Item);

    expect(analysis.selection).toBeUndefined();
    expect(
      analysis.semanticDiagnostics.map(diagnostic => ({
        code: diagnostic.code,
        from: diagnostic.from,
        to: diagnostic.to,
      })),
    ).toEqual([
      { code: 'selection.semantic.incompatible-field-type', from: 13, to: 18 },
      { code: 'selection.semantic.incompatible-field-type', from: 20, to: 24 },
    ]);
  });
});
