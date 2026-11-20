import { describe, expect, expectTypeOf, it } from 'vitest';

import { field as legacyField } from '../../data-graph/definitions.js';

import { scalarField } from './scalar-field-authoring.js';

describe('scalar Field authoring', () => {
  it('owns the scalar factories used by the compatibility facade', () => {
    expect(legacyField.string).toBe(scalarField.string);
    expect(legacyField.id).toBe(scalarField.id);

    const status = scalarField.enum(['ready', 'done'] as const);
    expect(status).toEqual({ kind: 'field', fieldType: 'enum', enumValues: ['ready', 'done'] });
    expectTypeOf(status.__value).toEqualTypeOf<'ready' | 'done' | undefined>();
  });

  it('normalizes regular expressions without retaining runtime RegExp instances', () => {
    expect(scalarField.string({ pattern: /^ready$/i })).toMatchObject({
      stringConstraints: { pattern: { source: '^ready$', flags: 'i' } },
    });
  });
});
