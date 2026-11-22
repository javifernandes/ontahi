import { describe, expect, it } from 'vitest';

import { withinSelectionBudget } from './selection-budget.js';

describe('Selection budget', () => {
  it('rejects sparse boolean operands without throwing', () => {
    const operands = new Array(1);
    expect(withinSelectionBudget({ kind: 'and', operands })).toBe(false);
  });
});
