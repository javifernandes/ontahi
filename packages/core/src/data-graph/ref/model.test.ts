import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entityRefsEqual,
  isEntityRef,
  isEntityRefLocatorValue,
  normalizeEntityRef,
} from './model.js';

describe('portable Entity Ref model', () => {
  it('creates, recognizes, and compares stable portable identities', () => {
    const left = createEntityRef('Book', {
      slug: 'progbook',
      path: { chapter: 'intro', part: 'foundations' },
    });
    const right = createEntityRef('Book', {
      path: { part: 'foundations', chapter: 'intro' },
      slug: 'progbook',
    });

    expect(isEntityRef(left)).toBe(true);
    expect(normalizeEntityRef(left)).toBe(
      'Book:{"path":{"chapter":"intro","part":"foundations"},"slug":"progbook"}',
    );
    expect(entityRefsEqual(left, right)).toBe(true);
  });

  it('accepts only transport-safe locator values', () => {
    expect(isEntityRefLocatorValue({ path: ['part', 2, true, null] })).toBe(true);
    expect(isEntityRefLocatorValue({ createdAt: new Date() })).toBe(false);
  });
});
