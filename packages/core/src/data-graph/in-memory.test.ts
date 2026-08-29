import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineAudienceGraph, defineReaderGraph } from './fixtures.test-support.js';

import {
  createInMemoryDataGraphRuntime,
  entity,
  field,
  mapEntity,
  modelExpression,
  query,
  Selection,
  view,
} from './index.js';

describe('data-graph in-memory runtime', () => {
  it('filters and orders with virtual derived Field values before projection', async () => {
    const Course = entity('QueryableCourse', {
      id: field.id(),
      capacity: field.nonNegativeInteger(),
      availableSeats: field.derived(
        field.nonNegativeInteger(),
        modelExpression.define(
          modelExpression.subtract(
            modelExpression.field('capacity'),
            modelExpression.relation('students').count(),
          ),
        ),
      ),
    });
    const Student = entity('QueryableStudent', {
      id: field.id(),
      course: field.ref(Course),
    });
    Course.hasMany('students', Student, { via: 'course' });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        QueryableCourse: [
          { id: 'course-1', capacity: 2 },
          { id: 'course-2', capacity: 4 },
        ],
        QueryableStudent: [
          { id: 'student-1', course: 'course-1' },
          { id: 'student-2', course: 'course-2' },
        ],
      },
    });
    const read = query(Course)
      .where(course => course.availableSeats.gt(0))
      .orderBy(course => course.availableSeats.desc())
      .select(course => ({ id: course.id, availableSeats: course.availableSeats }));

    await expect(Effect.runPromise(runtime.run(read, undefined))).resolves.toEqual([
      { id: 'course-2', availableSeats: 3 },
      { id: 'course-1', availableSeats: 1 },
    ]);
    await expect(Effect.runPromise(runtime.count(read, undefined))).resolves.toBe(2);
  });

  it('enforces exact-one selection cardinality after materialization', async () => {
    const Book = entity('CardinalityBook', {
      id: field.id(),
      status: field.string(),
    });
    const runtime = createInMemoryDataGraphRuntime({
      dataset: {
        CardinalityBook: [
          { id: 'book-1', status: 'draft' },
          { id: 'book-2', status: 'draft' },
          { id: 'book-3', status: 'published' },
        ],
      },
    });
    const exact = (status: string) =>
      query(Book).where(
        new Selection(
          Book,
          { kind: 'predicate', operator: 'eq', fieldName: 'status', value: status },
          undefined,
          'one',
        ),
      );

    await expect(Effect.runPromise(runtime.run(exact('published'), undefined))).resolves.toEqual([
      { id: 'book-3', status: 'published' },
    ]);
    await expect(
      Effect.runPromise(runtime.run(exact('missing'), undefined).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
    await expect(
      Effect.runPromise(runtime.count(exact('draft'), undefined).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
  });

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
