import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  editConsoleOrderBy,
  isConsoleOrderableField,
} from './index.js';

const application = {
  entities: [
    {
      name: 'Tag',
      fields: [
        { name: 'id', type: 'id', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'active', type: 'boolean', nullable: false },
        { name: 'score', type: 'number', nullable: true },
        { name: 'status', type: 'enum', enumValues: ['draft', 'published'], nullable: false },
        { name: 'owner', type: 'reference', nullable: false },
        { name: 'metadata', type: 'json', nullable: false },
      ],
    },
  ],
} as const;

describe('Console ordering', () => {
  it('narrows only ordering suggestions using Entity-specific capabilities', () => {
    const options = {
      orderableFields: (entityName: string) =>
        entityName === 'Tag' ? ['name', 'owner', 'unknown'] : [],
    };
    for (const source of ['Tag.orderBy(', 'Tag.where(active = true).orderBy(na).many()']) {
      const position = source.indexOf('orderBy(') + 'orderBy('.length;
      expect(
        completeConsoleDocument(source, position, application, options).items.map(
          item => item.label,
        ),
      ).toEqual(['name']);
      expect(
        completeConsoleDocument(source, position, application, { orderableFields: () => [] }).items,
      ).toEqual([]);
    }
    const other = { entities: [{ ...application.entities[0], name: 'Other' }] };
    const source = 'Other.orderBy(';
    expect(completeConsoleDocument(source, source.length, other, options).items).toEqual([]);
    for (const source of ['Tag.where(', 'Tag.orderBy(name, ', 'Tag.']) {
      expect(completeConsoleDocument(source, source.length, application, options)).toEqual(
        completeConsoleDocument(source, source.length, application),
      );
    }
    expect(analyzeConsoleDocument('Tag.orderBy(id).many()', application).request).toBeDefined();
  });

  it.each([
    ['Tag.orderBy(name).many()', 'run', 'asc', 25],
    ['Tag.orderBy(name, asc).many()', 'run', 'asc', 25],
    ['Tag.orderBy(name, desc).limit(2).many()', 'run', 'desc', 2],
    ['Tag.where(active = true).orderBy(name, desc).first()', 'get', 'desc', 25],
    ['Tag.orderBy(name).one()', 'get', 'asc', 25],
  ])('lowers %s to canonical ordering', (source, mode, direction, limit) => {
    const analysis = analyzeConsoleDocument(source, application);
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toEqual([]);
    expect(analysis.request).toMatchObject({
      mode,
      orderBy: [{ fieldName: 'name', direction }],
      limit,
    });
    const field = analysis.syntax.expression?.orderBy?.field;
    expect(source.slice(field!.from, field!.to)).toBe('name');
  });

  it.each(['id', 'name', 'active', 'score', 'status'])('accepts reflected scalar %s', field => {
    expect(
      analyzeConsoleDocument(`Tag.orderBy(${field}).many()`, application).request,
    ).toBeDefined();
  });

  it.each([
    ['Tag.orderBy(missing).many()', 'invalid-order-field'],
    ['Tag.orderBy(owner).many()', 'invalid-order-field'],
    ['Tag.orderBy(metadata).many()', 'invalid-order-field'],
    ['Tag.orderBy(name, sideways).many()', 'invalid-order-direction'],
    ['Tag.orderBy(name).count()', 'unsupported-order'],
  ])('rejects %s before dispatch', (source, code) => {
    const analysis = analyzeConsoleDocument(source, application);
    expect(analysis.syntaxDiagnostics).toEqual([]);
    expect(analysis.semanticDiagnostics).toContainEqual(
      expect.objectContaining({ code: `console.semantic.${code}` }),
    );
    expect(analysis.request).toBeUndefined();
  });

  it.each([
    'Tag.orderBy',
    'Tag.orderBy(',
    'Tag.orderBy()',
    'Tag.orderBy(name,).many()',
    'Tag.orderBy(name, "desc").many()',
    'Tag.orderBy(name, desc',
    'Tag.limit(2).orderBy(name).many()',
    'Tag.orderBy(name).orderBy(id).many()',
  ])('recovers invalid or incomplete ordering: %s', source => {
    const analysis = analyzeConsoleDocument(source, application);
    expect(analysis.syntaxDiagnostics[0]?.code).toBe('console.syntax.invalid');
    expect(analysis.request).toBeUndefined();
  });

  it('completes members, scalar fields, and directions at source ranges', () => {
    for (const prefix of ['Tag.or', 'Tag.where(all).or']) {
      expect(completeConsoleDocument(prefix, prefix.length, application).items).toEqual([
        expect.objectContaining({ label: 'orderBy', apply: 'orderBy(' }),
      ]);
    }
    for (const source of ['Tag.orderBy(', 'Tag.orderBy(na).many()']) {
      const position = source.includes('na)') ? source.indexOf('na)') + 2 : source.length;
      const completion = completeConsoleDocument(source, position, application);
      expect(completion.from).toBe(source.indexOf('(') + 1);
      expect(completion.items.map(item => item.label)).toEqual([
        'id',
        'name',
        'active',
        'score',
        'status',
      ]);
    }
    const source = 'Tag.orderBy(name, de).many()';
    const completion = completeConsoleDocument(source, source.indexOf('de)') + 2, application);
    expect(completion).toMatchObject({
      from: source.indexOf('de)'),
      to: source.indexOf('de)') + 2,
    });
    expect(completion.items.map(item => item.label)).toEqual(['asc', 'desc']);
    const ordered = 'Tag.orderBy(name).';
    expect(
      completeConsoleDocument(ordered, ordered.length, application).items.map(item => item.label),
    ).toEqual(['limit', 'first', 'one', 'many']);
  });

  it('edits only ordering tokens, preserving the Selection, trivia, limit, and terminal', () => {
    const original =
      '  Tag\n .where(name = "A.orderBy(fake)" and active = false)\n .limit(2).many()  ';
    const applyOrder = (source: string, order: Parameters<typeof editConsoleOrderBy>[2]) => {
      const changes = editConsoleOrderBy(source, application, order);
      expect(changes).toBeDefined();
      return changes!.reduceRight(
        (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to),
        source,
      );
    };
    const asc = applyOrder(original, { fieldName: 'name', direction: 'asc' });
    expect(asc).toBe(original.replace('false)', 'false).orderBy(name)'));
    const desc = applyOrder(asc, { fieldName: 'name', direction: 'desc' });
    expect(desc).toBe(asc.replace('.orderBy(name)', '.orderBy(name, desc)'));
    expect(applyOrder(desc, undefined)).toBe(original);
    const spaced = 'Tag .orderBy( name ,  desc ) .limit(2).many()';
    expect(applyOrder(spaced, { fieldName: 'id', direction: 'asc' })).toBe(
      'Tag .orderBy( id ,  asc ) .limit(2).many()',
    );
    expect(editConsoleOrderBy(asc, application, { fieldName: 'name', direction: 'asc' })).toEqual(
      [],
    );
    expect(editConsoleOrderBy(original, application, undefined)).toEqual([]);
  });

  it('refuses to rewrite invalid drafts or unsupported orders', () => {
    expect(
      editConsoleOrderBy('Tag.many()', application, { direction: 'asc', fieldName: 'name' }),
    ).toEqual([{ from: 3, to: 3, insert: '.orderBy(name)' }]);
    for (const source of [
      'Tag.orderBy(',
      'Tag.count()',
      'Missing.many()',
      'Tag.where(missing = 1).many()',
    ]) {
      expect(
        editConsoleOrderBy(source, application, { fieldName: 'name', direction: 'asc' }),
      ).toBeUndefined();
    }
    expect(
      editConsoleOrderBy('Tag.many()', application, { fieldName: 'owner', direction: 'asc' }),
    ).toBeUndefined();
    expect(
      editConsoleOrderBy('Tag.many()', application, {
        fieldName: 'name).limit(1',
        direction: 'asc',
      }),
    ).toBeUndefined();
    expect(
      application.entities[0].fields.filter(isConsoleOrderableField).map(field => field.name),
    ).toEqual(['id', 'name', 'active', 'score', 'status']);
  });

  it('can analyze every deletion prefix without inventing an executable request', () => {
    const source = 'Tag.where(active = false).orderBy(name, desc).limit(2).many()';
    for (let end = 1; end < source.length; end += 1) {
      expect(analyzeConsoleDocument(source.slice(0, end), application).request).toBeUndefined();
    }
  });
});
