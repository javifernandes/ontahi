import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createInMemoryDataGraphStorage } from '../../runtime/storage/in-memory/storage.js';

import {
  createInMemoryReplicatedCollectionStorage,
  createReplicatedCollectionAcceptanceRunner,
  resolveReplicatedCollectionStorage,
  type AcceptedCollectionSnapshot,
  type CollectionObservation,
  type CollectionObservationMode,
  type ReplicatedCollectionObserver,
} from './collection-observer.js';
import { createReplicatedVersionedMaterializerRunner } from './materializer.js';

type RecordValue = { title: string };
type Diagnostic = { code: string };

const observation = (
  overrides: Partial<CollectionObservation<RecordValue, string, Diagnostic>> = {},
): CollectionObservation<RecordValue, string, Diagnostic> => ({
  changes: [
    { kind: 'put', id: 'plan-1', record: { title: 'First' } },
    { kind: 'put', id: 'plan-2', record: { title: 'Second' } },
  ],
  targetFrontier: 'source:1',
  diagnostics: [],
  fetched: 2,
  completeness: 'complete',
  ...overrides,
});

const observerFor = (
  observe: ReplicatedCollectionObserver<RecordValue, string, Diagnostic>['observe'],
): ReplicatedCollectionObserver<RecordValue, string, Diagnostic> => ({ observe });

describe('replicated collection acceptance runner', () => {
  it('bootstraps a complete accepted snapshot with detached records and metrics', async () => {
    const source = observation();
    const runner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async (acceptedFrontier, mode) => {
        expect(acceptedFrontier).toBeNull();
        expect(mode).toBe('bootstrap');
        return source;
      }),
    );

    const result = await runner.run('bootstrap');
    source.changes[0]!.kind === 'put' && (source.changes[0]!.record.title = 'Mutated');

    expect(result).toEqual({
      status: 'accepted',
      snapshot: {
        frontier: 'source:1',
        records: [
          { id: 'plan-1', record: { title: 'First' } },
          { id: 'plan-2', record: { title: 'Second' } },
        ],
      },
      metrics: { fetched: 2, changed: 2, reused: 0, resulting: 2 },
      diagnostics: [],
      observerDiagnostics: [],
    });
    await expect(runner.current()).resolves.toEqual(result.snapshot);
  });

  it('applies positive and negative incremental changes idempotently', async () => {
    const incrementalObservation = observation({
      changes: [
        { kind: 'put', id: 'plan-1', record: { title: 'Updated' } },
        { kind: 'put', id: 'plan-1', record: { title: 'Updated' } },
        { kind: 'remove', id: 'plan-2' },
        { kind: 'remove', id: 'plan-2' },
      ],
      targetFrontier: 'source:2',
      fetched: 4,
      completeness: 'candidate',
    });
    const observations = [observation(), incrementalObservation, incrementalObservation];
    const runner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async () => observations.shift()!),
    );

    await runner.run('bootstrap');
    const result = await runner.run('incremental');

    expect(result).toEqual({
      status: 'accepted',
      snapshot: {
        frontier: 'source:2',
        records: [{ id: 'plan-1', record: { title: 'Updated' } }],
      },
      metrics: { fetched: 4, changed: 2, reused: 0, resulting: 1 },
      diagnostics: [],
      observerDiagnostics: [],
    });
    await expect(runner.run('incremental')).resolves.toMatchObject({
      status: 'accepted',
      metrics: { changed: 0, reused: 1, resulting: 1 },
      snapshot: result.snapshot,
    });
  });

  it.each(['bootstrap', 'validation', 'repair'] as const)(
    'rejects an incomplete %s observation without changing accepted state',
    async mode => {
      const runner = createReplicatedCollectionAcceptanceRunner(
        observerFor(async () => observation({ completeness: 'candidate' })),
      );

      const result = await runner.run(mode);

      expect(result).toMatchObject({
        status: 'rejected',
        diagnostics: [{ code: 'incomplete-observation' }],
      });
      await expect(runner.current()).resolves.toBeNull();
    },
  );

  it('validates an accepted snapshot without advancing it and reports divergence', async () => {
    const observations = [
      observation(),
      observation({ targetFrontier: 'source:validation' }),
      observation({
        changes: [{ kind: 'put', id: 'plan-1', record: { title: 'Diverged' } }],
        targetFrontier: 'source:validation-2',
        fetched: 1,
      }),
    ];
    const runner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async () => observations.shift()!),
    );

    await runner.run('bootstrap');
    const validated = await runner.run('validation');
    const rejected = await runner.run('validation');

    expect(validated).toMatchObject({
      status: 'validated',
      metrics: { fetched: 2, changed: 0, reused: 2, resulting: 2 },
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'validation-mismatch' }],
    });
    await expect(runner.current()).resolves.toMatchObject({ frontier: 'source:1' });
  });

  it('repairs by replacing the complete collection and counts logical record changes', async () => {
    const observations = [
      observation(),
      observation({
        changes: [
          { kind: 'put', id: 'plan-1', record: { title: 'First' } },
          { kind: 'put', id: 'plan-3', record: { title: 'Third' } },
        ],
        targetFrontier: 'source:repair',
      }),
    ];
    const runner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async () => observations.shift()!),
    );

    await runner.run('bootstrap');
    const result = await runner.run('repair');

    expect(result).toMatchObject({
      status: 'accepted',
      metrics: { fetched: 2, changed: 2, reused: 1, resulting: 2 },
      snapshot: {
        frontier: 'source:repair',
        records: [
          { id: 'plan-1', record: { title: 'First' } },
          { id: 'plan-3', record: { title: 'Third' } },
        ],
      },
    });
  });

  it('protects accepted state from a delayed writer', async () => {
    const resolvers: ((value: CollectionObservation<RecordValue, string, Diagnostic>) => void)[] =
      [];
    const storage = createInMemoryReplicatedCollectionStorage<RecordValue, string>();
    const createRunner = () =>
      createReplicatedCollectionAcceptanceRunner(
        observerFor(
          async () =>
            new Promise(resolve => {
              resolvers.push(resolve);
            }),
        ),
        { collectionId: 'plans', storage },
      );
    const delayedRunner = createRunner();
    const winningRunner = createRunner();

    const delayed = delayedRunner.run('bootstrap');
    const winner = winningRunner.run('bootstrap');
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]!(observation({ targetFrontier: 'source:winner' }));
    await expect(winner).resolves.toMatchObject({ status: 'accepted' });
    resolvers[0]!(observation({ targetFrontier: 'source:delayed' }));

    await expect(delayed).resolves.toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'stale-writer' }],
    });
    await expect(delayedRunner.current()).resolves.toMatchObject({ frontier: 'source:winner' });
  });

  it('preserves accepted state after observation failure and requires bootstrap first', async () => {
    const runner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async (_frontier, mode) => {
        if (mode === 'bootstrap') return observation();
        throw new Error('provider unavailable');
      }),
    );
    const emptyRunner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async () => observation()),
    );

    expect(await emptyRunner.run('incremental')).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'missing-accepted-frontier' }],
    });
    await runner.run('bootstrap');
    expect(await runner.run('incremental')).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'observation-failed', message: 'provider unavailable' }],
    });
    await expect(runner.current()).resolves.toMatchObject({ frontier: 'source:1' });
  });

  it('restores accepted state through a shared storage port', async () => {
    const storage = createInMemoryReplicatedCollectionStorage<RecordValue, string>();
    const first = createReplicatedCollectionAcceptanceRunner(
      observerFor(async () => observation()),
      {
        collectionId: 'plans',
        storage,
      },
    );

    await first.run('bootstrap');
    const restored = createReplicatedCollectionAcceptanceRunner(
      observerFor(async acceptedFrontier => {
        expect(acceptedFrontier).toBe('source:1');
        return observation({ changes: [], targetFrontier: 'source:2', completeness: 'candidate' });
      }),
      { collectionId: 'plans', storage },
    );

    await expect(restored.run('incremental')).resolves.toMatchObject({
      status: 'accepted',
      metrics: { changed: 0, reused: 2, resulting: 2 },
      snapshot: { frontier: 'source:2' },
    });
  });

  it('uses the active Entity storage by default and a custom adapter only when supplied', () => {
    const activeStorage = createInMemoryDataGraphStorage();
    const custom = createInMemoryReplicatedCollectionStorage<RecordValue, string>();

    expect(resolveReplicatedCollectionStorage(activeStorage)).toBe(
      activeStorage.replicatedCollectionStorage,
    );
    expect(resolveReplicatedCollectionStorage(activeStorage, custom)).toBe(custom);
    expect(() => resolveReplicatedCollectionStorage({})).toThrow(
      'The active Entity storage does not provide replicated collection persistence.',
    );
  });

  it('hands only an accepted snapshot to a Materializer', async () => {
    const collectionRunner = createReplicatedCollectionAcceptanceRunner(
      observerFor(async () => observation()),
    );
    const acceptance = await collectionRunner.run('bootstrap');
    const snapshot = acceptance.snapshot!;
    const materializer = createReplicatedVersionedMaterializerRunner<
      AcceptedCollectionSnapshot<RecordValue, string>,
      never,
      { count: number }
    >({
      id: 'plan-count',
      version: 'v1',
      affectedBy: () => ({ status: 'known', outputs: [] }),
      derive: async input => ({
        acceptedFrontier: `count:${input.records.length}`,
        state: { count: input.records.length },
        artifacts: [],
        changes: [],
        dependencies: [],
        diagnostics: [],
      }),
    });

    await expect(
      materializer.run({ mode: 'rebuild', input: snapshot, sourceFrontier: snapshot.frontier }),
    ).resolves.toMatchObject({
      result: { status: 'accepted' },
      output: { state: { count: 2 } },
    });
  });

  it('exposes the provider-neutral observer contract', () => {
    expectTypeOf<
      ReplicatedCollectionObserver<RecordValue, string, Diagnostic>['observe']
    >().returns.resolves.toMatchTypeOf<CollectionObservation<RecordValue, string, Diagnostic>>();
    expectTypeOf<CollectionObservationMode>().toEqualTypeOf<
      'bootstrap' | 'incremental' | 'validation' | 'repair'
    >();
  });
});
