import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  createInMemoryReflectedEntityDataReader,
  entity,
  field,
  query,
  type InMemoryDataset,
} from '../../src/data-graph/index.js';

describe('in-memory reflected entity data', () => {
  it('searches, filters, sorts, paginates, and observes live graph mutations', async () => {
    const Book = entity('Book', {
      id: field.id(),
      title: field.string(),
      published: field.boolean(),
      score: field.number(),
    }).display({
      primary: 'title',
      search: ['title'],
    });
    const dataset: InMemoryDataset = {
      Book: [
        { id: 'book-1', title: 'Alpha', published: true, score: 3 },
        { id: 'book-2', title: 'Beta', published: false, score: 2 },
        { id: 'book-3', title: 'Alphabet', published: true, score: 1 },
      ],
    };
    const runtime = createInMemoryDataGraphRuntime({ dataset });
    const reader = createInMemoryReflectedEntityDataReader({
      entities: [Book],
      dataset,
      pageSizeOptions: [1, 2],
    });

    await expect(
      reader.readEntityData({
        entityName: 'Book',
        search: 'alpha',
        filters: [{ field: 'published', operator: 'equals', value: 'true' }],
        sort: { field: 'score', direction: 'asc' },
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toMatchObject({
      entityName: 'Book',
      display: { primary: 'title', search: ['title'] },
      rows: [{ id: 'book-3', title: 'Alphabet', published: true, score: 1 }],
      page: 1,
      pageSize: 1,
      totalCount: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });

    await Effect.runPromise(
      runtime.runCommand({
        kind: 'command',
        operation: 'update',
        root: Book,
        selection: query(Book)
          .where(book => book.id.eq('book-2'))
          .build().selection,
        payload: { title: 'Beta revised' },
        cardinality: 'one',
      }),
    );

    await expect(
      reader.readEntityData({ entityName: 'Book', search: 'revised' }),
    ).resolves.toMatchObject({
      rows: [{ id: 'book-2', title: 'Beta revised', published: false, score: 2 }],
      totalCount: 1,
    });
    await expect(reader.readEntityData({ entityName: 'Missing' })).rejects.toThrow(
      'Unknown graph entity: Missing',
    );
  });
});
