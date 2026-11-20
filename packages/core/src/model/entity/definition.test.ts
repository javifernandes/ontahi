import { describe, expectTypeOf, it } from 'vitest';

import type { AnyEntityDefinition as LegacyAnyEntityDefinition } from '../../data-graph/definitions.js';

import type { AnyEntityDefinition } from './definition.js';

describe('Entity structural definition', () => {
  it('preserves the historical data-graph type surface', () => {
    expectTypeOf<LegacyAnyEntityDefinition>().toEqualTypeOf<AnyEntityDefinition>();
  });
});
