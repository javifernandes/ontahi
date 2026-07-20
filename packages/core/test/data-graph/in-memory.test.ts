import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  entity,
  field,
  mapEntity,
  query,
  view,
} from '../../src/data-graph/index.js';

import { defineAudienceGraph, defineReaderGraph } from './fixtures.js';

describe('data-graph in-memory runtime', () => {
  it('materializes missing belongsTo relations as null', async () => {
    const { BookWithCollaborators } = defineAudienceGraph();

    const audienceView = view(
      'audience',
      BookWithCollaborators,
      ({ root, params }: { root: typeof BookWithCollaborators; params: { slug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.slug))
          .include(book => ({
            collaborators: book.collaborators.include(collaborator => ({
              profile: collaborator.profile,
            })),
          })),
    );

    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [{ id: 'book-1', slug: 'progbook' }],
        BookCollaborator: [{ bookId: 'book-1', userId: 'missing-profile' }],
        Profile: [],
      },
    });

    const result = await Effect.runPromise(runtime.get(audienceView, { slug: 'progbook' }));

    expect(result).toEqual({
      id: 'book-1',
      slug: 'progbook',
      collaborators: [
        {
          bookId: 'book-1',
          userId: 'missing-profile',
          profile: null,
        },
      ],
    });
  });

  it('applies relation ordering and limit before materializing children', async () => {
    const { BookWithChapters } = defineReaderGraph();

    const readerView = view(
      'reader',
      BookWithChapters,
      ({ root, params }: { root: typeof BookWithChapters; params: { slug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.slug))
          .include(book => ({
            chapters: book.chapters.orderBy(chapter => chapter.order).limit(2),
          })),
    );

    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [{ id: 'book-1', slug: 'progbook' }],
        Chapter: [
          { id: 'chapter-3', bookId: 'book-1', title: 'Third', order: 3 },
          { id: 'chapter-1', bookId: 'book-1', title: 'First', order: 1 },
          { id: 'chapter-2', bookId: 'book-1', title: 'Second', order: 2 },
        ],
      },
    });

    const result = await Effect.runPromise(runtime.get(readerView, { slug: 'progbook' }));

    expect(result).toEqual({
      id: 'book-1',
      slug: 'progbook',
      chapters: [
        { id: 'chapter-1', bookId: 'book-1', title: 'First', order: 1 },
        { id: 'chapter-2', bookId: 'book-1', title: 'Second', order: 2 },
      ],
    });
  });

  it('supports nested selection objects in projected results', async () => {
    const Book = entity('Book', {
      id: field.id(),
      slug: field.string(),
      title: field.string(),
      version: field.string(),
    });

    mapEntity(Book).toTable('books');

    const summaryView = view(
      'summary',
      Book,
      ({ root, params }: { root: typeof Book; params: { slug: string } }) =>
        query(root)
          .where(book => book.slug.eq(params.slug))
          .select(book => ({
            meta: {
              slug: book.slug,
              title: book.title,
            },
            release: {
              version: book.version,
            },
          })),
    );

    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        Book: [{ id: 'book-1', slug: 'progbook', title: 'Progbook', version: 'v1' }],
      },
    });

    const result = await Effect.runPromise(runtime.get(summaryView, { slug: 'progbook' }));

    expect(result).toEqual({
      meta: {
        slug: 'progbook',
        title: 'Progbook',
      },
      release: {
        version: 'v1',
      },
    });
  });
});
