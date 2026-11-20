import { describe, expect, it } from 'vitest';

import { isEntityVariantDescriptor as isLegacyEntityVariantDescriptor } from '../../data-graph/entity-variant-contract.js';

import { isEntityVariantDescriptor } from './variant-contract.js';

describe('Entity variant contract model', () => {
  it('preserves descriptor validation through the historical facade', () => {
    const descriptor = {
      kind: 'entity-variant' as const,
      name: 'PublishedBook',
      baseEntityName: 'Book',
      discriminator: { fieldName: 'status', value: 'published' },
    };

    expect(isEntityVariantDescriptor(descriptor)).toBe(true);
    expect(isLegacyEntityVariantDescriptor).toBe(isEntityVariantDescriptor);
  });
});
