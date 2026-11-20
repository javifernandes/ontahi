import { describe, expect, it } from 'vitest';

import { entity, field, mapEntity as legacyMapEntity } from '../data-graph/definitions.js';

import { getEntityMapping, mapEntity } from './entity-mapping.js';

describe('Entity physical mapping computation', () => {
  it('projects model Fields to storage names without owning Entity semantics', () => {
    const Book = entity('MappedBook', {
      id: field.id(),
      title: field.string(),
      summary: field.derived(field.string(), () => 'derived'),
    });

    mapEntity(Book).toTable('books', { title: 'book_title' });

    expect(getEntityMapping(Book)).toEqual({
      tableName: 'books',
      columns: { id: 'id', title: 'book_title' },
    });
    expect(legacyMapEntity).toBe(mapEntity);
  });
});
