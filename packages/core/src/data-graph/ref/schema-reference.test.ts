import { describe, expect, it } from 'vitest';

import { graphSchemaReference as modelGraphSchemaReference } from '../../model/entity/ref/schema-reference.js';

import { graphSchemaReference } from './schema-reference.js';

describe('data-graph schema reference compatibility facade', () => {
  it('preserves the portable model implementation by identity', () => {
    expect(graphSchemaReference).toBe(modelGraphSchemaReference);
  });
});
