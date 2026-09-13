import { randomUUID } from 'node:crypto';

import {
  Selection,
  createGraphReadDispatcher,
  createRemoteDataGraphRuntime,
  toGraphReadRequestV2,
  type GraphReadPolicy,
} from '@ontahi/core/data-graph';
import { PostgrestClient } from '@supabase/postgrest-js';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Effect, Stream } from 'effect';
import { Pool } from 'pg';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { contextualModel } from './contextual-selection.test-support.js';
import { createSupabaseDataGraphRuntime } from './runtime.js';

// Feasibility proof of the transport, NOT an implementation of Ontahi's Selection compiler.
// All schemas, roles and data live in disposable containers, never in a host Supabase project.
describe('PostgREST contextual membership feasibility', () => {
  let network: StartedNetwork;
  let database: StartedPostgreSqlContainer;
  let rest: StartedTestContainer;
  let pool: Pool;
  let baseUrl: string;
  const graph = contextualModel();
  const runtime = (headers: Record<string, string> = {}, request: typeof fetch = fetch) =>
    createSupabaseDataGraphRuntime({
      entities: graph.entities,
      getReadClient: () =>
        Effect.succeed(new PostgrestClient(baseUrl, { headers, fetch: request })),
      getCommandClient: () => Effect.die('This suite must not execute commands'),
      createError: ({ message, cause }) => Object.assign(new Error(message), { cause }),
    });

  beforeAll(async () => {
    network = await new Network().start();
    database = await new PostgreSqlContainer('postgres:17-alpine')
      .withPassword(randomUUID())
      .withNetwork(network)
      .withNetworkAliases('database')
      .start();
    pool = new Pool({ connectionString: database.getConnectionUri() });
    const password = randomUUID();
    // Password is a generated UUID, not external input. Application requests use the unprivileged role.
    await pool.query(`
      CREATE ROLE membership_reader NOLOGIN;
      CREATE ROLE membership_authenticator LOGIN NOINHERIT PASSWORD '${password}';
      GRANT membership_reader TO membership_authenticator;
      CREATE TABLE books (id text PRIMARY KEY, slug text, visible boolean);
      CREATE TABLE nodes (id text PRIMARY KEY, book_id text REFERENCES books(id),
        parent_id text REFERENCES nodes(id), node_type text);
      CREATE TABLE tags (id text PRIMARY KEY);
      CREATE TABLE detached_nodes (id text PRIMARY KEY, book_id text);
      CREATE TABLE book_tags (book_id text REFERENCES books(id), tag_id text REFERENCES tags(id),
        PRIMARY KEY (book_id, tag_id));
      INSERT INTO books VALUES ('b1','book-one',true), ('b2','book-two',true), ('b3','hidden',false);
      INSERT INTO nodes VALUES ('p1','b1',null,'part'), ('p2','b2',null,'part'), ('p3','b3',null,'part'),
        ('c1','b1','p1','chapter'), ('c2','b1','p1','chapter'), ('c3','b3','p3','chapter'),
        ('c4','b2','p2','chapter'), ('root','b1',null,'chapter');
      INSERT INTO tags VALUES ('shared'), ('private');
      INSERT INTO book_tags VALUES ('b1','shared'), ('b2','shared'), ('b3','private');
      ALTER TABLE books ENABLE ROW LEVEL SECURITY;
      ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
      ALTER TABLE book_tags ENABLE ROW LEVEL SECURITY;
      CREATE POLICY books_read ON books FOR SELECT TO membership_reader USING (visible);
      CREATE POLICY nodes_read ON nodes FOR SELECT TO membership_reader USING
        (id <> COALESCE(current_setting('request.headers', true)::jsonb->>'x-excluded-node', ''));
      CREATE POLICY tags_read ON tags FOR SELECT TO membership_reader USING (true);
      CREATE POLICY edges_read ON book_tags FOR SELECT TO membership_reader USING
        (book_id <> COALESCE(current_setting('request.headers', true)::jsonb->>'x-excluded-edge-book', ''));
      GRANT USAGE ON SCHEMA public TO membership_reader;
      GRANT SELECT ON books, nodes, tags, book_tags, detached_nodes TO membership_reader;
    `);
    rest = await new GenericContainer('postgrest/postgrest:v13.0.0')
      .withNetwork(network)
      .withEnvironment({
        PGRST_DB_URI: `postgres://membership_authenticator:${password}@database:5432/${database.getDatabase()}`,
        PGRST_DB_SCHEMAS: 'public',
        PGRST_DB_ANON_ROLE: 'membership_reader',
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp('/', 3000))
      .start();
    baseUrl = `http://${rest.getHost()}:${rest.getMappedPort(3000)}`;
  }, 180_000);

  afterAll(async () => {
    await rest?.stop();
    await pool?.end();
    await database?.stop();
    await network?.stop();
  });

  const read = async (
    table: string,
    params: Record<string, string>,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(`${baseUrl}/${table}?${new URLSearchParams(params)}`, {
      headers: { Prefer: 'count=exact', ...headers },
    });
    return {
      status: response.status,
      range: response.headers.get('content-range'),
      body: await response.json(),
    };
  };
  const chapters = {
    select: 'id,p:parent_id(b:books())',
    'p.node_type': 'eq.part',
    'p.b.slug': 'eq.book-one',
    'p.b': 'not.is.null',
    p: 'not.is.null',
    node_type: 'eq.chapter',
    order: 'id.asc',
  };
  const ids = (result: { status: number; body: unknown }) => {
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
    return (result.body as { id: string }[]).map(row => row.id);
  };

  it('rejects a self-navigation FK hint that does not resolve a PostgREST relationship', async () => {
    const result = await read('nodes', {
      ...chapters,
      select: 'id,p:nodes!nodes_parent_id_fkey(b:books())',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 'PGRST200' });
  });

  it('selects final chapters through the self-FK column, without functions or source prefetch', async () => {
    const result = await read('nodes', chapters);
    expect(ids(result)).toEqual(['c1', 'c2']);
    expect(result.body).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    expect(ids(await read('nodes', { ...chapters, 'p.b.slug': 'eq.absent' }))).toEqual([]);
  });

  it('applies membership before limit and exposes exact count for one validation', async () => {
    const result = await read('nodes', { ...chapters, limit: '1' });
    expect(ids(result)).toEqual(['c1']);
    expect(result.range).toBe('0-0/2');
    const one = await read('nodes', { ...chapters, id: 'eq.c2', limit: '1' });
    expect(ids(one)).toEqual(['c2']);
    expect(one.range).toBe('0-0/1');
  });

  it('composes complement, union and independent membership aliases', async () => {
    expect(ids(await read('nodes', { ...chapters, p: 'is.null' }))).toEqual(['c3', 'c4', 'root']);
    const { p: _membership, ...filters } = chapters;
    expect(ids(await read('nodes', { ...filters, or: '(p.not.is.null,id.eq.root)' }))).toEqual([
      'c1',
      'c2',
      'root',
    ]);
    expect(
      ids(
        await read('nodes', {
          ...filters,
          select: 'id,p:parent_id(b:books()),q:parent_id(b:books())',
          'q.node_type': 'eq.part',
          'q.b.slug': 'eq.book-two',
          'q.b': 'not.is.null',
          or: '(p.not.is.null,q.not.is.null)',
        }),
      ),
    ).toEqual(['c1', 'c2', 'c4']);
    expect(
      ids(
        await read('nodes', {
          ...chapters,
          and: '(p.not.is.null,id.eq.c2)',
        }),
      ),
    ).toEqual(['c2']);
  });

  it('honors source, intermediate and target RLS, also under complement', async () => {
    expect(ids(await read('nodes', { ...chapters, 'p.b.slug': 'eq.hidden' }))).toEqual([]);
    expect(ids(await read('nodes', chapters, { 'x-excluded-node': 'p1' }))).toEqual([]);
    expect(ids(await read('nodes', chapters, { 'x-excluded-node': 'c1' }))).toEqual(['c2']);
    expect(
      ids(await read('nodes', { ...chapters, p: 'is.null' }, { 'x-excluded-node': 'c3' })),
    ).toEqual(['c4', 'root']);
  });

  it('keeps shared many-to-many targets unique and respects edge/source RLS', async () => {
    const params = { select: 'id,b:books()', b: 'not.is.null', order: 'id.asc' };
    const result = await read('tags', params);
    expect(ids(result)).toEqual(['shared']);
    expect(result.range).toBe('0-0/1');
    expect(
      ids(
        await read(
          'tags',
          { ...params, 'b.slug': 'eq.book-one' },
          { 'x-excluded-edge-book': 'b1' },
        ),
      ),
    ).toEqual([]);
  });

  it('reevaluates source membership on the next HTTP request', async () => {
    await pool.query("UPDATE books SET visible = false WHERE id = 'b1'");
    try {
      expect(ids(await read('nodes', chapters))).toEqual([]);
    } finally {
      await pool.query("UPDATE books SET visible = true WHERE id = 'b1'");
    }
    expect(ids(await read('nodes', chapters))).toEqual(['c1', 'c2']);
  });

  it('cannot infer a physical relationship from matching column names alone', async () => {
    const result = await read('detached_nodes', { select: 'id,b:books()', b: 'not.is.null' });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 'PGRST200' });
  });

  it('executes canonical contextual Selections through the real Supabase client and runtime', async () => {
    const read = graph.chapters
      .toQuery()
      .orderBy(n => n.id.asc())
      .select(n => ({ id: n.id }));
    expect(await Effect.runPromise(runtime().run(read, undefined))).toEqual([
      { id: 'c1' },
      { id: 'c2' },
    ]);
    expect(await Effect.runPromise(runtime().count(read.limit(1), undefined))).toBe(2);
  });

  it('preserves runtime Boolean composition, empty sources, references and quoted values', async () => {
    const selected = graph.chapters;
    const cases = [
      { selection: selected.not().and(n => n.type.eq('chapter')), ids: ['c3', 'c4', 'root'] },
      { selection: selected.or(n => n.id.eq('root')), ids: ['c1', 'c2', 'root'] },
      {
        selection: selected
          .and(n => n.id.eq('c2'))
          .not()
          .and(n => n.type.eq('chapter')),
        ids: ['c1', 'c3', 'c4', 'root'],
      },
      {
        selection: selected.or(
          Selection.where(graph.Book, b => b.slug.eq('book-two')).parts.chapters,
        ),
        ids: ['c1', 'c2', 'c4'],
      },
      { selection: Selection.none(graph.Book).parts.chapters, ids: [] },
      {
        selection: Selection.none(graph.Book)
          .parts.chapters.not()
          .and(n => n.type.eq('chapter')),
        ids: ['c1', 'c2', 'c3', 'c4', 'root'],
      },
      {
        selection: Selection.where(graph.Book, b => b.slug.eq('book-one')).not().parts.chapters,
        ids: ['c4'],
      },
      { selection: Selection.where(graph.Book, b => b.slug.in([])).parts.chapters, ids: [] },
      {
        selection: Selection.where(graph.Book, b => b.slug.eq('x"),id.not.is.null,slug.eq."x'))
          .parts.chapters,
        ids: [],
      },
    ];
    for (const { selection, ids } of cases) {
      const read = selection
        .toQuery()
        .orderBy(n => n.id.asc())
        .select(n => ({ id: n.id }));
      expect(await Effect.runPromise(runtime().run(read, undefined))).toEqual(
        ids.map(id => ({ id })),
      );
      expect(await Effect.runPromise(runtime().count(read, undefined))).toBe(ids.length);
    }
    const scalarNot = Selection.where(graph.Book, b => b.slug.eq('book-one'))
      .not()
      .toQuery();
    expect(
      (await Effect.runPromise(runtime().run(scalarNot, undefined))).map(row => row.id),
    ).toEqual(['b2']);
  });

  it('supports final shaping, buffered streams and exact-one without extra membership requests', async () => {
    const request = vi.fn<typeof fetch>(fetch);
    const db = runtime({}, request);
    const read = graph.chapters
      .toQuery()
      .orderBy(n => n.id.desc())
      .select(n => ({ key: n.id }))
      .limit(1);
    expect(await Effect.runPromise(db.run(read, undefined))).toEqual([{ key: 'c2' }]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await Effect.runPromise(db.count(read, undefined))).toBe(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect(await Effect.runPromise(db.get(read, undefined))).toEqual({ key: 'c2' });
    expect(
      Array.from(await Effect.runPromise(Stream.runCollect(db.stream(read, undefined)))),
    ).toEqual([{ key: 'c2' }]);
    await expect(Effect.runPromise(db.run(read.one().read, undefined))).rejects.toThrow(
      'received 2',
    );
    await expect(Effect.runPromise(db.count(read.one().read, undefined))).rejects.toThrow(
      'received 2',
    );
    const one = graph.chapters
      .and(n => n.id.eq('c1'))
      .toQuery()
      .one().read;
    expect(await Effect.runPromise(db.get(one, undefined))).toEqual({
      id: 'c1',
      bookId: 'b1',
      parentId: 'p1',
      type: 'chapter',
    });
    request.mockClear();
    await expect(Effect.runPromise(db.run(read.limit(0).one().read, undefined))).rejects.toThrow(
      'limit(0)',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('executes belongs-to and many-to-many images with source and edge RLS', async () => {
    const books = Selection.where(graph.Node, n => n.id.in(['c1', 'c2', 'c3']))
      .through('book')
      .toQuery()
      .select(b => ({ id: b.id }));
    expect(await Effect.runPromise(runtime().run(books, undefined))).toEqual([{ id: 'b1' }]);
    const tags = Selection.all(graph.Book).through('tags').toQuery();
    expect(await Effect.runPromise(runtime().run(tags, undefined))).toEqual([{ id: 'shared' }]);
    expect(await Effect.runPromise(runtime().count(tags, undefined))).toBe(1);
    const hiddenEdges = Selection.where(graph.Book, b => b.id.eq('b1'))
      .through('tags')
      .toQuery();
    expect(
      await Effect.runPromise(
        runtime({ 'x-excluded-edge-book': 'b1' }).run(hiddenEdges, undefined),
      ),
    ).toEqual([]);
  });

  it('negotiates v2 and applies per-hop grants and scopes before runtime execution', async () => {
    type Authority = { excluded: string };
    const book: GraphReadPolicy<typeof graph.Book, Authority> = {
      entity: graph.Book,
      fields: {},
      selectionRelations: ['nodes'],
      modes: ['run'],
      cardinalities: ['many'],
      maxLimit: 25,
      scope: () => Selection.where(graph.Book, b => b.id.eq('b1')),
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
    const request = vi.fn<typeof fetch>(fetch);
    const db = runtime({}, request);
    const execute = vi.fn(read => Effect.runPromise(db.run(read, undefined)));
    const dispatch = createGraphReadDispatcher({
      relationSelections: true,
      policies: [book, node],
      execute,
    });
    let excluded = 'root';
    const transport = vi.fn(async (value: unknown) =>
      dispatch(JSON.parse(JSON.stringify(value)), { authority: { excluded } }),
    );
    const remote = createRemoteDataGraphRuntime({ transport });
    const selected = Selection.all(graph.Book).parts.chapters;
    const read = selected.toQuery().orderBy(n => n.id.asc());
    expect((await Effect.runPromise(remote.run(read, undefined))).map(n => n.id)).toEqual([
      'c1',
      'c2',
    ]);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
    excluded = 'p1';
    expect(await Effect.runPromise(remote.run(read, undefined))).toEqual([]);
    excluded = 'c1';
    expect((await Effect.runPromise(remote.run(read, undefined))).map(n => n.id)).toEqual(['c2']);
    excluded = 'c3';
    const complement = selected
      .not()
      .and(n => n.type.eq('chapter'))
      .toQuery()
      .orderBy(n => n.id.asc());
    expect((await Effect.runPromise(remote.run(complement, undefined))).map(n => n.id)).toEqual([
      'c4',
      'root',
    ]);
    const denied = createGraphReadDispatcher({
      relationSelections: true,
      policies: [{ ...book, selectionRelations: [] }, node],
      execute,
    });
    execute.mockClear();
    const result = await denied(toGraphReadRequestV2(read, 'run'), { authority: { excluded } });
    expect(result).toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    expect(execute).not.toHaveBeenCalled();
  });
});
