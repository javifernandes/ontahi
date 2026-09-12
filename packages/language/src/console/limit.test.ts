import { describe, expect, it } from 'vitest';

import { analyzeConsoleDocument, editConsoleLimit } from '../index.js';

const application = {
  entities: [{ name: 'Tag', fields: [{ name: 'name', type: 'string', nullable: false }] }],
};

describe('Console limit source edits', () => {
  it.each([
    ['  Tag .many() ', '  Tag.limit(3) .many() '],
    [
      'Tag.where(name = "fake.limit(1)")\n .many()',
      'Tag.where(name = "fake.limit(1)").limit(3)\n .many()',
    ],
    ['Tag.orderBy(name, desc) .many()', 'Tag.orderBy(name, desc).limit(3) .many()'],
    ['Tag .limit( 25 ) .many()', 'Tag .limit( 3 ) .many()'],
  ])('preserves unrelated source in %s', (source, expected) => {
    const changes = editConsoleLimit(source, application, 3);
    expect(changes).toBeDefined();
    const edited = changes!.reduceRight(
      (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to),
      source,
    );
    expect(edited).toBe(expected);
    const before = analyzeConsoleDocument(source, application).request;
    expect(analyzeConsoleDocument(edited, application).request).toEqual({ ...before, limit: 3 });
  });

  it('supports zero, unchanged limits, and rejects invalid values or non-many drafts', () => {
    expect(editConsoleLimit('Tag.many()', application, 0)).toEqual([
      { from: 3, to: 3, insert: '.limit(0)' },
    ]);
    expect(editConsoleLimit('Tag.limit(3).many()', application, 3)).toEqual([]);
    for (const limit of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(editConsoleLimit('Tag.many()', application, limit)).toBeUndefined();
    for (const source of [
      'Tag.count()',
      'Tag.exists()',
      'Tag.first()',
      'Tag.one()',
      'Tag.limit(',
      'Missing.many()',
    ])
      expect(editConsoleLimit(source, application, 3)).toBeUndefined();
  });
});
