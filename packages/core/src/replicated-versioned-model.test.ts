import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  createReplicatedVersionedModelKernel,
  type ReplicatedVersionedModelAttempt,
  type ReplicatedVersionedModelResult,
} from './replicated-versioned-model.js';

type ProjectionState = {
  readonly records: readonly { readonly id: string; readonly title: string }[];
};

const rebuild = (
  overrides: Partial<
    Extract<ReplicatedVersionedModelAttempt<ProjectionState>, { mode: 'rebuild' }>
  > = {},
): ReplicatedVersionedModelAttempt<ProjectionState> => ({
  outcome: 'completed',
  mode: 'rebuild',
  materializerVersion: 'markdown-v1',
  sourceFrontier: 'git:1',
  acceptedFrontier: 'projection:1',
  state: { records: [{ id: 'plan-1', title: 'First' }] },
  ...overrides,
});

const incremental = (
  overrides: Partial<
    Extract<ReplicatedVersionedModelAttempt<ProjectionState>, { mode: 'incremental' }>
  > = {},
): ReplicatedVersionedModelAttempt<ProjectionState> => ({
  outcome: 'completed',
  mode: 'incremental',
  materializerVersion: 'markdown-v1',
  baseSourceFrontier: 'git:1',
  sourceFrontier: 'git:2',
  acceptedFrontier: 'projection:2',
  state: { records: [{ id: 'plan-1', title: 'Updated' }] },
  ...overrides,
});

describe('replicated versioned model kernel', () => {
  it('accepts a full rebuild and an exact incremental successor', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });

    expect(kernel.apply(rebuild())).toEqual({
      status: 'accepted',
      replayed: false,
      snapshot: {
        acceptance: {
          derivationId: 'atlas-markdown-projection',
          materializerVersion: 'markdown-v1',
          sourceFrontier: 'git:1',
          acceptedFrontier: 'projection:1',
        },
        state: { records: [{ id: 'plan-1', title: 'First' }] },
      },
    });

    expect(kernel.apply(incremental())).toEqual({
      status: 'accepted',
      replayed: false,
      snapshot: {
        acceptance: {
          derivationId: 'atlas-markdown-projection',
          materializerVersion: 'markdown-v1',
          sourceFrontier: 'git:2',
          acceptedFrontier: 'projection:2',
        },
        state: { records: [{ id: 'plan-1', title: 'Updated' }] },
      },
    });
  });

  it('treats exact delivery replay as idempotent and preserves detached state', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });
    const state = { records: [{ id: 'plan-1', title: 'First' }] };
    const attempt = rebuild({ state });

    kernel.apply(attempt);
    state.records[0]!.title = 'Mutated by caller';

    expect(kernel.apply(attempt)).toEqual({
      status: 'accepted',
      replayed: true,
      snapshot: {
        acceptance: {
          derivationId: 'atlas-markdown-projection',
          materializerVersion: 'markdown-v1',
          sourceFrontier: 'git:1',
          acceptedFrontier: 'projection:1',
        },
        state: { records: [{ id: 'plan-1', title: 'First' }] },
      },
    });
  });

  it('requires a rebuild when incremental execution has no baseline or skips a source frontier', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });

    expect(kernel.apply(incremental())).toEqual({
      status: 'rebuild-required',
      reason: 'missing-accepted-frontier',
      accepted: null,
    });

    kernel.apply(rebuild());

    expect(kernel.apply(incremental({ baseSourceFrontier: 'git:0' }))).toMatchObject({
      status: 'rebuild-required',
      reason: 'source-frontier-gap',
    });
    expect(kernel.current()?.acceptance.sourceFrontier).toBe('git:1');
  });

  it('requires a full rebuild before changing Materializer versions', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });
    kernel.apply(rebuild());

    expect(kernel.apply(incremental({ materializerVersion: 'markdown-v2' }))).toMatchObject({
      status: 'rebuild-required',
      reason: 'materializer-version-changed',
    });

    expect(
      kernel.apply(
        rebuild({
          materializerVersion: 'markdown-v2',
          sourceFrontier: 'git:2',
          acceptedFrontier: 'projection:2-v2',
        }),
      ),
    ).toMatchObject({ status: 'accepted', replayed: false });
  });

  it('rejects conflicting output identity at the same source frontier', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });
    kernel.apply(rebuild());

    expect(kernel.apply(rebuild({ acceptedFrontier: 'projection:unexpected' }))).toMatchObject({
      status: 'rejected',
      reason: 'frontier-conflict',
    });
    expect(kernel.current()?.acceptance.acceptedFrontier).toBe('projection:1');
  });

  it('does not advance accepted state after a failed derivation', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });
    kernel.apply(rebuild());
    const failure = new Error('parser failed');

    expect(
      kernel.apply({
        outcome: 'failed',
        mode: 'incremental',
        materializerVersion: 'markdown-v1',
        baseSourceFrontier: 'git:1',
        sourceFrontier: 'git:2',
        failure,
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'materialization-failed',
      failure,
      accepted: {
        derivationId: 'atlas-markdown-projection',
        materializerVersion: 'markdown-v1',
        sourceFrontier: 'git:1',
        acceptedFrontier: 'projection:1',
      },
    });
    expect(kernel.current()?.acceptance.sourceFrontier).toBe('git:1');
  });

  it('preserves the public result union', () => {
    const kernel = createReplicatedVersionedModelKernel<ProjectionState>({
      derivationId: 'atlas-markdown-projection',
    });

    expectTypeOf(kernel.apply(rebuild())).toEqualTypeOf<
      ReplicatedVersionedModelResult<ProjectionState>
    >();
  });
});
