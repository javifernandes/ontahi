import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createInMemoryDataGraphStorage,
  entity,
  field,
  query,
  type QueryOrView,
  view,
} from '../../data-graph/index.js';

import type { ApplicationGraphReadOptions } from './application-graph-read.js';
import { ontahi } from './ontahi.js';

const HeadlessItem = entity('HeadlessItem', {
  id: field.id(),
  title: field.string(),
});

const createHeadlessApplication = (titles: readonly string[]) =>
  ontahi({
    storage: createInMemoryDataGraphStorage({
      dataset: {
        HeadlessItem: titles.map((title, index) => ({ id: `item-${index + 1}`, title })),
      },
    }),
    entities: { HeadlessItem },
  });

describe('application-bound Graph reads', () => {
  it('interprets plain and terminal Query intents at the headless application boundary', async () => {
    const application = createHeadlessApplication(['First', 'Second']);
    const items = query(HeadlessItem).orderBy(item => item.id);

    const many = application.graph.read(items);
    const first = application.graph.read(items.first());
    const absentFirst = application.graph.read(items.where(item => item.id.eq('missing')).first());
    const one = application.graph.read(items.where(item => item.id.eq('item-2')).one(), {
      scope: 'test.headless-item',
    });
    const count = application.graph.read(items.count());
    const existing = application.graph.read(items.where(item => item.id.eq('item-2')).exists());
    const missing = application.graph.read(items.where(item => item.id.eq('missing')).exists());

    expectTypeOf(many).toEqualTypeOf<Promise<Array<{ id: string; title: string }>>>();
    expectTypeOf(first).toEqualTypeOf<Promise<{ id: string; title: string } | null>>();
    expectTypeOf(one).toEqualTypeOf<Promise<{ id: string; title: string }>>();
    expectTypeOf(count).toEqualTypeOf<Promise<number>>();
    expectTypeOf(existing).toEqualTypeOf<Promise<boolean>>();

    await expect(many).resolves.toEqual([
      { id: 'item-1', title: 'First' },
      { id: 'item-2', title: 'Second' },
    ]);
    await expect(first).resolves.toEqual({ id: 'item-1', title: 'First' });
    await expect(absentFirst).resolves.toBeNull();
    await expect(one).resolves.toEqual({ id: 'item-2', title: 'Second' });
    await expect(count).resolves.toBe(2);
    await expect(existing).resolves.toBe(true);
    await expect(missing).resolves.toBe(false);
  });

  it('preserves strict one cardinality and parameterized View execution', async () => {
    const application = createHeadlessApplication(['Repeated', 'Repeated']);
    const byTitle = view(
      'HeadlessItemByTitle',
      HeadlessItem,
      ({ root, params }: { root: typeof HeadlessItem; params: { title: string } }) =>
        query(root).where(item => item.title.eq(params.title)),
    );

    type ParameterizedViewOptions = ApplicationGraphReadOptions<typeof byTitle, undefined>;
    type ParamsAreRequired = {} extends Pick<ParameterizedViewOptions, 'params'> ? false : true;
    expectTypeOf<ParamsAreRequired>().toEqualTypeOf<true>();
    expectTypeOf<ParameterizedViewOptions['params']>().toEqualTypeOf<{ title: string }>();

    const repeated = application.graph.read(byTitle, { params: { title: 'Repeated' } });
    expectTypeOf(repeated).toEqualTypeOf<Promise<Array<{ id: string; title: string }>>>();
    await expect(repeated).resolves.toHaveLength(2);
    await expect(
      application.graph.read(
        query(HeadlessItem)
          .where(item => item.title.eq('Repeated'))
          .one(),
      ),
    ).rejects.toThrow(/Expected exactly one HeadlessItem/);
  });

  it('uses the exact application runtime when multiple applications coexist', async () => {
    const firstStorage = createInMemoryDataGraphStorage({
      dataset: {
        HeadlessItem: [{ id: 'item-1', title: 'From first application' }],
      },
    });
    const secondStorage = createInMemoryDataGraphStorage({
      dataset: {
        HeadlessItem: [{ id: 'item-1', title: 'From second application' }],
      },
    });
    const createSecondRuntime = vi.spyOn(secondStorage, 'createRuntime');
    const firstApplication = ontahi({ storage: firstStorage, entities: { HeadlessItem } });
    const secondApplication = ontahi({ storage: secondStorage, entities: { HeadlessItem } });

    await expect(firstApplication.graph.read(query(HeadlessItem).one())).resolves.toEqual({
      id: 'item-1',
      title: 'From first application',
    });
    expect(createSecondRuntime).not.toHaveBeenCalled();
    await expect(secondApplication.graph.read(query(HeadlessItem).one())).resolves.toEqual({
      id: 'item-1',
      title: 'From second application',
    });
  });

  it('passes provider read options through the application boundary', async () => {
    type ReadOptions = { requestId: string };
    const observedOptions: Array<ReadOptions | undefined> = [];
    const baseStorage = createInMemoryDataGraphStorage({
      dataset: { HeadlessItem: [{ id: 'item-1', title: 'Observed' }] },
    });
    const storage = {
      ...baseStorage,
      createRuntime: () => {
        const runtime = baseStorage.createRuntime();
        const observe = (options: ReadOptions | undefined) => observedOptions.push(options);

        return {
          ...runtime,
          get: <TParams, TResult>(
            read: QueryOrView<TParams, TResult>,
            params: TParams,
            options?: ReadOptions,
          ) => {
            observe(options);
            return runtime.get(read, params);
          },
          run: <TParams, TResult>(
            read: QueryOrView<TParams, TResult>,
            params: TParams,
            options?: ReadOptions,
          ) => {
            observe(options);
            return runtime.run(read, params);
          },
          count: <TParams, TResult>(
            read: QueryOrView<TParams, TResult>,
            params: TParams,
            options?: ReadOptions,
          ) => {
            observe(options);
            return runtime.count(read, params);
          },
          stream: <TParams, TResult>(
            read: QueryOrView<TParams, TResult>,
            params: TParams,
            options?: ReadOptions,
          ) => {
            observe(options);
            return runtime.stream(read, params);
          },
        };
      },
    };
    const application = ontahi({ storage, entities: { HeadlessItem } });
    const items = query(HeadlessItem);
    type ProviderReadOptions = ApplicationGraphReadOptions<typeof items, ReadOptions>;
    expectTypeOf<ProviderReadOptions['runtimeOptions']>().toEqualTypeOf<ReadOptions | undefined>();

    await expect(
      application.graph.read(items, {
        runtimeOptions: { requestId: 'atlas-build' },
      }),
    ).resolves.toHaveLength(1);
    expect(observedOptions).toEqual([{ requestId: 'atlas-build' }]);
  });
});
