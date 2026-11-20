import { describe, expect, it } from 'vitest';

import {
  createEntityRef as createModelEntityRef,
  normalizeEntityRef as normalizeModelEntityRef,
} from '../../model/entity/ref/model.js';

import { createEntityRef, normalizeEntityRef } from './model.js';

describe('data-graph Entity ref compatibility facade', () => {
  it('preserves the portable model implementation by identity', () => {
    expect(createEntityRef).toBe(createModelEntityRef);
    expect(normalizeEntityRef).toBe(normalizeModelEntityRef);
  });
});
