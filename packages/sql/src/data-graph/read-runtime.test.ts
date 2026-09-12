import {
  createEntityRef,
  createRelatedRootReadSpec,
  entity,
  field,
  mapEntity,
  mapRelation,
  query,
  resolveQuerySpec,
  Selection,
  type RelatedRootReadMode,
} from '@ontahi/core/data-graph';
import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';

import { sqlMapping } from './mapping.js';
import type { ParameterizedSql } from './query.js';
import { createSqlReadRuntime } from './read-runtime.js';

class ReadError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
const dialect = {
  quoteIdentifier: (name: string) => `"${name}"`,
  placeholder: (index: number) => `$${index}`,
  countExpression: 'COUNT(*)',
  order: (sql: string, direction: string) => `${sql} ${direction}`,
};
const model = () => {
  const Parent = entity('ReadParent', { id: field.id(), name: field.string() });
  const Child = entity('ReadChild', {
    id: field.id(),
    parent: field.ref(Parent),
    active: field.boolean(),
  });
  const Tag = entity('ReadTag', { id: field.id(), label: field.string() });
  const Children = Child.manyToMany('tags', Tag);
  const Parents = Parent.hasMany('children', Children, { via: 'parent', ordered: true });
  mapEntity(Parents).toTable('parents');
  mapEntity(Children).toTable('children', { parent: 'parent_id' });
  mapEntity(Tag).toTable('tags');
  mapRelation(Parents, 'children', {
    type: 'one-to-many',
    from: 'parents.id',
    to: 'children.parent_id',
    orderBy: 'children.position',
  });
  mapRelation(Children, 'tags', {
    type: 'many-to-many',
    from: 'children.id',
    to: 'tags.id',
    through: { table: 'edges', fromColumn: 'child_id', toColumn: 'tag_id' },
  });
  const mappings = [
    sqlMapping({ entity: Parents, table: 'parents', columns: { id: 'id', name: 'name' } }),
    sqlMapping({
      entity: Children,
      table: 'children',
      columns: { id: 'id', parent: 'parent_id', active: 'active' },
    }),
    sqlMapping({ entity: Tag, table: 'tags', columns: { id: 'id', label: 'label' } }),
  ];
  return { Parent: Parents, Child: Children, Tag, mappings };
};
const parent = { id: 'p1', name: 'Parent' };
const child = { id: 'c1', parent: 'p1', active: true };
const tag = { id: 't1', label: 'Tag' };
type Row = Record<string, unknown>;
const harness = (responses: (Row[] | Error)[], graph = model(), relationSelections?: true) => {
  const calls: ParameterizedSql[] = [];
  const runtime = createSqlReadRuntime({
    mappings: graph.mappings,
    relationSelections,
    dialect,
    Error: ReadError,
    normalizeRow: (entity, row) =>
      entity.name === graph.Child.name ? { ...row, active: Boolean(row.active) } : row,
    executeQuery: async <T extends Row>(sql: ParameterizedSql) => {
      calls.push(sql);
      const response = responses.shift();
      if (!response) throw new Error('Unexpected SQL execution');
      if (response instanceof Error) throw response;
      return { rows: response as T[] };
    },
  });
  return { ...graph, runtime, calls };
};

describe('exact-one membership before SQL shaping', () => {
  it('probes for a second member in the same read even with limit one', async () => {
    const h = harness([[parent]]);
    const read = { ...query(h.Parent).limit(1).build(), cardinality: 'one' as const };
    await expect(Effect.runPromise(h.runtime.run(read, undefined))).resolves.toEqual([parent]);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.text).toMatch(/ LIMIT 2$/);
  });

  it('enforces cardinality on counts too', async () => {
    const h = harness([[{ count: 2 }]]);
    const read = { ...query(h.Parent).limit(1).build(), cardinality: 'one' as const };
    await expect(Effect.runPromise(h.runtime.count(read, undefined))).rejects.toThrow(
      'Expected exactly one',
    );
  });

  it.each(['run', 'count'] as const)(
    'rejects one with limit zero before %s executes SQL',
    async mode => {
      const h = harness([]);
      const read = { ...query(h.Parent).limit(0).build(), cardinality: 'one' as const };
      await expect(
        Effect.runPromise<unknown, unknown>(h.runtime[mode](read, undefined)),
      ).rejects.toThrow('cannot use limit(0)');
      expect(h.calls).toEqual([]);
    },
  );
});
const related = (
  graph: ReturnType<typeof model>,
  mode: RelatedRootReadMode,
  many = false,
  inverse = false,
) => {
  const source = many ? graph.Child : graph.Parent;
  const target = many ? graph.Tag : graph.Child;
  return createRelatedRootReadSpec({
    mode,
    source: query(inverse ? target : source),
    sourceEntity: inverse ? target : source,
    target: resolveQuerySpec(query(inverse ? source : target), undefined),
    relationName: many ? 'tags' : 'children',
    relationOwner: inverse ? 'target' : 'source',
  });
};

describe('shared SQL read materialization', () => {
  it.each([false, true])(
    'checks related target cardinality, including empty source (many=%s)',
    async many => {
      for (const emptySource of [false, true]) {
        for (const mode of ['run', 'count'] as const) {
          const target = many ? tag : child;
          const h = harness(
            emptySource
              ? [[]]
              : [
                  [many ? child : parent],
                  ...(many
                    ? [
                        [
                          { source_value: 'c1', target_value: 't1' },
                          { source_value: 'c1', target_value: 't2' },
                        ],
                      ]
                    : []),
                  [target, { ...target, id: 'second' }],
                ],
          );
          const read = related(h, 'rows', many);
          read.target = { ...read.target, cardinality: 'one', limit: 1 };
          await expect(
            Effect.runPromise<unknown, unknown>(h.runtime[mode](read, undefined)),
          ).rejects.toThrow('Expected exactly one');
        }
      }
    },
  );

  it('keeps contextual membership disabled unless a provider opts in', async () => {
    const graph = harness([]);
    await expect(
      Effect.runPromise(
        graph.runtime.run(Selection.all(graph.Parent).through('children').toQuery(), undefined),
      ),
    ).rejects.toThrow('SQL data graph execution failed');
    expect(graph.calls).toEqual([]);
  });
  it('passes receiver mappings to reads and counts without source-ID prefetch', async () => {
    const graph = harness([[tag], [{ count: 1 }]], model(), true);
    const read = Selection.where(graph.Parent, p => p.id.eq('p1'))
      .through('children')
      .through('tags')
      .toQuery()
      .limit(1);
    expect(await Effect.runPromise(graph.runtime.run(read, undefined))).toEqual([tag]);
    expect(graph.calls).toHaveLength(1);
    expect(graph.calls[0]!.values).toEqual(['p1']);
    expect(graph.calls[0]!.text.match(/EXISTS/g)).toHaveLength(2);
    expect(await Effect.runPromise(graph.runtime.count(read, undefined))).toBe(1);
    expect(graph.calls[1]!.text).not.toContain('LIMIT');
  });
  it('lifts references, normalizes driver values, and hides auxiliary keys from nested projections', async () => {
    const h = harness([[{ ...child, active: 1 }]]);
    const read = query(h.Child).as(h.Child.view('ReadChildView', { parent: true, active: true }));
    expect(await Effect.runPromise(h.runtime.run(read, undefined))).toEqual([
      { parent: createEntityRef(h.Parent, { id: 'p1' }), active: true },
    ]);
    expect(h.calls).toHaveLength(1);
  });
  it('loads ordered nested relations and preserves only the requested parent projection', async () => {
    const h = harness([[parent], [child]]);
    expect(
      await Effect.runPromise(
        h.runtime.run(
          query(h.Parent).select(row => ({
            title: row.name,
            children: row.children.select(item => ({ id: item.id })),
          })),
          undefined,
        ),
      ),
    ).toEqual([{ title: 'Parent', children: [{ id: 'c1' }] }]);
    expect(h.calls[1]!.text).toContain('ORDER BY "position" asc');
    expect(h.calls[1]!.values).toEqual(['p1']);
  });
  it('includes belongs-to rows and returns null when the foreign row is absent', async () => {
    for (const rows of [[parent], []]) {
      const h = harness([[child], rows]);
      const result = await Effect.runPromise(
        h.runtime.run(
          query(h.Child).include(row => ({ parent: row.parent })),
          undefined,
        ),
      );
      expect(result[0]!.parent).toEqual(rows[0] ?? null);
    }
  });
  it('loads many-to-many edges and avoids target reads for an empty edge set', async () => {
    for (const hasEdges of [true, false]) {
      const h = harness(hasEdges ? [[child], [{ target_value: 't1' }], [tag]] : [[child], []]);
      const result = await Effect.runPromise(
        h.runtime.run(
          query(h.Child).include(row => ({ tags: row.tags })),
          undefined,
        ),
      );
      expect(result[0]!.tags).toEqual(hasEdges ? [tag] : []);
      expect(h.calls).toHaveLength(hasEdges ? 3 : 2);
    }
  });
  it('gets null for missing rows and executes a stream once', async () => {
    const h = harness([[], [parent]]);
    expect(await Effect.runPromise(h.runtime.get(query(h.Parent), undefined))).toBeNull();
    expect(
      Array.from(
        await Effect.runPromise(Stream.runCollect(h.runtime.stream(query(h.Parent), undefined))),
      ),
    ).toEqual([parent]);
    expect(h.calls).toHaveLength(2);
  });
  it('preserves exact cardinality errors and wraps driver failures', async () => {
    const h = harness([[], new Error('driver unavailable')]);
    const exact = { ...resolveQuerySpec(query(h.Parent), undefined), cardinality: 'one' as const };
    expect(
      await Effect.runPromise(h.runtime.run(exact, undefined).pipe(Effect.either)),
    ).toMatchObject({ _tag: 'Left', left: { reason: 'cardinality_mismatch' } });
    expect(
      await Effect.runPromise(h.runtime.get(query(h.Parent), undefined).pipe(Effect.either)),
    ).toMatchObject({
      _tag: 'Left',
      left: { reason: 'execution_failed', cause: { message: 'driver unavailable' } },
    });
  });
  it('counts without result limits, converts driver count strings, and reports count failures', async () => {
    const h = harness([[{ count: '7' }], [], new Error('count failed')]);
    const read = query(h.Parent).limit(1);
    expect(await Effect.runPromise(h.runtime.count(read, undefined))).toBe(7);
    expect(h.calls[0]!.text).not.toContain('LIMIT');
    expect(await Effect.runPromise(h.runtime.count(read, undefined))).toBe(0);
    expect(
      await Effect.runPromise(h.runtime.count(read, undefined).pipe(Effect.either)),
    ).toMatchObject({ _tag: 'Left', left: { cause: { message: 'count failed' } } });
  });
  it.each([false, true])('resolves all related-root result modes (many-to-many=%s)', async many => {
    for (const mode of ['rows', 'entityRows', 'resolve', 'countBySource'] as const) {
      const graph = model();
      const sourceRow = many ? child : parent;
      const targetRow = many ? tag : child;
      const responses: Row[][] = [[sourceRow]];
      if (mode === 'resolve' || mode === 'countBySource') responses.push([sourceRow]);
      if (many) responses.push([{ source_value: 'c1', target_value: 't1' }]);
      responses.push([targetRow]);
      const h = harness(responses, graph);
      const result = await Effect.runPromise(h.runtime.run(related(graph, mode, many), undefined));
      const sourceRows = many
        ? [{ ...child, parent: createEntityRef(graph.Parent, { id: 'p1' }) }]
        : [parent];
      const rows =
        many || mode === 'entityRows'
          ? [targetRow]
          : [{ ...child, parent: createEntityRef(graph.Parent, { id: 'p1' }) }];
      if (mode === 'resolve') expect(result).toEqual([{ sourceRows, rows }]);
      else if (mode === 'countBySource')
        expect(result).toEqual([{ sourceRows, countsBySource: new Map([[sourceRow.id, 1]]) }]);
      else expect(result).toEqual(rows);
    }
  });
  it.each([false, true])(
    'short-circuits empty source membership in all modes (many=%s)',
    async many => {
      for (const mode of ['rows', 'entityRows', 'resolve', 'countBySource'] as const) {
        const h = harness(mode === 'resolve' || mode === 'countBySource' ? [[], []] : [[]]);
        const result = await Effect.runPromise(h.runtime.run(related(h, mode, many), undefined));
        if (mode === 'resolve') expect(result).toEqual([{ sourceRows: [], rows: [] }]);
        else if (mode === 'countBySource')
          expect(result).toEqual([{ sourceRows: [], countsBySource: new Map() }]);
        else expect(result).toEqual([]);
      }
    },
  );
  it('traverses inverse many-to-many edges using their physical orientation', async () => {
    const h = harness([[tag], [{ source_value: 't1', target_value: 'c1' }], [child]]);
    const result = await Effect.runPromise(
      h.runtime.run(related(h, 'rows', true, true), undefined),
    );
    expect(result).toEqual([{ ...child, parent: createEntityRef(h.Parent, { id: 'p1' }) }]);
    expect(h.calls[1]!.text).toContain('"tag_id" AS source_value');
    expect(h.calls[1]!.values).toEqual(['t1']);
  });
  it.each([false, true])(
    'counts related rows without the target limit and preserves count errors (many=%s)',
    async many => {
      const h = harness(
        many ? [[child], [{ source_value: 'c1', target_value: 't1' }], [tag]] : [[parent], [child]],
      );
      const read = related(h, 'rows', many);
      read.target.limit = 1;
      expect(await Effect.runPromise(h.runtime.count(read, undefined))).toBe(1);
      expect(h.calls.at(-1)!.text).not.toContain('LIMIT');
      const error = await Effect.runPromise(h.runtime.count(read, undefined).pipe(Effect.either));
      expect(error).toMatchObject({ _tag: 'Left', left: { reason: 'execution_failed' } });
    },
  );
  it('rejects missing relation and entity mappings instead of returning partial data', async () => {
    const h = harness([[child]]);
    h.Child.relations.tags.mapping = undefined;
    expect(
      await Effect.runPromise(
        h.runtime
          .run(
            query(h.Child).include(row => ({ tags: row.tags })),
            undefined,
          )
          .pipe(Effect.either),
      ),
    ).toMatchObject({
      _tag: 'Left',
      left: { cause: { message: expect.stringContaining('not mapped') } },
    });
    const Unknown = entity('Unknown', { id: field.id() });
    expect(
      await Effect.runPromise(h.runtime.run(query(Unknown), undefined).pipe(Effect.either)),
    ).toMatchObject({
      _tag: 'Left',
      left: { cause: { message: 'Missing SQL mapping for Unknown.' } },
    });
  });
});
