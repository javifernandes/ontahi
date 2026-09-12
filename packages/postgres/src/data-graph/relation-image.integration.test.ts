import {
  createInMemoryDataGraphRuntime,
  createGraphReadDispatcher,
  createRemoteDataGraphRuntime,
  toGraphReadRequestV2,
  Selection,
  createEntityRef,
  entity,
  field,
  type RelationshipFact,
  type GraphReadPolicy,
} from '@ontahi/core/data-graph';
import { ontahi } from '@ontahi/core/runtime/server';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect, Stream } from 'effect';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import { postgresMapping } from './mapping.js';
import { contextualGraph } from './relation-image.test-support.js';
import { createPostgresDataGraphRuntime } from './runtime.js';
import { createPostgresDataGraphStorage } from './storage.js';

describe('PostgreSQL contextual Selection execution', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  const graph = contextualGraph();
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`CREATE TABLE image_books (book_id text PRIMARY KEY, is_visible boolean);
      CREATE TABLE image_nodes (node_id text PRIMARY KEY, book_id text, parent_id text, node_type text);
      CREATE TABLE image_tags (tag_id text PRIMARY KEY, tag_name text);
      CREATE TABLE image_book_tags (book_id text, tag_id text);`);
    for (const row of graph.dataset.ImageBook)
      await pool.query('INSERT INTO image_books VALUES ($1,$2)', [row.id, row.visible]);
    for (const row of graph.dataset.ImageNode)
      await pool.query('INSERT INTO image_nodes VALUES ($1,$2,$3,$4)', [
        row.id,
        row.bookId,
        row.parentId,
        row.type,
      ]);
    for (const row of graph.dataset.ImageTag)
      await pool.query('INSERT INTO image_tags VALUES ($1,$2)', [row.id, row.name]);
    await pool.query("INSERT INTO image_book_tags VALUES ('b1','t1'), ('b2','t1'), ('b2','t2')");
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('enforces v2 source, intermediate and target scopes in one SQL read, including complement', async () => {
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: graph.mappings });
    type Authority = { excludedNodeId: string };
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
      scope: ({ authority }) =>
        Selection.where(graph.Node, n => n.id.eq(authority.excludedNodeId)).not(),
    };
    const execute = vi.fn(read => Effect.runPromise(runtime.run(read, undefined)));
    const dispatch = createGraphReadDispatcher({
      relationSelections: true,
      policies: [book, node],
      execute,
    });
    const selected = Selection.all(graph.Book).parts.chapters;
    const request = toGraphReadRequestV2(
      selected.toQuery().orderBy(n => n.id.asc()),
      'run',
    );
    const spy = vi.spyOn(pool, 'query');
    try {
      const result = await dispatch(request, { authority: { excludedNodeId: 'orphan' } });
      expect(result).toEqual({
        kind: 'graph-read-result',
        value: graph.dataset.ImageNode.slice(2, 4),
      });
      expect(spy).toHaveBeenCalledTimes(1);
      const application = ontahi({
        storage: createPostgresDataGraphStorage({ pool, mappings: graph.mappings }),
        entities: { ImageBook: graph.Book, ImageNode: graph.Node, ImageTag: graph.Tag },
      });
      const applicationDispatch = application.createGraphReadDispatcher([book, node]);
      const transport = vi.fn(async (input: unknown) =>
        applicationDispatch(JSON.parse(JSON.stringify(input)), {
          authority: { excludedNodeId: 'orphan' },
        }),
      );
      const remote = createRemoteDataGraphRuntime({ transport });
      spy.mockClear();
      expect(
        await Effect.runPromise(
          remote.run(
            selected.toQuery().orderBy(n => n.id.asc()),
            undefined,
          ),
        ),
      ).toEqual(graph.dataset.ImageNode.slice(2, 4));
      expect(transport).toHaveBeenCalledTimes(2);
      // Capability negotiation does not execute SQL or prefetch source membership.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await dispatch(request, { authority: { excludedNodeId: 'p1' } })).toEqual({
        kind: 'graph-read-result',
        value: [],
      });
      expect(await dispatch(request, { authority: { excludedNodeId: 'c1' } })).toEqual({
        kind: 'graph-read-result',
        value: [graph.dataset.ImageNode[3]],
      });
      const complement = toGraphReadRequestV2(
        selected
          .not()
          .and(n => n.type.eq('chapter'))
          .toQuery()
          .orderBy(n => n.id.asc()),
        'run',
      );
      expect(await dispatch(complement, { authority: { excludedNodeId: 'c3' } })).toEqual({
        kind: 'graph-read-result',
        value: [graph.dataset.ImageNode[5], graph.dataset.ImageNode[6]].sort((a, b) =>
          a!.id.localeCompare(b!.id),
        ),
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('matches in-memory navigation, count and final shaping without prefetch', async () => {
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: graph.mappings });
    const memory = createInMemoryDataGraphRuntime({
      entities: [graph.Book, graph.Node, graph.Tag],
      dataset: graph.dataset,
    });
    const read = graph.chapters
      .toQuery()
      .orderBy(n => n.id.asc())
      .limit(1);
    const spy = vi.spyOn(pool, 'query');
    try {
      expect(await Effect.runPromise(runtime.run(read, undefined))).toEqual(
        await Effect.runPromise(memory.run(read, undefined)),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await Effect.runPromise(runtime.count(read, undefined))).toBe(2);
      expect(await Effect.runPromise(runtime.get(read, undefined))).toEqual(
        graph.dataset.ImageNode[2],
      );
      expect(
        Array.from(await Effect.runPromise(Stream.runCollect(runtime.stream(read, undefined)))),
      ).toEqual([graph.dataset.ImageNode[2]]);
    } finally {
      spy.mockRestore();
    }
  });
  it('preserves empty sets, complement and union', async () => {
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: graph.mappings });
    const memory = createInMemoryDataGraphRuntime({
      entities: [graph.Book, graph.Node],
      dataset: graph.dataset,
    });
    const selections = [
      Selection.none(graph.Book).parts,
      graph.chapters.not(),
      graph.chapters.or(n => n.id.eq('root')),
    ];
    for (const selection of selections) {
      const read = selection.toQuery().orderBy(n => n.id.asc());
      expect(await Effect.runPromise(runtime.run(read, undefined))).toEqual(
        await Effect.runPromise(memory.run(read, undefined)),
      );
    }
  });
  it('unions shared many-to-many targets without duplicates', async () => {
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: graph.mappings });
    const read = Selection.all(graph.Book)
      .through('tags')
      .toQuery()
      .orderBy(t => t.id.asc());
    const relationships: RelationshipFact[] = [
      ['b1', 't1'],
      ['b2', 't1'],
      ['b2', 't2'],
    ].map(([book, tag]) => ({
      relation: {
        sourceEntityName: graph.Book.name,
        targetEntityName: graph.Tag.name,
        relationName: 'tags',
        cardinality: 'many-to-many',
      },
      source: createEntityRef(graph.Book, { id: book! }),
      target: createEntityRef(graph.Tag, { id: tag! }),
    }));
    const memory = createInMemoryDataGraphRuntime({
      entities: [graph.Book, graph.Node, graph.Tag],
      dataset: graph.dataset,
      relationships,
    });
    expect(await Effect.runPromise(runtime.run(read, undefined))).toEqual(
      await Effect.runPromise(memory.run(read, undefined)),
    );
    expect(await Effect.runPromise(runtime.count(read, undefined))).toBe(2);
  });
  it('supports belongs-to navigation and excludes null links', async () => {
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: graph.mappings });
    const memory = createInMemoryDataGraphRuntime({
      entities: [graph.Book, graph.Node],
      dataset: graph.dataset,
    });
    for (const source of [
      Selection.all(graph.Node),
      Selection.where(graph.Node, n => n.id.eq('orphan')),
    ]) {
      const read = source
        .through('book')
        .toQuery()
        .orderBy(b => b.id.asc());
      expect(await Effect.runPromise(runtime.run(read, undefined))).toEqual(
        await Effect.runPromise(memory.run(read, undefined)),
      );
    }
  });
  it('evaluates membership again on each execution', async () => {
    const runtime = createPostgresDataGraphRuntime({ pool, mappings: graph.mappings });
    const read = graph.chapters.toQuery();
    await pool.query("UPDATE image_books SET is_visible = false WHERE book_id = 'b1'");
    try {
      expect(await Effect.runPromise(runtime.run(read, undefined))).toEqual([]);
    } finally {
      await pool.query("UPDATE image_books SET is_visible = true WHERE book_id = 'b1'");
    }
  });
  it('keeps composite target identities intact on direct joins', async () => {
    const Asset = entity('ImageAsset', { bookId: field.string(), slug: field.string() })
      .locators({ identity: ['bookId', 'slug'] })
      .identity('identity');
    const Books = graph.Book.hasMany('assets', Asset, { via: 'bookId' });
    const mapping = postgresMapping({
      entity: Asset,
      table: 'image_assets',
      columns: { bookId: 'book_id', slug: 'slug' },
    });
    await pool.query(
      "CREATE TABLE image_assets (book_id text, slug text, PRIMARY KEY (book_id, slug)); INSERT INTO image_assets VALUES ('b1','same'), ('b2','same')",
    );
    const runtime = createPostgresDataGraphRuntime({
      pool,
      mappings: [...graph.mappings, mapping],
    });
    expect(
      await Effect.runPromise(
        runtime.run(
          Selection.all(Books)
            .through('assets')
            .toQuery()
            .orderBy(a => a.bookId.asc()),
          undefined,
        ),
      ),
    ).toEqual([
      { bookId: 'b1', slug: 'same' },
      { bookId: 'b2', slug: 'same' },
    ]);
  });
});
