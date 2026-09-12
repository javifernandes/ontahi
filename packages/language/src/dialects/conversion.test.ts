import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  convertConsoleDocument,
  parseConsoleDocument,
  completeConsoleDocument,
  editConsoleLimit,
  editConsoleOrderBy,
} from '../index.js';

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
  it.each(['Tag by named', 'Tag by named "Important" and by'])(
    'includes factory intersections in the grammar guidance for %s',
    source => {
      const parsed = parseConsoleDocument(source, 'declarative');
      expect(parsed.syntaxDiagnostics[0]).toMatchObject({
        code: 'console.syntax.invalid',
        message:
          'Expected Entity, optional by factory argument (and by factory argument)*, optional where predicate, order by Field [ascending|descending], limit number, and terminal (many, first, one, count, exists).',
      });
    },
  );

  it.each([
    ['To', ['TodoItem']],
    ['TodoItem ', ['where', 'order by', 'limit', 'many', 'first', 'one', 'count', 'exists']],
    ['TodoItem wh', ['where']],
    ['TodoItem where comp', ['completed']],
    ['TodoItem where completed = ', ['true', 'false']],
    ['TodoItem where completed = false ', ['and', 'or', 'order by', 'limit', 'many', 'exists']],
    ['TodoItem where completed = false ord', ['order by']],
    ['TodoItem order ', ['by']],
    ['TodoItem order by ', ['title']],
    ['TodoItem order by ti', ['title']],
    ['TodoItem order by title ', ['ascending', 'descending', 'limit', 'first', 'many']],
    ['TodoItem order by title desc', ['descending']],
    ['TodoItem limit 3 ', ['many']],
  ] as const)('completes declarative draft %s', (source, expected) => {
    const items = completeConsoleDocument(source, source.length, application, {
      dialect: 'declarative',
      orderableFields: () => ['title'],
    }).items;
    expect(items.map(item => item.label)).toEqual(expect.arrayContaining([...expected]));
    if (source.includes('order by ') && !source.includes('title'))
      expect(items.some(item => item.label === 'completed')).toBe(false);
    expect(
      items.filter(item => item.kind === 'member').every(item => !item.apply.includes('(')),
    ).toBe(true);
  });

  it('applies capability hints without affecting predicate completion or semantic validity', () => {
    const source = 'TodoItem order by ';
    const options = { dialect: 'declarative', orderableFields: () => [] } as const;
    expect(completeConsoleDocument(source, source.length, application, options).items).toEqual([]);
    const predicate = 'TodoItem where comp';
    expect(
      completeConsoleDocument(predicate, predicate.length, application, options).items.map(
        item => item.label,
      ),
    ).toContain('completed');
    expect(
      analyzeConsoleDocument(source + 'completed', application, options).request,
    ).toBeDefined();
  });

  it('edits declarative ordering and limit without rewriting unrelated source', () => {
    const options = { dialect: 'declarative' } as const;
    let source = '  TodoItem where ( completed = false )  many  ';
    const apply = (changes: ReturnType<typeof editConsoleOrderBy>) => {
      expect(changes).toBeDefined();
      for (const change of [...changes!].reverse())
        source = source.slice(0, change.from) + change.insert + source.slice(change.to);
      expect(analyzeConsoleDocument(source, application, options).request).toBeDefined();
    };
    apply(
      editConsoleOrderBy(source, application, { fieldName: 'title', direction: 'asc' }, options),
    );
    expect(source).toBe('  TodoItem where ( completed = false ) order by title  many  ');
    apply(
      editConsoleOrderBy(source, application, { fieldName: 'title', direction: 'desc' }, options),
    );
    expect(source).toContain('order by title descending');
    apply(editConsoleLimit(source, application, 0, options));
    expect(source).toContain('descending limit 0  many');
    apply(editConsoleLimit(source, application, 4, options));
    apply(
      editConsoleOrderBy(source, application, { fieldName: 'priority', direction: 'asc' }, options),
    );
    expect(source).toContain('order by priority ascending limit 4');
    apply(editConsoleOrderBy(source, application, undefined, options));
    expect(source).toBe('  TodoItem where ( completed = false )  limit 4  many  ');
    expect(editConsoleLimit('TodoItem', application, 2, options)).toEqual([
      { from: 8, to: 8, insert: ' limit 2' },
    ]);
    expect(editConsoleLimit('TodoItem one', application, 2, options)).toBeUndefined();
    expect(editConsoleOrderBy('TodoItem where', application, undefined, options)).toBeUndefined();
  });
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
