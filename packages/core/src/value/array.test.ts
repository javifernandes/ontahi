import { describe, expect, it } from 'vitest';

import { chunkArray, normalizeUniqueLowercaseStrings } from './array.js';

describe('normalizeUniqueLowercaseStrings', () => {
  it('trims, lowercases, removes empties, and deduplicates while preserving first-seen order', () => {
    expect(
      normalizeUniqueLowercaseStrings([' EN ', 'pt-BR', '', 'en', '  ', 'PT-br', 'fr']),
    ).toEqual(['en', 'pt-br', 'fr']);
  });
});

describe('chunkArray', () => {
  it('splits an array into stable fixed-size chunks', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
