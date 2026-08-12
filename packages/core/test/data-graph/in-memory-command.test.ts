import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createInMemoryDataGraphRuntime,
  entity,
  field,
  query,
  type GraphCommandSpec,
  type InMemoryDataset,
} from '../../src/data-graph/index.js';

describe('in-memory graph commands', () => {
  const Book = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
    published: field.boolean(),
  });

  const createRuntime = () => {
    const dataset: InMemoryDataset = {
      Book: [
        {
          id: 'book-1',
          slug: 'alpha',
          title: 'Alpha',
          published: false,
        },
      ],
    };

    return {
      dataset,
      runtime: createInMemoryDataGraphRuntime({ dataset }),
    };
  };

  it('inserts single and bulk rows and exposes them through reads and counts', async () => {
    const { dataset, runtime } = createRuntime();
    const inserted = await Effect.runPromise(
      runtime.runCommand<{ id: string; title: string }>({
        kind: 'command',
        operation: 'insert',
        root: Book,
        selection: { kind: 'none' },
        payload: {
          id: 'book-2',
          slug: 'beta',
          title: 'Beta',
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
        root: Book,
        selection: { kind: 'none' },
        payload: [
          { id: 'book-3', slug: 'gamma', title: 'Gamma', published: true },
          { id: 'book-4', slug: 'delta', title: 'Delta', published: true },
        ],
        returning: ['id'],
      }),
    );

    expect(inserted).toEqual({ id: 'book-2', title: 'Beta' });
    expect(bulkInserted).toEqual([{ id: 'book-3' }, { id: 'book-4' }]);
    await expect(Effect.runPromise(runtime.count(query(Book), undefined))).resolves.toBe(4);
    await expect(
      Effect.runPromise(
        runtime.run(
          query(Book)
            .where(book => book.published.eq(true))
            .orderBy(book => book.slug),
          undefined,
        ),
      ),
    ).resolves.toEqual([
      { id: 'book-4', slug: 'delta', title: 'Delta', published: true },
      { id: 'book-3', slug: 'gamma', title: 'Gamma', published: true },
    ]);
    expect(dataset.Book).toHaveLength(4);
  });

  it('upserts, updates, and deletes live state with returning projections', async () => {
    const { dataset, runtime } = createRuntime();
    const upsert = (payload: Record<string, unknown>, strategy: 'ignore' | 'merge') =>
      runtime.runCommand<Array<{ id: string; title: string }>>({
        kind: 'command',
        operation: 'upsert',
        root: Book,
        selection: { kind: 'none' },
        payload,
        upsert: { conflictOn: ['slug'], strategy },
        returning: ['id', 'title'],
      });

    await expect(
      Effect.runPromise(
        upsert({ id: 'ignored-id', slug: 'alpha', title: 'Ignored', published: true }, 'ignore'),
      ),
    ).resolves.toEqual([]);
    await expect(
      Effect.runPromise(
        upsert({ id: 'book-1', slug: 'alpha', title: 'Alpha revised', published: true }, 'merge'),
      ),
    ).resolves.toEqual([{ id: 'book-1', title: 'Alpha revised' }]);
    await expect(
      Effect.runPromise(
        upsert({ id: 'book-2', slug: 'beta', title: 'Beta', published: false }, 'merge'),
      ),
    ).resolves.toEqual([{ id: 'book-2', title: 'Beta' }]);
    await expect(
      Effect.runPromise(
        runtime.runCommand<Array<{ id: string; title: string }>>({
          kind: 'command',
          operation: 'upsert',
          root: Book,
          selection: { kind: 'none' },
          payload: [
            { id: 'ignored-again', slug: 'alpha', title: 'Ignored again', published: true },
            { id: 'book-3', slug: 'gamma', title: 'Gamma', published: false },
            { id: 'duplicate-gamma', slug: 'gamma', title: 'Duplicate', published: true },
          ],
          upsert: { conflictOn: ['slug'], strategy: 'ignore' },
          returning: ['id', 'title'],
        }),
      ),
    ).resolves.toEqual([{ id: 'book-3', title: 'Gamma' }]);

    const updated = await Effect.runPromise(
      runtime.runCommand<{ id: string; published: boolean }>({
        kind: 'command',
        operation: 'update',
        root: Book,
        selection: query(Book)
          .where(book => book.slug.eq('beta'))
          .build().selection,
        payload: { published: true },
        returning: ['id', 'published'],
        cardinality: 'one',
      }),
    );
    const deleted = await Effect.runPromise(
      runtime.runCommand<Array<{ id: string }>>({
        kind: 'command',
        operation: 'delete',
        root: Book,
        selection: query(Book)
          .where(book => book.published.eq(true))
          .build().selection,
        returning: ['id'],
      }),
    );

    expect(updated).toEqual({ id: 'book-2', published: true });
    expect(deleted).toEqual([{ id: 'book-1' }, { id: 'book-2' }]);
    expect(dataset.Book).toEqual([
      { id: 'book-3', slug: 'gamma', title: 'Gamma', published: false },
    ]);
  });

  it('reports invalid commands and one-row cardinality mismatches as typed failures', async () => {
    const { dataset, runtime } = createRuntime();
    const missingUpdate: GraphCommandSpec = {
      kind: 'command',
      operation: 'update',
      root: Book,
      selection: query(Book)
        .where(book => book.slug.eq('missing'))
        .build().selection,
      payload: { title: 'Missing' },
      cardinality: 'one',
    };
    const invalidUpsert: GraphCommandSpec = {
      kind: 'command',
      operation: 'upsert',
      root: Book,
      selection: { kind: 'none' },
      payload: { id: 'book-2', slug: 'beta' },
      upsert: { conflictOn: [], strategy: 'merge' },
    };
    const missingConflictValue: GraphCommandSpec = {
      kind: 'command',
      operation: 'upsert',
      root: Book,
      selection: { kind: 'none' },
      payload: { id: 'book-2', title: 'Beta' },
      upsert: { conflictOn: ['slug'], strategy: 'merge' },
    };

    await expect(
      Effect.runPromise(runtime.runCommand(missingUpdate).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        _tag: 'InMemoryDataGraphError',
        reason: 'cardinality_mismatch',
      },
    });
    await expect(
      Effect.runPromise(runtime.runCommand(invalidUpsert).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        _tag: 'InMemoryDataGraphError',
        reason: 'invalid_command',
      },
    });
    await expect(
      Effect.runPromise(runtime.runCommand(missingConflictValue).pipe(Effect.either)),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: {
        _tag: 'InMemoryDataGraphError',
        reason: 'invalid_command',
      },
    });

    dataset.Book = [
      ...(dataset.Book ?? []),
      {
        id: 'book-2',
        slug: 'beta',
        title: 'Beta',
        published: false,
      },
    ];
    const before = structuredClone(dataset.Book);
    await expect(
      Effect.runPromise(
        runtime
          .runCommand({
            kind: 'command',
            operation: 'update',
            root: Book,
            selection: { kind: 'all' },
            payload: { published: true },
            cardinality: 'one',
          })
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
    expect(dataset.Book).toEqual(before);
  });
});
