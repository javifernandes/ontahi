import {
  createEntityRef,
  createRuntimeBoundDataGraphApi,
  query,
  selectionNot,
  selectionOr,
  selectionReferences,
  type DataGraphExecutionRuntime,
  type EntityProxy,
  type GraphCommandSpec,
  type SelectionPredicate,
} from '@ontahi/core/data-graph';
import { Chunk, Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';

import { conformanceGraph } from './fixtures.js';

type ConformanceHarness = {
  runtime: DataGraphExecutionRuntime<any, any, any, any>;
  close?: () => Promise<void>;
};

export const dataGraphRuntimeConformance = (
  name: string,
  createHarness: () => Promise<ConformanceHarness>,
) => {
  describe(`${name} data graph runtime conformance`, () => {
    const withHarness = async <TResult>(
      run: (harness: ConformanceHarness) => Promise<TResult>,
    ): Promise<TResult> => {
      const harness = await createHarness();
      try {
        return await run(harness);
      } finally {
        await harness.close?.();
      }
    };

    it('reads, gets, counts and streams selected rows', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const read = query(BookWithChapters)
          .where(book => book.id.in(['book-1', 'book-2']))
          .where(book => book.title.gte('Alpha'))
          .orderBy(book => book.title.desc())
          .limit(2);

        await expect(Effect.runPromise(runtime.run(read, undefined))).resolves.toEqual([
          { id: 'book-2', slug: 'beta', title: 'Beta', published: true, note: 'featured' },
          { id: 'book-1', slug: 'alpha', title: 'Alpha', published: false, note: null },
        ]);
        await expect(Effect.runPromise(runtime.get(read, undefined))).resolves.toMatchObject({
          id: 'book-2',
        });
        await expect(Effect.runPromise(runtime.count(read, undefined))).resolves.toBe(2);
        await expect(
          Effect.runPromise(Stream.runCollect(runtime.stream(read, undefined))),
        ).resolves.toEqual(
          Chunk.fromIterable([
            { id: 'book-2', slug: 'beta', title: 'Beta', published: true, note: 'featured' },
            { id: 'book-1', slug: 'alpha', title: 'Alpha', published: false, note: null },
          ]),
        );
      }));

    it('implements every scalar selection operator and empty membership', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const selectedIds = async (
          build: (book: EntityProxy<typeof BookWithChapters>) => SelectionPredicate,
        ) =>
          Effect.runPromise(
            runtime.run(
              query(BookWithChapters)
                .where(build)
                .orderBy(book => book.id)
                .select(book => ({ id: book.id })),
              undefined,
            ),
          ).then(rows => rows.map(row => row.id));

        await expect(selectedIds(book => book.title.eq('Alpha'))).resolves.toEqual(['book-1']);
        await expect(selectedIds(book => book.title.in(['Alpha', 'Beta']))).resolves.toEqual([
          'book-1',
          'book-2',
        ]);
        await expect(selectedIds(book => book.title.in([]))).resolves.toEqual([]);
        await expect(selectedIds(book => book.note.isNull())).resolves.toEqual(['book-1']);
        await expect(selectedIds(book => book.title.lt('Beta'))).resolves.toEqual(['book-1']);
        await expect(selectedIds(book => book.title.lte('Beta'))).resolves.toEqual([
          'book-1',
          'book-2',
        ]);
        await expect(selectedIds(book => book.title.gt('Alpha'))).resolves.toEqual(['book-2']);
        await expect(selectedIds(book => book.title.gte('Alpha'))).resolves.toEqual([
          'book-1',
          'book-2',
        ]);
      }));

    it('matches in-memory multi-column ordering and null placement', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const rows = query(BookWithChapters)
          .orderBy(book => book.note.asc())
          .orderBy(book => book.title.desc())
          .select(book => ({ id: book.id, note: book.note }));

        await expect(Effect.runPromise(runtime.run(rows, undefined))).resolves.toEqual([
          { id: 'book-1', note: null },
          { id: 'book-2', note: 'featured' },
        ]);
      }));

    it('does not apply result limits to counts', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const limited = query(BookWithChapters)
          .orderBy(book => book.id)
          .limit(1);

        await expect(Effect.runPromise(runtime.run(limited, undefined))).resolves.toHaveLength(1);
        await expect(Effect.runPromise(runtime.count(limited, undefined))).resolves.toBe(2);
      }));

    it('evaluates boolean selections and entity references', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const selected = query(BookWithChapters)
          .where(book =>
            selectionOr(book.slug.eq('missing'), selectionNot(book.published.eq(true))),
          )
          .where(() =>
            selectionReferences([
              createEntityRef(BookWithChapters, { id: 'book-1' }),
              createEntityRef(BookWithChapters, { id: 'book-2' }),
            ]),
          )
          .select(book => ({ id: book.id }));

        await expect(Effect.runPromise(runtime.run(selected, undefined))).resolves.toEqual([
          { id: 'book-1' },
        ]);
      }));

    it('materializes aliased and nested projections', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;

        await expect(
          Effect.runPromise(
            runtime.run(
              query(BookWithChapters)
                .where(book => book.id.eq('book-1'))
                .select(book => ({
                  identifier: book.id,
                  details: {
                    title: book.title,
                    published: book.published,
                  },
                })),
              undefined,
            ),
          ),
        ).resolves.toEqual([
          {
            identifier: 'book-1',
            details: { title: 'Alpha', published: false },
          },
        ]);
      }));

    it('inserts, updates, deletes and returns affected rows', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const inserted = await Effect.runPromise(
          runtime.runCommand<{ id: string; title: string }>({
            kind: 'command',
            operation: 'insert',
            root: BookWithChapters,
            selection: { kind: 'none' },
            payload: {
              id: 'book-3',
              slug: 'gamma',
              title: 'Gamma',
              published: false,
            },
            returning: ['id', 'title'],
            cardinality: 'one',
          }),
        );
        const bulkInserted = await Effect.runPromise(
          runtime.runCommand<Array<{ id: string }>>({
            kind: 'command',
            operation: 'insert_many',
            root: BookWithChapters,
            selection: { kind: 'none' },
            payload: [
              {
                id: 'book-4',
                slug: 'delta',
                title: 'Delta',
                published: false,
              },
              {
                id: 'book-5',
                slug: 'epsilon',
                title: 'Epsilon',
                published: false,
              },
            ],
            returning: ['id'],
          }),
        );
        const updated = await Effect.runPromise(
          runtime.runCommand<Array<{ id: string }>>({
            kind: 'command',
            operation: 'update',
            root: BookWithChapters,
            selection: query(BookWithChapters)
              .where(book => book.published.eq(false))
              .build().selection,
            payload: { published: true },
            returning: ['id'],
          }),
        );
        const deleted = await Effect.runPromise(
          runtime.runCommand<Array<{ id: string }>>({
            kind: 'command',
            operation: 'delete',
            root: BookWithChapters,
            selection: query(BookWithChapters)
              .where(book => book.slug.eq('beta'))
              .build().selection,
            returning: ['id'],
          }),
        );

        expect(inserted).toEqual({ id: 'book-3', title: 'Gamma' });
        expect(bulkInserted).toEqual([{ id: 'book-4' }, { id: 'book-5' }]);
        expect(updated).toEqual([
          { id: 'book-1' },
          { id: 'book-3' },
          { id: 'book-4' },
          { id: 'book-5' },
        ]);
        expect(deleted).toEqual([{ id: 'book-2' }]);
      }));

    it('implements ignore and merge upsert strategies', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const upsert = (payload: Record<string, unknown>, strategy: 'ignore' | 'merge') =>
          runtime.runCommand<Array<{ id: string; title: string }>>({
            kind: 'command',
            operation: 'upsert',
            root: BookWithChapters,
            selection: { kind: 'none' },
            payload,
            upsert: { conflictOn: ['slug'], strategy },
            returning: ['id', 'title'],
          });

        await expect(
          Effect.runPromise(
            upsert({ id: 'ignored', slug: 'alpha', title: 'Ignored', published: true }, 'ignore'),
          ),
        ).resolves.toEqual([]);
        await expect(
          Effect.runPromise(
            upsert(
              { id: 'book-1', slug: 'alpha', title: 'Alpha revised', published: true },
              'merge',
            ),
          ),
        ).resolves.toEqual([{ id: 'book-1', title: 'Alpha revised' }]);
        await expect(
          Effect.runPromise(
            runtime.runCommand<Array<{ id: string; title: string }>>({
              kind: 'command',
              operation: 'upsert',
              root: BookWithChapters,
              selection: { kind: 'none' },
              payload: [
                {
                  id: 'ignored-again',
                  slug: 'alpha',
                  title: 'Ignored again',
                  published: true,
                },
                {
                  id: 'book-3',
                  slug: 'gamma',
                  title: 'Gamma',
                  published: false,
                },
              ],
              upsert: { conflictOn: ['slug'], strategy: 'ignore' },
              returning: ['id', 'title'],
            }),
          ),
        ).resolves.toEqual([{ id: 'book-3', title: 'Gamma' }]);
      }));

    it('rejects malformed upsert commands', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;

        await expect(
          Effect.runPromise(
            runtime
              .runCommand({
                kind: 'command',
                operation: 'upsert',
                root: BookWithChapters,
                selection: { kind: 'none' },
                payload: {
                  id: 'book-3',
                  slug: 'gamma',
                  title: 'Gamma',
                  published: false,
                },
                upsert: { conflictOn: [], strategy: 'merge' },
              })
              .pipe(Effect.either),
          ),
        ).resolves.toMatchObject({
          _tag: 'Left',
          left: { reason: 'invalid_command' },
        });
      }));

    it('does not mutate when one-row cardinality is not satisfied', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;
        const command: GraphCommandSpec = {
          kind: 'command',
          operation: 'update',
          root: BookWithChapters,
          selection: { kind: 'all' },
          payload: { published: true },
          cardinality: 'one',
        };

        await expect(
          Effect.runPromise(runtime.runCommand(command).pipe(Effect.either)),
        ).resolves.toMatchObject({
          _tag: 'Left',
          left: { reason: 'cardinality_mismatch' },
        });
        await expect(
          Effect.runPromise(
            runtime.run(
              query(BookWithChapters)
                .where(book => book.published.eq(false))
                .select(book => ({ id: book.id })),
              undefined,
            ),
          ),
        ).resolves.toEqual([{ id: 'book-1' }]);
      }));

    it('enforces one-row cardinality on reads', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;

        await expect(
          Effect.runPromise(
            runtime
              .run(
                {
                  ...query(BookWithChapters).build(),
                  cardinality: 'one',
                },
                undefined,
              )
              .pipe(Effect.either),
          ),
        ).resolves.toMatchObject({
          _tag: 'Left',
          left: { reason: 'cardinality_mismatch' },
        });
      }));

    it('materializes ordered nested relation includes', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters } = conformanceGraph;

        await expect(
          Effect.runPromise(
            runtime.get(
              query(BookWithChapters)
                .where(book => book.id.eq('book-1'))
                .include(book => ({
                  chapters: book.chapters
                    .orderBy(chapter => chapter.position)
                    .include(chapter => ({
                      blocks: chapter.blocks.orderBy(block => block.position),
                    })),
                })),
              undefined,
            ),
          ),
        ).resolves.toEqual({
          id: 'book-1',
          slug: 'alpha',
          title: 'Alpha',
          published: false,
          note: null,
          chapters: [
            {
              id: 'chapter-1',
              bookId: 'book-1',
              title: 'First',
              position: 1,
              blocks: [
                {
                  id: 'block-1',
                  chapterId: 'chapter-1',
                  content: 'hello',
                  position: 1,
                },
                {
                  id: 'block-2',
                  chapterId: 'chapter-1',
                  content: 'world',
                  position: 2,
                },
              ],
            },
            {
              id: 'chapter-2',
              bookId: 'book-1',
              title: 'Second',
              position: 2,
              blocks: [],
            },
          ],
        });
      }));

    it('resolves and counts relation-root reads', async () =>
      withHarness(async ({ runtime }) => {
        const { BookWithChapters, ChapterWithBlocks } = conformanceGraph;
        const api = createRuntimeBoundDataGraphApi(() => runtime);
        const Books = api.bindSelectionEntity(BookWithChapters);
        const Chapters = api.bindSelectionEntity(ChapterWithBlocks);
        const relatedBooks = Books.relatedTo(
          Chapters.where(chapter => chapter.title.eq('First')).select(chapter => ({
            bookId: chapter.bookId,
            title: chapter.title,
          })),
          { through: 'chapters' },
        )
          .select(book => ({ id: book.id, title: book.title }))
          .orderBy(book => book.title);

        await expect(Effect.runPromise(relatedBooks.run())).resolves.toEqual([
          { id: 'book-1', title: 'Alpha' },
        ]);
        await expect(Effect.runPromise(relatedBooks.count())).resolves.toBe(1);
        await expect(Effect.runPromise(relatedBooks.resolve())).resolves.toEqual({
          sourceRows: [{ bookId: 'book-1', title: 'First' }],
          rows: [{ id: 'book-1', title: 'Alpha' }],
        });
        const counted = await Effect.runPromise(relatedBooks.countBySource());
        expect(counted.sourceRows).toEqual([{ bookId: 'book-1', title: 'First' }]);
        expect([...counted.countsBySource.entries()]).toEqual([['book-1', 1]]);
      }));
  });
};
