import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  createRelatedRootReadSpec,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  query,
  Selection,
  toGraphReadRequest,
} from '../index.js';

const List = entity('CardinalityList', { id: field.id(), name: field.string() });
const Item = entity('CardinalityItem', { id: field.id(), list: field.ref(List) });
const Lists = List.hasMany('items', Item, { via: 'list' });
const rows = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
];
const runtime = () =>
  createInMemoryDataGraphRuntime({
    dataset: {
      CardinalityList: rows,
      CardinalityItem: [
        { id: 'i1', list: 'a' },
        { id: 'i2', list: 'a' },
      ],
    },
    entities: [Lists, Item],
  });

describe('exact-one authorized membership', () => {
  it.each([undefined, 1, 2])('checks zero, one and two matches before limit %s', async limit => {
    const rt = runtime();
    for (const ids of [[], ['a'], ['a', 'b']]) {
      const read = {
        ...query(Lists)
          .where(list => list.id.in(ids))
          .orderBy(list => list.name.desc())
          .build(),
        cardinality: 'one' as const,
        limit,
      };
      for (const execution of [
        rt.run(read, undefined),
        rt.get(read, undefined),
        rt.count(read, undefined),
        Stream.runCollect(rt.stream(read, undefined)),
      ]) {
        if (ids.length === 1)
          expect((await Effect.runPromise(execution.pipe(Effect.either)))._tag).toBe('Right');
        else await expect(Effect.runPromise(execution)).rejects.toThrow('Expected exactly one');
      }
    }
  });

  it('rejects limit zero on run/get/stream/count', async () => {
    const rt = runtime();
    const read = query(Lists)
      .where(list => list.id.eq('a'))
      .limit(0)
      .one().read;
    for (const execution of [
      rt.run(read, undefined),
      rt.get(read, undefined),
      rt.count(read, undefined),
      Stream.runCollect(rt.stream(read, undefined)),
    ]) {
      await expect(Effect.runPromise<unknown, unknown>(execution)).rejects.toThrow(
        'cannot use limit(0)',
      );
    }
  });

  it.each([false, true])(
    'checks membership after authority scope, before implicit policy cap (scoped=%s)',
    async scoped => {
      const rt = runtime();
      const executed: number[] = [];
      const dispatch = createGraphReadDispatcher({
        policies: [
          {
            entity: Lists,
            modes: ['run'],
            cardinalities: ['one'],
            maxLimit: 1,
            scope: scoped
              ? () => ({ kind: 'predicate', fieldName: 'id', operator: 'eq', value: 'a' })
              : 'all',
            fields: { id: { select: true }, name: { select: true } },
          },
        ],
        execute: spec => {
          executed.push(spec.limit!);
          return Effect.runPromise(rt.run(spec, undefined));
        },
      });
      const read = new Selection(Lists, { kind: 'all' }, undefined, 'one').toQuery();
      const result = await dispatch(toGraphReadRequest(read, 'run'), { authority: undefined });
      expect(executed).toEqual([1]);
      if (scoped) expect(result).toEqual({ kind: 'graph-read-result', value: [rows[0]] });
      else
        expect(result).toMatchObject({
          kind: 'protocol-error',
          error: { code: 'cardinality_mismatch' },
        });
    },
  );

  it.each([{ ids: [] }, { ids: ['a'] }, { ids: ['b'] }])(
    'checks related target membership before shaping with sources $ids',
    async ({ ids }) => {
      const rt = runtime();
      const read = createRelatedRootReadSpec({
        source: query(Lists).where(list => list.id.in(ids)),
        sourceEntity: Lists,
        relationName: 'items',
        relationOwner: 'source',
        target: query(Item).limit(1).one().read.build(),
        mode: 'rows',
      });
      await expect(Effect.runPromise(rt.run(read, undefined))).rejects.toThrow(
        'Expected exactly one',
      );
      await expect(Effect.runPromise(rt.count(read, undefined))).rejects.toThrow(
        'Expected exactly one',
      );
    },
  );

  it('checks a deferred relation image before applying the final read limit', async () => {
    const selected = Selection.all(Lists).through('items');
    const read = new Selection(Item, selected.expression, undefined, 'one').toQuery().limit(1);
    await expect(Effect.runPromise(runtime().run(read, undefined))).rejects.toThrow(
      'Expected exactly one',
    );
  });

  it('keeps nullable first-result and existence intent distinct from exact-one', async () => {
    const rt = runtime();
    const first = query(Lists)
      .orderBy(list => list.name.desc())
      .limit(1)
      .first();
    await expect(Effect.runPromise(rt.get(first.read, undefined))).resolves.toEqual(rows[1]);
    const missing = query(Lists)
      .where(list => list.id.eq('missing'))
      .first();
    await expect(Effect.runPromise(rt.get(missing.read, undefined))).resolves.toBeNull();
    const bound = createRuntimeBoundDataGraphApi(() => rt).bindSelectionEntity(Lists);
    await expect(
      Effect.runPromise(bound.where(list => list.id.in(['a', 'b'])).exists()),
    ).resolves.toBe(true);
    await expect(
      Effect.runPromise(bound.where(list => list.id.eq('missing')).exists()),
    ).resolves.toBe(false);
  });
});
