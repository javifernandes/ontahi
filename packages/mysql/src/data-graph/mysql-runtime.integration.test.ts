import {
  createInMemoryDataGraphRuntime,
  entity,
  field,
  query,
  mutateEntity,
  createEntityRef,
  type GraphCommandSpec,
} from '@ontahi/core/data-graph';
import { Effect, Fiber } from 'effect';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conformanceGraph,
  conformanceDataset,
} from '../../../sql/src/data-graph/fixtures.test-support.js';
import { dataGraphRuntimeConformance } from '../../../sql/src/data-graph/runtime-conformance.test-support.js';

import { startMysqlTestDatabase } from './mysql.test-support.js';

import { createMysqlDataGraphRuntime, createMysqlDataGraphStorage, mysqlMapping } from './index.js';

let database: Awaited<ReturnType<typeof startMysqlTestDatabase>>;
let pool: Pool;
const { BookWithChapters: Book, mappings } = conformanceGraph;
const Auto = entity('Auto', {
  id: field.number(),
  title: field.string(),
  enabled: field.boolean(),
});
const autoMapping = mysqlMapping({
  entity: Auto,
  table: 'autos',
  columns: { id: 'id', title: 'title', enabled: 'enabled' },
});
const runtime = () => createMysqlDataGraphRuntime({ pool, mappings: [...mappings, autoMapping] });
const insert = (id: string): GraphCommandSpec => ({
  kind: 'command',
  operation: 'insert',
  root: Book,
  selection: { kind: 'none' },
  payload: { id, slug: id, title: id, published: false, note: null },
});
const readBook = (id: string) => query(Book).where(book => book.id.eq(id));

beforeAll(async () => {
  database = await startMysqlTestDatabase();
  pool = database.pool;
  // The fixture owns its schema. Binary, NO PAD collation avoids case and trailing-space folding.
  await pool.query(
    'CREATE TABLE IF NOT EXISTS books (id VARCHAR(100) PRIMARY KEY, slug VARCHAR(100) UNIQUE, title VARCHAR(200), published BOOLEAN, note VARCHAR(200)) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin',
  );
  await pool.query(
    'CREATE TABLE IF NOT EXISTS chapters (id VARCHAR(100) PRIMARY KEY, book_id VARCHAR(100), title VARCHAR(200), position INT) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin',
  );
  await pool.query(
    'CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(100) PRIMARY KEY, chapter_id VARCHAR(100), content VARCHAR(200), position INT) ENGINE=InnoDB COLLATE=utf8mb4_0900_bin',
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS autos (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(100) NOT NULL DEFAULT 'untitled', enabled BOOLEAN NOT NULL DEFAULT true) ENGINE=InnoDB",
  );
}, 180_000);

afterAll(async () => {
  await database?.close();
});
beforeEach(async () => {
  for (const table of ['blocks', 'chapters', 'books', 'autos'])
    await pool.query(`DELETE FROM ${table}`);
  for (const mapping of mappings) {
    const rows = conformanceDataset[mapping.entity.name as keyof typeof conformanceDataset];
    for (const row of rows) {
      const fields = Object.keys(row);
      await pool.execute(
        `INSERT INTO ${mapping.table} (${fields.map(field => `\`${(mapping.columns as Record<string, string>)[field]}\``).join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        Object.values(row),
      );
    }
  }
});

dataGraphRuntimeConformance('MySQL', async () => ({ runtime: runtime() }));

// The same extracted cases remain executable without SQL or database infrastructure.
dataGraphRuntimeConformance('in-memory baseline', async () => ({
  runtime: createInMemoryDataGraphRuntime({ dataset: structuredClone(conformanceDataset) }),
}));

describe('MySQL mutation guarantees', () => {
  it('rolls back interrupted work and releases the connection', async () => {
    let signal!: () => void;
    const started = new Promise<void>(resolve => {
      signal = resolve;
    });
    const fiber = Effect.runFork(
      runtime().transaction(tx =>
        tx.runCommand(insert('interrupted')).pipe(
          Effect.tap(() => Effect.sync(signal)),
          Effect.zipRight(Effect.never),
        ),
      ),
    );
    await started;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(await Effect.runPromise(runtime().get(readBook('interrupted'), undefined))).toBeNull();
  });

  it('recovers auto-generated keys and server defaults from each inserted row', async () => {
    const rows = (await Effect.runPromise(
      runtime().runCommand({
        kind: 'command',
        operation: 'insert_many',
        root: Auto,
        selection: { kind: 'none' },
        payload: [{ title: 'first' }, { title: 'second' }],
        returning: ['id', 'title', 'enabled'],
      }),
    )) as Array<{ id: number; title: string; enabled: boolean }>;
    expect(rows.map(({ title, enabled }) => ({ title, enabled }))).toEqual([
      { title: 'first', enabled: true },
      { title: 'second', enabled: true },
    ]);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    expect(await Effect.runPromise(runtime().count(query(Auto), undefined))).toBe(2);
  });

  it('returns exact postimages when an update changes its selecting predicate and when values are unchanged', async () => {
    const command: GraphCommandSpec = {
      kind: 'command',
      operation: 'update',
      root: Book,
      selection: readBook('book-1').build().selection,
      payload: { title: 'Alpha' },
      returning: ['id', 'title'],
      cardinality: 'one',
    };
    expect(await Effect.runPromise(runtime().runCommand(command))).toEqual({
      id: 'book-1',
      title: 'Alpha',
    });
    expect(
      await Effect.runPromise(
        runtime().runCommand({
          ...command,
          selection: query(Book)
            .where(book => book.title.eq('Alpha'))
            .build().selection,
          payload: { title: 'Changed' },
        }),
      ),
    ).toEqual({ id: 'book-1', title: 'Changed' });
  });

  it('rolls back an earlier insert when a later bulk row violates a unique constraint', async () => {
    const result = await Effect.runPromise(
      runtime()
        .runCommand({
          ...insert('new'),
          operation: 'insert_many',
          payload: [insert('new').payload, insert('book-1').payload],
        })
        .pipe(Effect.either),
    );
    expect(result._tag).toBe('Left');
    expect(await Effect.runPromise(runtime().get(readBook('new'), undefined))).toBeNull();
  });

  it('rolls back an entire transaction on failure and persists successful work', async () => {
    const result = await Effect.runPromise(
      runtime()
        .transaction(tx =>
          tx.runCommand(insert('rollback')).pipe(Effect.zipRight(Effect.fail('abort'))),
        )
        .pipe(Effect.either),
    );
    expect(result).toMatchObject({ _tag: 'Left', left: 'abort' });
    expect(await Effect.runPromise(runtime().get(readBook('rollback'), undefined))).toBeNull();
    await Effect.runPromise(runtime().transaction(tx => tx.runCommand(insert('commit'))));
    expect(await Effect.runPromise(runtime().get(readBook('commit'), undefined))).not.toBeNull();
  });

  it('uses a savepoint so catching a failed command cannot commit its partial writes', async () => {
    await Effect.runPromise(
      runtime().transaction(tx =>
        tx
          .runCommand({
            ...insert('partial'),
            operation: 'insert_many',
            payload: [insert('partial').payload, insert('book-1').payload],
          })
          .pipe(Effect.catchAll(() => tx.runCommand(insert('survives')))),
      ),
    );
    expect(await Effect.runPromise(runtime().get(readBook('partial'), undefined))).toBeNull();
    expect(await Effect.runPromise(runtime().get(readBook('survives'), undefined))).not.toBeNull();
  });

  it('updates primary keys and returns the new identity', async () => {
    expect(
      await Effect.runPromise(
        runtime().runCommand({
          ...insert('unused'),
          operation: 'update',
          selection: readBook('book-1').build().selection,
          payload: { id: 'changed' },
          returning: ['id'],
          cardinality: 'one',
        }),
      ),
    ).toEqual({ id: 'changed' });
    expect(await Effect.runPromise(runtime().get(readBook('book-1'), undefined))).toBeNull();
  });

  it('rejects a conflict on another unique index and rolls back earlier bulk rows', async () => {
    const result = await Effect.runPromise(
      runtime()
        .runCommand({
          ...insert('first'),
          operation: 'upsert',
          payload: [
            insert('first').payload,
            { ...(insert('second').payload as object), id: 'book-1', slug: 'different' },
          ],
          upsert: { conflictOn: ['slug'], strategy: 'merge' },
        })
        .pipe(Effect.either),
    );
    expect(result._tag).toBe('Left');
    expect(await Effect.runPromise(runtime().get(readBook('first'), undefined))).toBeNull();
    expect(await Effect.runPromise(runtime().get(readBook('book-1'), undefined))).toEqual(
      conformanceDataset.Book[0],
    );
  });

  it('serializes competing upserts on the requested unique key and returns each postimage', async () => {
    const results = await Promise.all(
      ['race-a', 'race-b'].map(id =>
        Effect.runPromise(
          runtime().runCommand({
            ...insert(id),
            operation: 'upsert',
            payload: { ...(insert(id).payload as object), slug: 'shared-key' },
            upsert: { conflictOn: ['slug'], strategy: 'merge' },
            returning: ['id', 'slug'],
            cardinality: 'one',
          }),
        ),
      ),
    );
    expect(results).toEqual([
      { id: 'race-a', slug: 'shared-key' },
      { id: 'race-b', slug: 'shared-key' },
    ]);
    expect(
      await Effect.runPromise(
        runtime().count(
          query(Book).where(book => book.slug.eq('shared-key')),
          undefined,
        ),
      ),
    ).toBe(1);
  });

  it('rejects an upsert target without a matching unique index before inserting', async () => {
    const result = await Effect.runPromise(
      runtime()
        .runCommand({
          ...insert('nonunique'),
          operation: 'upsert',
          upsert: { conflictOn: ['title'], strategy: 'merge' },
        })
        .pipe(Effect.either),
    );
    expect(result).toMatchObject({ _tag: 'Left', left: { reason: 'invalid_command' } });
    expect(await Effect.runPromise(runtime().get(readBook('nonunique'), undefined))).toBeNull();
  });

  it('allows only one competing conditional mutation to apply', async () => {
    const command = mutateEntity(Book).update(
      createEntityRef(Book, { id: 'book-1' }),
      { published: true },
      { if: { published: false } },
    );
    const results = await Promise.all(
      [0, 1].map(() =>
        Effect.runPromise(runtime().runEntityMutationCommand(command).pipe(Effect.either)),
      ),
    );
    expect(results.filter(result => result._tag === 'Right')).toHaveLength(1);
    expect(results.filter(result => result._tag === 'Left')).toMatchObject([
      { left: { reason: 'entity_mutation_condition_not_met' } },
    ]);
  });

  it('returns Entity Mutation deltas and conditional failures', async () => {
    const result = await Effect.runPromise(
      runtime().runEntityMutationCommand(
        mutateEntity(Book).update(
          createEntityRef(Book, { id: 'book-1' }),
          { published: true },
          { if: { published: false } },
        ),
      ),
    );
    expect(result.updated[0]?.values.published).toBe(true);
    const failure = await Effect.runPromise(
      runtime()
        .runEntityMutationCommand(
          mutateEntity(Book).update(
            createEntityRef(Book, { id: 'book-1' }),
            { published: false },
            { if: { published: false } },
          ),
        )
        .pipe(Effect.either),
    );
    expect(failure).toMatchObject({
      _tag: 'Left',
      left: { reason: 'entity_mutation_condition_not_met' },
    });
  });

  it('rejects nontransactional storage engines before writes', async () => {
    await pool.query('CREATE TABLE IF NOT EXISTS unsafe_books LIKE books');
    await pool.query('ALTER TABLE unsafe_books ENGINE=MyISAM');
    const unsafe = createMysqlDataGraphRuntime({
      pool,
      mappings: [{ ...mappings[0]!, table: 'unsafe_books' }],
    });
    const result = await Effect.runPromise(unsafe.runCommand(insert('unsafe')).pipe(Effect.either));
    expect(result).toMatchObject({ _tag: 'Left', left: { reason: 'invalid_command' } });
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM unsafe_books');
    expect(rows).toEqual([]);
  });
});

describe('MySQL storage reflection', () => {
  it('infers conventional mappings when bound without explicit mappings', async () => {
    const storage = createMysqlDataGraphStorage({ pool });
    storage.bindEntities?.([Auto]);
    expect(await Effect.runPromise(storage.createRuntime().count(query(Auto), undefined))).toBe(0);
  });

  it('reports missing columns and applies membership filters', async () => {
    const Drift = entity('Drift', {
      id: field.id(),
      title: field.string(),
      absent: field.string(),
    });
    const storage = createMysqlDataGraphStorage({
      pool,
      mappings: [
        mysqlMapping({
          entity: Drift,
          table: 'books',
          columns: { id: 'id', title: 'title', absent: 'absent' },
        }),
      ],
    });
    const result = await storage.readEntityData({
      entityName: 'Drift',
      filters: [{ field: 'id', operator: 'in', values: ['book-2'] }],
    });
    expect(result.rows).toEqual([{ id: 'book-2', title: 'Beta' }]);
    expect(result.omittedColumns?.map(column => column.field)).toEqual(['absent']);
    expect(result.totalCount).toBe(1);
  });

  it('binds entities and reads reflected data with search, boolean filters and pagination', async () => {
    const storage = createMysqlDataGraphStorage({ pool, mappings });
    storage.bindEntities?.([Book, conformanceGraph.ChapterWithBlocks, conformanceGraph.Block]);
    const result = await storage.readEntityData({
      entityName: 'Book',
      search: 'ALPHA',
      pageSize: 10,
      filters: [{ field: 'published', operator: 'equals', value: 'false' }],
      sort: { field: 'title', direction: 'asc' },
    });
    expect(result.totalCount).toBe(1);
    expect(result.rows).toEqual([conformanceDataset.Book[0]]);
    expect(result.omittedColumns).toEqual([]);
  });
});
