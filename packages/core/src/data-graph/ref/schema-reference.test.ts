import { describe, expect, it, vi } from 'vitest';

import { entity, field, graphSchema } from '../definitions.js';
import { toGraphSchemaDescriptor } from '../schema-descriptor.js';

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
});
