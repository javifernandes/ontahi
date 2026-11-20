import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  EntityLocatorDeclarations as LegacyEntityLocatorDeclarations,
  EntityRefLocatorFactories as LegacyEntityRefLocatorFactories,
} from '../../data-graph/definitions.js';

import type { FieldDefinition } from './field.js';
import {
  normalizeEntityLocatorDeclarations,
  type EntityLocatorDeclarations,
  type EntityRefLocatorFactories,
} from './locator.js';

type BookFields = {
  id: FieldDefinition<string>;
  edition: FieldDefinition<number>;
};

describe('Entity locator model', () => {
  it('normalizes field and composite declarations into locator factories', () => {
    const locators = normalizeEntityLocatorDeclarations<
      BookFields,
      {
        refById: 'id';
        refByEdition: readonly ['id', 'edition'];
      }
    >({ refById: 'id', refByEdition: ['id', 'edition'] });

    expect(locators.refById('book-1')).toEqual({ id: 'book-1' });
    expect(locators.refByEdition('book-1', 2)).toEqual({ id: 'book-1', edition: 2 });
    expect(locators.refByEdition.fields).toEqual(['id', 'edition']);
  });

  it('preserves the historical data-graph type surface', () => {
    expectTypeOf<LegacyEntityLocatorDeclarations<BookFields>>().toEqualTypeOf<
      EntityLocatorDeclarations<BookFields>
    >();
    expectTypeOf<LegacyEntityRefLocatorFactories<BookFields, { refById: 'id' }>>().toEqualTypeOf<
      EntityRefLocatorFactories<BookFields, { refById: 'id' }>
    >();
  });
});
