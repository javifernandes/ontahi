import { describe, expect, it } from 'vitest';

import {
  createEntityLocatorRefs as createCompatibilityLocatorRefs,
  createGraphClientCache as createCompatibilityCache,
  reconcileGraphReadSnapshot as reconcileCompatibilitySnapshot,
} from '../../../data-graph/client/cache/index.js';

import {
  createEntityLocatorRefs,
  createGraphClientCache,
  reconcileGraphReadSnapshot,
} from './index.js';

describe('Graph client cache runtime boundary', () => {
  it('owns the implementation behind the historical cache exports', () => {
    expect(createCompatibilityCache).toBe(createGraphClientCache);
    expect(createCompatibilityLocatorRefs).toBe(createEntityLocatorRefs);
    expect(reconcileCompatibilitySnapshot).toBe(reconcileGraphReadSnapshot);
  });
});
