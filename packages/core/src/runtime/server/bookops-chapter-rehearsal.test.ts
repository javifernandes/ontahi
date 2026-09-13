import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  getGraphOutputDescriptor,
  graphSchema,
  query,
  safeParseGraphSchema,
  Selection,
  toGraphSchemaDescriptor,
  withContextualSelections,
  withSelectionFactories,
  type EntityRef,
  type InferGraphSchemaClientInput,
} from '../../data-graph/index.js';

import {
  defineDomainOperation,
  defineDomainOperationsForEntity,
  failOperation,
  runServerDomainOperationRaw,
} from './index.js';

// Proposed contract, not imports from (or a migration of) the pinned BookOps application.
// Source evidence and deliberately omitted host behavior: docs/research/bookops-chapter-variants.md.
const fixture = () => {
  const Base = entity('ContentNode', {
    id: field.id(),
    bookId: field.id(),
    parentId: field.nullable(field.id()),
    type: field.enum(['part', 'chapter', 'section', 'subsection']),
    title: field.string(),
    slug: field.string(),
    order: field.number(),
  });
  const Chapter = Base.variant('Chapter', { discriminator: { type: 'chapter' } });
  const Nodes = withContextualSelections(
    Base.hasMany('children', Base, { via: 'parentId' }),
    ({ self }) => ({
      chapters: self.children.as(Chapter),
    }),
  );
  const Part = Nodes.variant('Part', { discriminator: { type: 'part' } });
  const Book = withSelectionFactories(
    withContextualSelections(
      entity('Book', { id: field.id(), slug: field.string() }).hasMany('contentNodes', Nodes, {
        via: 'bookId',
      }),
      ({ self }) => ({
        parts: self.contentNodes.as(Part),
        rootChapters: self.contentNodes.where(node => node.parentId.isNull()).as(Chapter),
      }),
    ),
    {
      slug: {
        version: 1,
        input: graphSchema.object({ slug: field.string() }),
        scalarInput: 'slug',
        template: { kind: 'predicate', fieldName: 'slug', operator: 'eq', input: 'slug' },
      },
    },
  );
  // The existing repository remains slug-addressed; this rehearsal does not rewrite its storage.
  const Thread = entity('CommentThread', {
    id: field.id(),
    bookSlug: field.string(),
    partSlug: field.nullable(field.string()),
    chapterSlug: field.string(),
    state: field.enum(['open', 'resolved']),
  });
  const node = (
    id: string,
    bookId: string,
    parentId: string | null,
    type: string,
    slug: string,
  ) => ({ id, bookId, parentId, type, slug, title: slug, order: 0 });
  const runtime = createInMemoryDataGraphRuntime({
    entities: [Book, Nodes, Thread],
    dataset: {
      Book: [
        { id: 'b1', slug: 'my-book' },
        { id: 'b2', slug: 'private-book' },
      ],
      ContentNode: [
        node('p1', 'b1', null, 'part', 'first'),
        node('p2', 'b1', null, 'part', 'second'),
        node('c1', 'b1', 'p1', 'chapter', 'intro'),
        node('c2', 'b1', 'p2', 'chapter', 'intro'),
        node('root', 'b1', null, 'chapter', 'intro'),
        node('empty', 'b1', null, 'chapter', 'empty'),
        node('section', 'b1', 'c1', 'section', 'intro'),
        node('private', 'b2', null, 'chapter', 'intro'),
        node('foreign-part', 'b2', null, 'part', 'foreign'),
        node('orphan', 'b1', 'missing-parent', 'chapter', 'orphan'),
        node('bad-parent', 'b1', 'section', 'chapter', 'bad-parent'),
        node('cross-book', 'b1', 'foreign-part', 'chapter', 'cross-book'),
      ],
      CommentThread: [
        { id: 't1', bookSlug: 'my-book', partSlug: 'first', chapterSlug: 'intro', state: 'open' },
        {
          id: 't2',
          bookSlug: 'my-book',
          partSlug: 'first',
          chapterSlug: 'intro',
          state: 'resolved',
        },
        { id: 't3', bookSlug: 'my-book', partSlug: 'second', chapterSlug: 'intro', state: 'open' },
        { id: 't4', bookSlug: 'my-book', partSlug: null, chapterSlug: 'intro', state: 'open' },
      ],
    },
  });
  const input = graphSchema.object({
    chapter: graphSchema.existingRef(Chapter).resolveWith(ref =>
      runtime.get(
        Selection.references(Nodes, [ref])
          .and(node => node.bookId.eq('b1'))
          .toQuery(),
        undefined,
      ),
    ),
    stateFilter: graphSchema.optional(field.enum(['open', 'resolved', 'all'])),
  });
  const output = graphSchema.object({ threads: graphSchema.array(Thread) });
  const body = vi.fn();
  const operation = defineDomainOperationsForEntity(
    Thread,
    {
      listThreadsForChapter: defineDomainOperation({
        input,
        output,
        run: ({ chapter, stateFilter = 'open' }) =>
          Effect.gen(function* () {
            expectTypeOf(chapter.type).toEqualTypeOf<'chapter'>();
            body(chapter.ref);
            const book = yield* runtime
              .get(
                query(Book).where(book => book.id.eq(chapter.bookId)),
                undefined,
              )
              .pipe(Effect.orDie);
            const parent =
              chapter.parentId === null
                ? null
                : yield* runtime
                    .get(
                      Part.where(part => part.id.eq(chapter.parentId!))
                        .where(part => part.bookId.eq(chapter.bookId))
                        .many(),
                      undefined,
                    )
                    .pipe(Effect.orDie);
            if (!book || (chapter.parentId !== null && !parent))
              return yield* failOperation(
                'invalid_chapter_location',
                'Chapter hierarchy is unavailable.',
              );
            let selected = Selection.where(Thread, thread => thread.bookSlug.eq(book.slug))
              .and(thread => thread.chapterSlug.eq(chapter.slug))
              .and(thread => (parent ? thread.partSlug.eq(parent.slug) : thread.partSlug.isNull()));
            if (stateFilter !== 'all')
              selected = selected.and(thread => thread.state.eq(stateFilter));
            return {
              threads: yield* runtime.run(selected.toQuery(), undefined).pipe(Effect.orDie),
            };
          }),
      }),
    },
    { exposure: 'server-only', layer: 'tests.bookops-rehearsal' },
  ).listThreadsForChapter;
  return { Book, Nodes, Chapter, input, output, runtime, operation, body };
};

describe('BookOps Chapter migration rehearsal', () => {
  it('declares composable root/nested navigation with one physical identity and no read during assembly', async () => {
    const { Book, Nodes, runtime } = fixture();
    const reads = vi.spyOn(runtime, 'run');
    const book = Book.by({ slug: 'my-book' });
    const nested = book.parts
      .where(part => part.slug.eq('first'))
      .chapters.where(chapter => chapter.slug.eq('intro'));
    const root = book.rootChapters.where(chapter => chapter.slug.eq('intro'));
    expect(reads).not.toHaveBeenCalled();
    const nestedRows = await Effect.runPromise(runtime.run(nested.many(), undefined));
    const rootRows = await Effect.runPromise(runtime.run(root.many(), undefined));
    expect(nestedRows.map(row => row.id)).toEqual(['c1']);
    expect(rootRows.map(row => row.id)).toEqual(['root']);
    expect(nested.toQuery().build().root).toBe(Nodes);
    expect(book.parts.variant.base).toBe(Nodes);
  });

  it.each([
    ['c1', undefined, ['t1']],
    ['c1', 'all', ['t1', 't2']],
    ['c1', 'resolved', ['t2']],
    ['c2', undefined, ['t3']],
    ['root', undefined, ['t4']],
    ['empty', undefined, []],
  ] as const)(
    'lists %s with filter %s without asking the caller for slug fields',
    async (id, stateFilter, expected) => {
      const { Nodes, input, operation } = fixture();
      expectTypeOf<InferGraphSchemaClientInput<typeof input>>().toEqualTypeOf<{
        chapter: EntityRef<'ContentNode'>;
        stateFilter?: 'open' | 'resolved' | 'all';
      }>();
      const result = await runServerDomainOperationRaw(
        operation,
        JSON.parse(JSON.stringify({ chapter: createEntityRef(Nodes, { id }), stateFilter })),
      );
      expect(result.success).toBe(true);
      if (result.success) expect(result.data?.threads.map(thread => thread.id)).toEqual(expected);
    },
  );

  it.each(['missing', 'p1', 'section', 'private'])(
    'rejects %s before listing threads',
    async id => {
      const { Nodes, operation, body } = fixture();
      expect(
        await runServerDomainOperationRaw(operation, { chapter: createEntityRef(Nodes, { id }) }),
      ).toMatchObject({
        success: false,
        reason: 'entity_not_found',
        entityName: 'ContentNode',
        inputPath: 'chapter',
      });
      expect(body).not.toHaveBeenCalled();
    },
  );

  it.each(['orphan', 'bad-parent', 'cross-book'])(
    'rejects the broken hierarchy of %s before querying threads',
    async id => {
      const { Nodes, operation, runtime } = fixture();
      const lists = vi.spyOn(runtime, 'run');
      expect(
        await runServerDomainOperationRaw(operation, { chapter: createEntityRef(Nodes, { id }) }),
      ).toMatchObject({ success: false, reason: 'invalid_chapter_location' });
      expect(lists).not.toHaveBeenCalled();
    },
  );

  it('does not turn a path-shaped locator or deferred Selection into an existing Chapter', async () => {
    const { Book, Nodes, input, operation, body } = fixture();
    const path = { bookSlug: 'my-book', partSlug: 'first', chapterSlug: 'missing' };
    expect(
      (await runServerDomainOperationRaw(operation, { chapter: createEntityRef(Nodes, path) }))
        .success,
    ).toBe(false);
    const deferred = Book.by({ slug: 'my-book' }).parts.chapters;
    expect(safeParseGraphSchema(input, { chapter: deferred }).success).toBe(false);
    expect(() => JSON.stringify({ chapter: deferred })).toThrow();
    expect(body).not.toHaveBeenCalled();
    const descriptor = toGraphSchemaDescriptor(input);
    expect(descriptor).toMatchObject({
      kind: 'object',
      fields: {
        chapter: {
          entityName: 'ContentNode',
          resolution: 'existing',
          variant: { name: 'Chapter' },
        },
      },
    });
  });

  it('derives output identity from the output schema, separately from input/navigation', () => {
    const { output, operation } = fixture();
    expect(getGraphOutputDescriptor(output)).toMatchObject({
      kind: 'graph-output.object',
      fields: {
        threads: {
          kind: 'graph-output.array',
          item: { kind: 'graph-output.entity', entity: { name: 'CommentThread' } },
        },
      },
    });
    expect(operation).not.toHaveProperty('inputRefs');
    expect(operation.graphOps).toBeUndefined();
  });
});
