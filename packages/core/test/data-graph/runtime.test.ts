import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  entity,
  field,
  mapEntity,
  query,
  type DataGraphRuntime,
} from '../../src/data-graph/index.js';

describe('data-graph runtime contract', () => {
  it('allows the in-memory runtime to satisfy the shared runtime interface', async () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
    });

    mapEntity(Book).toTable('books');

    const runtime: DataGraphRuntime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [{ id: 'book-1', slug: 'progbook' }],
      },
    });

    const result = await Effect.runPromise(
      runtime.get(
        query(Book).where(book => book.slug.eq('progbook')),
        undefined,
      ),
    );

    expect(result).toEqual({
      id: 'book-1',
      slug: 'progbook',
    });
  });
});
