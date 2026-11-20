import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  isReferenceFieldDefinition as isLegacyReferenceFieldDefinition,
  type ReferenceFieldDefinition as LegacyReferenceFieldDefinition,
} from '../../data-graph/definitions.js';

import type { AnyEntityDefinition } from './definition.js';
import { isReferenceFieldDefinition, type ReferenceFieldDefinition } from './reference-field.js';

describe('Reference Field model', () => {
  it('recognizes portable Reference Field declarations', () => {
    const target = { kind: 'entity', name: 'Book' } as AnyEntityDefinition;
    const reference = { kind: 'field', fieldType: 'reference', target } as ReferenceFieldDefinition;
    expect(isReferenceFieldDefinition(reference)).toBe(true);
  });

  it('preserves historical behavior and types through definitions', () => {
    expect(isLegacyReferenceFieldDefinition).toBe(isReferenceFieldDefinition);
    expectTypeOf<LegacyReferenceFieldDefinition>().toEqualTypeOf<ReferenceFieldDefinition>();
  });
});
