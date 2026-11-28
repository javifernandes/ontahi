import { describe, expect, it } from 'vitest';

import { diffEntityPublication } from '../../index.js';

describe('diffEntityPublication', () => {
  it('compares Source Record content digests and provenance without loading bodies', () => {
    const kept = { id: 'keep', digest: 'same', revision: 'r1' };
    const before = [
      kept,
      { id: 'edit', digest: 'before', revision: 'r1' },
      { id: 'provenance', digest: 'same', revision: 'r1' },
      { id: 'remove', digest: 'old', revision: 'r1' },
    ];
    const after = [
      { ...kept, body: 'kept' },
      { id: 'provenance', digest: 'same', revision: 'r2', body: 'same content' },
      { id: 'new', digest: 'new', revision: 'r2', body: 'new content' },
      { id: 'edit', digest: 'after', revision: 'r1', body: 'changed content' },
    ];

    const diff = diffEntityPublication({
      current: before,
      candidate: after,
      equals: (previous, next) =>
        previous.digest === next.digest && previous.revision === next.revision,
      scopeOf: () => 'records',
      completeScopes: new Map([['records', () => true]]),
    });

    expect(diff).toEqual({
      puts: [after[3], after[2], after[1]],
      removes: ['remove'],
      compared: 3,
      reused: 1,
    });
  });

  it('produces the full-rebuild relation set and converges on replay', () => {
    const kept = { id: 'a->b', source: 'a', target: 'b', revision: 'r1' };
    const old = { id: 'b->c', source: 'b', target: 'c', revision: 'r1' };
    const updated = { ...old, revision: 'r2' };
    const added = { id: 'a->d', source: 'a', target: 'd', revision: 'r2' };
    const current = [old, kept, { id: 'a->c', source: 'a', target: 'c', revision: 'r1' }];
    const candidate = [updated, added, kept];

    const compare = (previousRows: typeof current, nextRows: typeof candidate) =>
      diffEntityPublication({
        current: previousRows,
        candidate: nextRows,
        equals: (previous, next) =>
          previous.source === next.source &&
          previous.target === next.target &&
          previous.revision === next.revision,
        scopeOf: () => 'relations',
        completeScopes: new Map([['relations', () => true]]),
      });

    const diff = compare(current, candidate);
    expect(diff).toEqual({
      puts: [added, updated],
      removes: ['a->c'],
      compared: 2,
      reused: 1,
    });
    expect(compare([...current].reverse(), [...candidate].reverse())).toEqual(diff);

    const result = new Map(current.map(row => [row.id, row]));
    for (const id of diff.removes) result.delete(id);
    for (const row of diff.puts) result.set(row.id, row);

    expect(result).toEqual(new Map(candidate.map(row => [row.id, row])));
    expect(compare([...result.values()], candidate)).toEqual({
      puts: [],
      removes: [],
      compared: 3,
      reused: 3,
    });
  });

  it('scopes Evidence Binding omissions independently from positive writes', () => {
    const retained = { id: 'b/keep', source: 'b', positivePosition: 21 };
    const omitted = { id: 'a/old', source: 'a', positivePosition: 10 };
    const added = { id: 'b/new', source: 'b', positivePosition: 23 };
    const newer = { id: 'a/newer', source: 'a', positivePosition: 22 };

    const compare = (coverage: number) =>
      diffEntityPublication({
        current: [retained, omitted, newer],
        candidate: [added],
        equals: (previous, next) => previous.positivePosition === next.positivePosition,
        scopeOf: row => row.source,
        // An observation at 20 omitted a/newer. The diff runs after a positive at 22 is accepted.
        completeScopes: new Map([['a', (row: typeof newer) => row.positivePosition < coverage]]),
      });

    expect(compare(20)).toEqual({
      puts: [added],
      removes: ['a/old'],
      compared: 0,
      reused: 2,
    });
    expect(compare(22)).toEqual(compare(20));
    expect(compare(24)).toEqual({
      puts: [added],
      removes: ['a/newer', 'a/old'],
      compared: 0,
      reused: 1,
    });
  });

  it.each(['current', 'candidate'] as const)('rejects duplicate %s identities', side => {
    const row = { id: 'duplicate' };
    const equals = () => {
      throw new Error('Equality must not run before validating identities.');
    };
    expect(() =>
      diffEntityPublication({
        current: side === 'current' ? [row, row] : [row],
        candidate: side === 'candidate' ? [row, row] : [row],
        equals,
        scopeOf: () => 'all',
        completeScopes: new Map(),
      }),
    ).toThrow(`Duplicate ${side} entity publication identity: duplicate.`);
  });
});
