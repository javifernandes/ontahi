import { describe, expect, it } from 'vitest';

import { entity, field } from '../definitions.js';

import { defineEntityRefInput } from './input.js';

describe('Entity Ref input declarations', () => {
  it('describes receiver, optionality, and explicit locator paths as inert metadata', () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });

    const declaration = defineEntityRefInput(Book).receiver().optional().by('slug', ['bookSlug']);

    expect(declaration).toEqual({
      kind: 'entity-ref-input',
      entityName: 'Book',
      isReceiver: true,
      isOptional: true,
      locators: [{ name: 'slug', fields: ['bookSlug'] }],
      inferredLocators: [
        {
          name: 'refById',
          fields: ['id'],
          sourceFields: ['id'],
          toLocator: expect.any(Function),
        },
      ],
    });
  });
});
