import {
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  entity,
  field,
  Selection,
  type GraphReadPolicy,
} from '@ontahi/core/data-graph';
import { ontahi } from '@ontahi/core/runtime/server';
import { Effect, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { contextualGraph } from '../../../sql/src/data-graph/relation-image.test-support.js';

import { mysqlMapping } from './mapping.js';
import { startMysqlTestDatabase } from './mysql.test-support.js';
import { createMysqlDataGraphRuntime } from './runtime.js';
import { createMysqlDataGraphStorage } from './storage.js';

describe('MySQL contextual Selection execution', () => {
  let database: Awaited<ReturnType<typeof startMysqlTestDatabase>>;
  const graph = contextualGraph();
  const runtime = () =>
    createMysqlDataGraphRuntime({ pool: database.pool, mappings: graph.mappings });
  const memory = createInMemoryDataGraphRuntime({
    entities: [graph.Book, graph.Node, graph.Tag],
    dataset: graph.dataset,
  });

  beforeAll(async () => {
    database = await startMysqlTestDatabase();
    const tables = [
      'image_books (book_id VARCHAR(100) PRIMARY KEY, is_visible BOOLEAN)',
      'image_nodes (node_id VARCHAR(100) PRIMARY KEY, book_id VARCHAR(100), parent_id VARCHAR(100), node_type VARCHAR(100))',
      'image_tags (tag_id VARCHAR(100) PRIMARY KEY, tag_name VARCHAR(100))',
      'image_book_tags (book_id VARCHAR(100), tag_id VARCHAR(100))',
    ];
    for (const table of tables)
      await database.pool.query(`CREATE TABLE ${table} ENGINE=InnoDB COLLATE=utf8mb4_0900_bin`);
    for (const row of graph.dataset.ImageBook)
      await database.pool.execute('INSERT INTO image_books VALUES (?, ?)', [row.id, row.visible]);
    for (const row of graph.dataset.ImageNode)
      await database.pool.execute('INSERT INTO image_nodes VALUES (?, ?, ?, ?)', [
        row.id,
        row.bookId,
        row.parentId,
        row.type,
      ]);
    for (const row of graph.dataset.ImageTag)
      await database.pool.execute('INSERT INTO image_tags VALUES (?, ?)', [row.id, row.name]);
    await database.pool.query(
      "INSERT INTO image_book_tags VALUES ('b1','t1'), ('b2','t1'), ('b2','t2')",
    );
  }, 180_000);

  afterAll(async () => {
    await database?.close();
  });

  it('executes nested self navigation and final shaping in one statement, including transaction reads', async () => {
    const read = graph.chapters
      .toQuery()
      .orderBy(n => n.id.asc())
      .limit(1);
    const spy = vi.spyOn(database.pool, 'execute');
    try {
      expect(await Effect.runPromise(runtime().run(read, undefined))).toEqual(
        await Effect.runPromise(memory.run(read, undefined)),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await Effect.runPromise(runtime().count(read, undefined))).toBe(2);
      expect(await Effect.runPromise(runtime().get(read, undefined))).toEqual(
        graph.dataset.ImageNode[2],
      );
      expect(
        Array.from(await Effect.runPromise(Stream.runCollect(runtime().stream(read, undefined)))),
      ).toEqual([graph.dataset.ImageNode[2]]);
      expect(await Effect.runPromise(runtime().transaction(tx => tx.run(read, undefined)))).toEqual(
        [graph.dataset.ImageNode[2]],
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('preserves empty, intersected, complemented and unioned membership', async () => {
    for (const selection of [
      Selection.none(graph.Book).parts,
      graph.chapters.not(),
      graph.chapters.or(n => n.id.eq('root')),
      graph.chapters.and(n => n.id.eq('c2')),
    ]) {
      const read = selection.toQuery().orderBy(n => n.id.asc());
      expect(await Effect.runPromise(runtime().run(read, undefined))).toEqual(
        await Effect.runPromise(memory.run(read, undefined)),
      );
    }
  });

  it('supports belongs-to navigation and excludes null links', async () => {
    for (const source of [
      Selection.all(graph.Node),
      Selection.where(graph.Node, n => n.id.eq('orphan')),
    ]) {
      const read = source
        .through('book')
        .toQuery()
        .orderBy(b => b.id.asc());
      expect(await Effect.runPromise(runtime().run(read, undefined))).toEqual(
        await Effect.runPromise(memory.run(read, undefined)),
      );
    }
  });

  it('preserves composite target identity on direct joins and supports projections', async () => {
    const Asset = entity('ImageAsset', { bookId: field.string(), slug: field.string() })
      .locators({ identity: ['bookId', 'slug'] })
      .identity('identity');
    const Books = graph.Book.hasMany('assets', Asset, { via: 'bookId' });
    const mapping = mysqlMapping({
      entity: Asset,
      table: 'image_assets',
      columns: { bookId: 'book_id', slug: 'slug' },
    });
    await database.pool.query(
      'CREATE TABLE image_assets (book_id VARCHAR(100), slug VARCHAR(100), PRIMARY KEY (book_id, slug)) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin',
    );
    await database.pool.query("INSERT INTO image_assets VALUES ('b1','same'), ('b2','same')");
    const assets = createMysqlDataGraphRuntime({
      pool: database.pool,
      mappings: [...graph.mappings, mapping],
    });
    const read = Selection.all(Books)
      .through('assets')
      .toQuery()
      .orderBy(a => a.bookId.asc());
    expect(await Effect.runPromise(assets.run(read, undefined))).toEqual([
      { bookId: 'b1', slug: 'same' },
      { bookId: 'b2', slug: 'same' },
    ]);
    expect(
      await Effect.runPromise(
        assets.run(
          read.select(a => ({ owner: a.bookId })),
          undefined,
        ),
      ),
    ).toEqual([{ owner: 'b1' }, { owner: 'b2' }]);
  });

  it('unions shared many-to-many targets without duplicating them', async () => {
    const read = Selection.all(graph.Book)
      .through('tags')
      .toQuery()
      .orderBy(t => t.id.asc());
    expect(await Effect.runPromise(runtime().run(read, undefined))).toEqual(graph.dataset.ImageTag);
    expect(await Effect.runPromise(runtime().count(read, undefined))).toBe(2);
  });

  it('proves exact-one membership before applying the caller limit', async () => {
    const many = graph.chapters.toQuery().limit(1).one().read;
    const spy = vi.spyOn(database.pool, 'execute');
    try {
      await expect(Effect.runPromise(runtime().run(many, undefined))).rejects.toThrow(
        'Expected exactly one',
      );
      expect(spy).toHaveBeenCalledTimes(1);
      await expect(Effect.runPromise(runtime().count(many, undefined))).rejects.toThrow(
        'Expected exactly one',
      );
      expect(spy).toHaveBeenCalledTimes(2);
      const one = graph.chapters
        .and(n => n.id.eq('c2'))
        .toQuery()
        .one().read;
      expect(await Effect.runPromise(runtime().run(one, undefined))).toEqual([
        graph.dataset.ImageNode[3],
      ]);
      const none = Selection.none(graph.Book).parts.toQuery().one().read;
      await expect(Effect.runPromise(runtime().run(none, undefined))).rejects.toThrow('received 0');
      spy.mockClear();
      await expect(
        Effect.runPromise(runtime().run(graph.chapters.toQuery().limit(0).one().read, undefined)),
      ).rejects.toThrow('limit(0)');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('reevaluates source membership on each execution', async () => {
    await database.pool.query("UPDATE image_books SET is_visible = false WHERE book_id = 'b1'");
    try {
      expect(await Effect.runPromise(runtime().run(graph.chapters.toQuery(), undefined))).toEqual(
        [],
      );
    } finally {
      await database.pool.query("UPDATE image_books SET is_visible = true WHERE book_id = 'b1'");
    }
  });

  it('negotiates application v2 support and enforces source, intermediate and target scopes', async () => {
    type Authority = { excluded: string };
    const book: GraphReadPolicy<typeof graph.Book, Authority> = {
      entity: graph.Book,
      fields: {},
      selectionRelations: ['nodes'],
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 25,
      scope: () => Selection.where(graph.Book, b => b.visible.eq(true)),
    };
    const node: GraphReadPolicy<typeof graph.Node, Authority> = {
      entity: graph.Node,
      fields: {
        id: { select: true, order: true },
        bookId: { select: true },
        parentId: { select: true },
        type: { select: true, filter: ['eq'] },
      },
      selectionRelations: ['children'],
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 25,
      scope: ({ authority }) => Selection.where(graph.Node, n => n.id.eq(authority.excluded)).not(),
    };
    const application = ontahi({
      storage: createMysqlDataGraphStorage({ pool: database.pool, mappings: graph.mappings }),
      entities: { ImageBook: graph.Book, ImageNode: graph.Node, ImageTag: graph.Tag },
    });
    const dispatch = application.createGraphReadDispatcher([book, node]);
    let excluded = 'orphan';
    const transport = vi.fn(async (input: unknown) =>
      dispatch(JSON.parse(JSON.stringify(input)), { authority: { excluded } }),
    );
    const remote = createRemoteDataGraphRuntime({ transport });
    const selected = Selection.all(graph.Book).parts.chapters;
    const read = selected.toQuery().orderBy(n => n.id.asc());
    const spy = vi.spyOn(database.pool, 'execute');
    try {
      expect(await Effect.runPromise(remote.run(read, undefined))).toEqual(
        graph.dataset.ImageNode.slice(2, 4),
      );
      expect(transport).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledTimes(1);
      excluded = 'p1';
      expect(await Effect.runPromise(remote.run(read, undefined))).toEqual([]);
      excluded = 'c1';
      expect(await Effect.runPromise(remote.run(read, undefined))).toEqual([
        graph.dataset.ImageNode[3],
      ]);
      excluded = 'c3';
      expect(
        await Effect.runPromise(
          remote.run(
            selected
              .not()
              .and(n => n.type.eq('chapter'))
              .toQuery()
              .orderBy(n => n.id.asc()),
            undefined,
          ),
        ),
      ).toEqual([graph.dataset.ImageNode[6], graph.dataset.ImageNode[5]]);
    } finally {
      spy.mockRestore();
    }
  });
});
