import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createReplicatedCollectionAcceptanceRunner,
  type CollectionObservation,
  type CollectionObservationMode,
  type ReplicatedCollectionObserver,
} from './collection-observer.js';

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
    expect(runner.current()).toEqual(result.snapshot);
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
      expect(runner.current()).toBeNull();
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
    expect(runner.current()?.frontier).toBe('source:1');
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
    const runner = createReplicatedCollectionAcceptanceRunner(
      observerFor(
        async () =>
          new Promise(resolve => {
            resolvers.push(resolve);
          }),
      ),
    );

    const delayed = runner.run('bootstrap');
    const winner = runner.run('bootstrap');
    resolvers[1]!(observation({ targetFrontier: 'source:winner' }));
    await expect(winner).resolves.toMatchObject({ status: 'accepted' });
    resolvers[0]!(observation({ targetFrontier: 'source:delayed' }));

    await expect(delayed).resolves.toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'stale-writer' }],
    });
    expect(runner.current()?.frontier).toBe('source:winner');
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
    expect(runner.current()?.frontier).toBe('source:1');
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
