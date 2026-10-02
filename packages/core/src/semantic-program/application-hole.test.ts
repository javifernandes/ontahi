import { describe, expect, it } from 'vitest';

import { applicationHole, isApplicationHole } from './application-hole.js';

describe('Application Hole', () => {
  it('creates a shared named Hole term', () => {
    expect(applicationHole('subject')).toEqual({ kind: 'hole', id: 'subject' });
    expect(isApplicationHole({ kind: 'hole', id: 'subject' })).toBe(true);
  });

  it('rejects empty or malformed Hole terms', () => {
    expect(() => applicationHole('')).toThrow('Application Hole id must not be empty.');
    expect(isApplicationHole(null)).toBe(false);
    expect(isApplicationHole({ kind: 'value', id: 'subject' })).toBe(false);
    expect(isApplicationHole({ kind: 'hole', id: '' })).toBe(false);
  });
});
