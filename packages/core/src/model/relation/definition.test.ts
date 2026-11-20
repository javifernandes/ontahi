import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  assertPortableRelationConstraints as assertLegacyPortableRelationConstraints,
  type RelationDefinition as LegacyRelationDefinition,
} from '../../data-graph/definitions.js';

import { assertPortableRelationConstraints, type RelationDefinition } from './definition.js';

describe('Relation model definition', () => {
  it('accepts JSON-safe portable constraints', () => {
    expect(() =>
      assertPortableRelationConstraints([
        {
          kind: 'participant-selection',
          participant: 'target',
          selection: { kind: 'predicate', operator: 'eq', fieldName: 'active', value: true },
          rejection: { version: 1, code: 'inactive', message: 'Target must be active.' },
        },
      ]),
    ).not.toThrow();
  });

  it('preserves historical behavior and types through the data-graph facade', () => {
    expect(assertLegacyPortableRelationConstraints).toBe(assertPortableRelationConstraints);
    expectTypeOf<LegacyRelationDefinition>().toEqualTypeOf<RelationDefinition>();
  });
});
