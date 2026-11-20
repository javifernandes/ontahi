import { describe, expect, it } from 'vitest';

import { getEntityIdentityLocator as getModelEntityIdentityLocator } from '../../model/entity/ref/identity.js';

import { getEntityIdentityLocator } from './identity.js';

describe('data-graph Entity identity compatibility facade', () => {
  it('preserves the portable model implementation by identity', () => {
    expect(getEntityIdentityLocator).toBe(getModelEntityIdentityLocator);
  });
});
