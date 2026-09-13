import { Effect, Stream } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEntityRef,
  createGraphClientCache,
  createInMemoryDataGraphRuntime,
  createRuntimeBoundDataGraphApi,
  entity,
  field,
  query,
  reconcileGraphReadSnapshot,
  type DataGraphExecutionRuntime,
  type DataGraphObservationRuntime,
} from './index.js';

const Node = entity('BoundNode', {
  id: field.id(),
  type: field.enum(['part', 'chapter']),
  title: field.string(),
});
const Chapter = Node.variant('BoundChapter', { discriminator: { type: 'chapter' } });
const rows = [
  { id: 'p', type: 'part', title: 'Part' },
  { id: 'c1', type: 'chapter', title: 'Intro' },
  { id: 'c2', type: 'chapter', title: 'End' },
];
const runtime = () =>
  createInMemoryDataGraphRuntime({ entities: [Node], dataset: { BoundNode: rows } });

describe('read-only runtime-bound variants', () => {
  it('binds lazily, preserves membership composition and leaves the source untouched', async () => {
    const getRuntime = vi.fn(runtime);
    const api = createRuntimeBoundDataGraphApi(getRuntime);
    const source = Chapter.where(node => node.id.eq('c1'));
    const bound = api.bindVariantSelection(source);
    const other = createRuntimeBoundDataGraphApi(runtime).bindVariantSelection(Chapter.all());
    const task = bound.or(other.where(node => node.id.eq('c2'))).run();
    expect(getRuntime).not.toHaveBeenCalled();
    expect(await Effect.runPromise(task)).toEqual(rows.slice(1));
    expect(await Effect.runPromise(bound.and(other).not().run())).toEqual([rows[2]]);
    expect('run' in source).toBe(false);
    expect('update' in bound).toBe(false);
    expectTypeOf(bound).not.toHaveProperty('delete');
    expectTypeOf(bound.limit(1)).not.toHaveProperty('update');
    expectTypeOf<Effect.Effect.Success<ReturnType<typeof bound.run>>>().toMatchTypeOf<
      Array<{ type: 'chapter' }>
    >();
    expect(bound.toQuery().build().root).toBe(Node);
    expect(() => JSON.stringify(bound)).toThrow('Variant Selection transport');
    expect(() => api.bindVariantSelection({ toQuery: () => query(Node) } as never)).toThrow(
      'declared VariantSelection',
    );
  });

  it('retains runtime binding through read shaping and all terminal intents', async () => {
    const bound = createRuntimeBoundDataGraphApi(runtime).bindVariantSelection(Chapter.all());
    const shaped = bound
      .many()
      .orderBy(node => node.title.asc())
      .limit(1);
    expect(await Effect.runPromise(shaped.run())).toEqual([rows[2]]);
    expect(
      await Effect.runPromise(
        bound
          .orderBy(node => node.title.asc())
          .first()
          .run(),
      ),
    ).toEqual(rows[2]);
    expect(await Effect.runPromise(bound.count().run())).toBe(2);
    expect(await Effect.runPromise(bound.exists().run())).toBe(true);
    expect(await Effect.runPromise(bound.limit(0).exists().run())).toBe(false);
    const missing = bound.where(node => node.id.eq('missing'));
    expect(await Effect.runPromise(missing.first().run())).toBeNull();
    expect(await Effect.runPromise(missing.exists().run())).toBe(false);
    expect(
      await Effect.runPromise(
        bound
          .where(node => node.id.eq('c1'))
          .one()
          .run(),
      ),
    ).toEqual(rows[1]);
    await expect(Effect.runPromise(bound.limit(1).one().run())).rejects.toThrow(
      'Expected exactly one',
    );
    await expect(Effect.runPromise(missing.one().run())).rejects.toThrow('Expected exactly one');
    await expect(Effect.runPromise(bound.limit(0).one().run())).rejects.toThrow(
      'cannot use limit(0)',
    );
    expect(await Effect.runPromise(Stream.runCollect(bound.exec().stream()))).toHaveLength(2);
  });

  it('resolves the current runtime at execution and forwards options and failures', async () => {
    type Options = { authority: string };
    let current: DataGraphExecutionRuntime<string, Options> &
      Partial<DataGraphObservationRuntime<string, Options>> = {
      run: () => Effect.succeed([]),
      get: () => Effect.succeed(null),
      count: () => Effect.succeed(0),
      stream: () => Stream.empty,
      runCommand: () => Effect.fail('unsupported'),
    };
    const getRuntime = vi.fn(() => current);
    const bound = createRuntimeBoundDataGraphApi(getRuntime).bindVariantSelection(Chapter.all());
    const options = { authority: 'alice' };
    const pending = bound.run(options);
    const failedRun = vi.fn(() => Effect.fail('denied'));
    current = { ...current, run: failedRun };
    expect(await Effect.runPromise(Effect.either(pending))).toMatchObject({ left: 'denied' });
    expect(failedRun).toHaveBeenCalledWith(expect.anything(), undefined, options);
    const get = vi.fn(() => Effect.fail('get denied'));
    const count = vi.fn(() => Effect.fail('count denied'));
    const stream = vi.fn(() => Stream.fail('stream denied'));
    const observe = vi.fn(() => Stream.fail('observe denied'));
    current = { ...current, get, count, stream, observe };
    for (const task of [
      bound.first().run(options),
      bound.one().run(options),
      bound.exists().run(options),
      bound.count().run(options),
    ])
      expect((await Effect.runPromise(Effect.either<unknown, string, never>(task)))._tag).toBe(
        'Left',
      );
    for (const task of [
      bound.exec().stream(undefined, options),
      bound.exec().observe(undefined, options),
    ])
      expect(
        (await Effect.runPromise(Effect.either(Stream.runCollect<unknown, string, never>(task))))
          ._tag,
      ).toBe('Left');
    for (const method of [get, count, stream, observe])
      expect(method).toHaveBeenCalledWith(expect.anything(), undefined, options);
    expectTypeOf(bound.run(options)).toMatchTypeOf<Effect.Effect<unknown[], string>>();
  });

  it('normalizes base and classified snapshots into one canonical identity and invalidates it once', async () => {
    const rt = runtime();
    const api = createRuntimeBoundDataGraphApi(() => rt);
    const cache = createGraphClientCache();
    const base = query(Node);
    const classified = api.bindVariantSelection(Chapter.all());
    const baseSnapshot = reconcileGraphReadSnapshot(
      cache,
      base,
      undefined,
      await Effect.runPromise(rt.run(base, undefined)),
    );
    const variantSnapshot = reconcileGraphReadSnapshot(
      cache,
      classified.toQuery(),
      undefined,
      await Effect.runPromise(classified.run()),
    );
    expect(variantSnapshot.writes.map(write => write.ref)).toEqual(
      baseSnapshot.writes.slice(1).map(write => write.ref),
    );
    const ref = createEntityRef(Node, { id: 'c1' });
    expect(cache.readEntity(ref)).toEqual(rows[1]);
    expect(cache.readEntity({ ...ref, entityName: Chapter.name })).toBeUndefined();
    // A cached base record, even with a valid identity, is not evidence of classified membership.
    expect(cache.readEntity(createEntityRef(Node, { id: 'p' }))).toEqual(rows[0]);
    const wrong = api.bindVariantSelection(
      Chapter.references([createEntityRef(Node, { id: 'p' })]),
    );
    expect(await Effect.runPromise(wrong.run())).toEqual([]);
    cache.invalidateEntity(ref);
    expect(cache.readEntity(ref)).toBeUndefined();
    expect(cache.invalidateEntity(ref)).toBeUndefined();
  });
});
