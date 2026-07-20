import { describe, expect, it } from 'vitest';

import { applyOrder, applyPredicates } from '../../src/data-graph/in-memory/query.js';

describe('in-memory query helpers', () => {
  const rows = [
    { id: 'b', title: 'Beta', order: 2, publishedAt: '2026-02-01', deletedAt: null },
    { id: 'a', title: 'Alpha', order: 1, publishedAt: '2026-01-01', deletedAt: null },
    { id: 'c', title: 'Gamma', order: 3, publishedAt: null, deletedAt: '2026-03-01' },
  ];

  it('applies supported predicates to in-memory rows', () => {
    expect(
      applyPredicates(rows, [{ kind: 'predicate', operator: 'eq', fieldName: 'id', value: 'a' }]),
    ).toEqual([rows[1]]);
    expect(
      applyPredicates(rows, [
        { kind: 'predicate', operator: 'in', fieldName: 'id', values: ['a', 'c'] },
      ]),
    ).toEqual([rows[1], rows[2]]);
    expect(
      applyPredicates(rows, [
        { kind: 'predicate', operator: 'lte', fieldName: 'publishedAt', value: '2026-01-15' },
      ]),
    ).toEqual([rows[1]]);
    expect(
      applyPredicates(rows, [
        { kind: 'predicate', operator: 'lt', fieldName: 'publishedAt', value: '2026-02-01' },
      ]),
    ).toEqual([rows[1]]);
    expect(
      applyPredicates(rows, [{ kind: 'predicate', operator: 'isNull', fieldName: 'deletedAt' }]),
    ).toEqual([rows[0], rows[1]]);
  });

  it('orders in-memory rows by multiple fields and handles nullish values', () => {
    expect(applyOrder(rows, [])).toEqual(rows);
    expect(applyOrder(rows, [{ kind: 'order', fieldName: 'title', direction: 'asc' }])).toEqual([
      rows[1],
      rows[0],
      rows[2],
    ]);
    expect(applyOrder(rows, [{ kind: 'order', fieldName: 'order', direction: 'desc' }])).toEqual([
      rows[2],
      rows[0],
      rows[1],
    ]);
    expect(
      applyOrder(rows, [
        { kind: 'order', fieldName: 'deletedAt', direction: 'asc' },
        { kind: 'order', fieldName: 'title', direction: 'desc' },
      ]),
    ).toEqual([rows[0], rows[1], rows[2]]);
  });
});
