import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { InferGraphSchemaClientInput } from '../client-input.js';
import { entity, field, graphSchema } from '../definitions.js';
import { toGraphJsonSchema, toGraphSchemaDescriptor } from '../schema-descriptor.js';

import type { EntityRef } from './model.js';
import { getGraphSchemaReferenceResolver } from './schema-reference.js';

describe('schema-native Entity Ref input', () => {
  it('keeps custom resolution outside reflected and portable schema metadata', () => {
    const Book = entity('SchemaRefBook', {
      id: field.id(),
      slug: field.string(),
    }).locators({ refBySlug: 'slug' });
    const resolver = vi.fn();
    const reference = graphSchema.ref(Book).resolveWith(resolver);

    expect(getGraphSchemaReferenceResolver(reference)).toBe(resolver);
    expect(Object.keys(reference)).toEqual(['kind', 'fieldType', 'target']);
    expect(toGraphSchemaDescriptor(reference)).toEqual({
      kind: 'entity-ref',
      entityName: 'SchemaRefBook',
      identity: { name: 'refById', fields: ['id'] },
    });
  });

  it('does not mutate the base schema node when adding a custom resolver', () => {
    const Book = entity('ImmutableSchemaRefBook', { id: field.id() });
    const base = graphSchema.ref(Book);
    const resolved = base.resolveWith(() => ({ title: 'Ontahi' }));

    expect(resolved).not.toBe(base);
    expect(getGraphSchemaReferenceResolver(base)).toBeUndefined();
    expect(getGraphSchemaReferenceResolver(resolved)).toEqual(expect.any(Function));
  });

  it('declares an existing participant while keeping the public input portable', () => {
    const Book = entity('ExistingSchemaRefBook', {
      id: field.id(),
      title: field.string(),
    });
    const input = graphSchema.object({ book: graphSchema.existingRef(Book) });
    type ClientInput = InferGraphSchemaClientInput<typeof input>;

    expectTypeOf<ClientInput>().toEqualTypeOf<{
      book: EntityRef<'ExistingSchemaRefBook'>;
    }>();
    expect(toGraphSchemaDescriptor(input.fields.book)).toEqual({
      kind: 'entity-ref',
      entityName: 'ExistingSchemaRefBook',
      identity: { name: 'refById', fields: ['id'] },
      resolution: 'existing',
    });
    expect(toGraphJsonSchema(input.fields.book)['x-ontahi-entity-ref']).toEqual({
      entityName: 'ExistingSchemaRefBook',
      identity: { name: 'refById', fields: ['id'] },
      resolution: 'existing',
    });
  });

  it('rejects an existing participant whose Entity reserves the projected ref property', () => {
    const Book = entity('ExistingSchemaRefCollisionBook', {
      id: field.id(),
      ref: field.string(),
    });

    expect(() => graphSchema.existingRef(Book)).toThrow(
      'Existing Ref target ExistingSchemaRefCollisionBook cannot declare a Field named "ref"',
    );
  });
});
