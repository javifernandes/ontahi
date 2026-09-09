import { describe, expect, it } from 'vitest';

import { analyzeConsoleDocument, convertConsoleDocument, parseConsoleDocument } from './index.js';

const application = {
  entities: [
    {
      name: 'TodoItem',
      fields: [
        { name: 'title', type: 'string', nullable: true },
        { name: 'completed', type: 'boolean', nullable: false },
        { name: 'priority', type: 'number', nullable: false },
        { name: 'status', type: 'enum', enumValues: ['open', 'closed'], nullable: false },
      ],
    },
  ],
} as const;

describe('Console read dialects', () => {
  it.each([
    ['TodoItem', 'TodoItem.many()'],
    ['TodoItem where completed = false', 'TodoItem.where(completed = false).many()'],
    [
      'TodoItem where all order by title ascending limit 0 many',
      'TodoItem.where(all).orderBy(title, asc).limit(0).many()',
    ],
    ['TodoItem order by title descending first', 'TodoItem.orderBy(title, desc).first()'],
    ['TodoItem where title is null one', 'TodoItem.where(title is null).one()'],
    [
      'TodoItem where status in ["open", "closed"] count',
      'TodoItem.where(status in ["open", "closed"]).count()',
    ],
    ['TodoItem where none exists', 'TodoItem.where(none).exists()'],
    [
      'TodoItem where not completed = true and priority >= 2 or (title = "a\\\"b" and priority < 5) limit 3',
      'TodoItem.where(not completed = true and priority >= 2 or (title = "a\\\"b" and priority < 5)).limit(3).many()',
    ],
    [
      'TodoItem where title = "order by title limit 25 exists"',
      'TodoItem.where(title = "order by title limit 25 exists").many()',
    ],
  ])('lowers and round-trips %s through the same semantic boundary', (declarative, ts) => {
    const options = { dialect: 'declarative', limit: 12 } as const;
    const result = analyzeConsoleDocument(declarative, application, options);
    const expected = analyzeConsoleDocument(ts, application, { limit: 12 });
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.semanticDiagnostics).toEqual([]);
    expect(result.request).toBeDefined();
    expect(result.request).toEqual(expected.request);
    const converted = convertConsoleDocument(declarative, application, 'ts', options)!;
    expect(analyzeConsoleDocument(converted, application, { limit: 12 }).request).toEqual(
      expected.request,
    );
    const back = convertConsoleDocument(converted, application, 'declarative')!;
    expect(analyzeConsoleDocument(back, application, options).request).toEqual(expected.request);
  });

  it.each([
    'where',
    'order',
    'by',
    'ascending',
    'descending',
    'limit',
    'first',
    'one',
    'many',
    'count',
    'exists',
    'orderBy',
  ])('keeps contextual word %s available as Entity and Field', name => {
    const reflected = { entities: [{ name, fields: [{ name, type: 'number', nullable: false }] }] };
    const source = `${name} where ${name} = 2 order by ${name} descending limit 3 many`;
    const analysis = analyzeConsoleDocument(source, reflected, { dialect: 'declarative' });
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.request).toBeDefined();
    const ts = convertConsoleDocument(source, reflected, 'ts', { dialect: 'declarative' })!;
    expect(analyzeConsoleDocument(ts, reflected).request).toEqual(analysis.request);
  });

  it.each([
    '',
    'TodoItem where',
    'TodoItem where completed =',
    'TodoItem order by',
    'TodoItem limit',
    'TodoItem first()',
    'TodoItem order by title desc',
    'TodoItem limit 2 order by title',
    'TodoItem where title = "bad\\q"',
    'TodoItem where missing = true',
    'TodoItem where completed = "false"',
    'TodoItem where status = "missing"',
    'TodoItem limit -1',
    'TodoItem limit 1.5',
    'TodoItem limit 2 one',
    'TodoItem limit 2 first',
    'TodoItem limit 2 exists',
    'TodoItem limit 2 count',
    'TodoItem order by title count',
    'TodoItem order by title exists',
    'TodoItem order by missing',
    'Unknown many',
    'TodoItem -- comment',
    'TodoItem /* comment */',
    'TodoItem where completed == false',
    'TodoItem where (completed = false',
    'TodoItem many many',
  ])('does not convert or lower invalid/empty draft %s', source => {
    const options = { dialect: 'declarative' } as const;
    expect(analyzeConsoleDocument(source, application, options).request).toBeUndefined();
    expect(convertConsoleDocument(source, application, 'ts', options)).toBeUndefined();
  });

  it('keeps diagnostics at the original declarative source positions', () => {
    const source = 'TodoItem where missing = true';
    expect(
      analyzeConsoleDocument(source, application, { dialect: 'declarative' }).semanticDiagnostics,
    ).toEqual([
      expect.objectContaining({ code: 'selection.semantic.unknown-field', from: 15, to: 22 }),
    ]);
    const malformed = 'TodoItem where completed =';
    const parsed = parseConsoleDocument(malformed, 'declarative');
    expect(parsed.syntaxDiagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of parsed.syntaxDiagnostics) {
      expect(diagnostic.from).toBeGreaterThanOrEqual(0);
      expect(diagnostic.to).toBeLessThanOrEqual(malformed.length);
    }
  });

  it('preserves exists authoring intent even when first has the same wire body', () => {
    const options = { limit: 1 };
    const exists = 'TodoItem.exists()';
    const first = 'TodoItem.first()';
    expect(analyzeConsoleDocument(exists, application, options).request).toEqual(
      analyzeConsoleDocument(first, application, options).request,
    );
    expect(convertConsoleDocument(exists, application, 'declarative', options)).toBe(
      'TodoItem exists',
    );
    expect(convertConsoleDocument(first, application, 'declarative', options)).toBe(
      'TodoItem first',
    );
  });

  it('keeps predicate spelling and grouping; same-dialect conversion keeps the entire source', () => {
    const source = '  TodoItem.where( ( completed = false )  or priority = 2e0 ).many()  ';
    expect(convertConsoleDocument(source, application, 'ts')).toBe(source);
    expect(convertConsoleDocument(source, application, 'declarative')).toBe(
      'TodoItem where ( completed = false )  or priority = 2e0 many',
    );
    expect(
      convertConsoleDocument('TodoItem.where(completed = false).one', application, 'declarative'),
    ).toBeUndefined();
  });
});
