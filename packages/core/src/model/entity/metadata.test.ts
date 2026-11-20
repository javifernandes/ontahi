import { describe, expectTypeOf, it } from 'vitest';

import type {
  EntityDisplayMetadata as LegacyEntityDisplayMetadata,
  EntityFreshnessMetadata as LegacyEntityFreshnessMetadata,
} from '../../data-graph/definitions.js';

import type { EntityDisplayMetadata, EntityFreshnessMetadata } from './metadata.js';

type BookFields = {
  id: { kind: 'field' };
  title: { kind: 'field' };
  updatedAt: { kind: 'field' };
};

describe('Entity metadata model', () => {
  it('restricts field-backed metadata to declared Entity fields', () => {
    expectTypeOf<EntityDisplayMetadata<BookFields>['primary']>().toEqualTypeOf<
      keyof BookFields | `${string}.${string}` | undefined
    >();
    expectTypeOf<EntityFreshnessMetadata<BookFields>['updatedAt']>().toEqualTypeOf<
      keyof BookFields | undefined
    >();
  });

  it('preserves the historical data-graph type surface', () => {
    expectTypeOf<LegacyEntityDisplayMetadata<BookFields>>().toEqualTypeOf<
      EntityDisplayMetadata<BookFields>
    >();
    expectTypeOf<LegacyEntityFreshnessMetadata<BookFields>>().toEqualTypeOf<
      EntityFreshnessMetadata<BookFields>
    >();
  });
});
