import { describe, expect, it } from 'vitest';

import { isThenable } from './async.js';

describe('isThenable', () => {
  it('returns true for promises', () => {
    expect(isThenable(Promise.resolve('ok'))).toBe(true);
  });

  it('returns false for non-thenables', () => {
    expect(isThenable({ ok: true })).toBe(false);
  });
});
