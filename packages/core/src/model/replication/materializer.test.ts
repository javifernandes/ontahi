import { describe, expect, it, vi } from 'vitest';

import {
  createReplicatedVersionedMaterializerRunner,
  type Materializer,
  type MaterializerDependency,
} from './materializer.js';

type Input = { readonly titles: Readonly<Record<string, string>> };
type Delta = { readonly inputs: readonly string[] };
type State = { readonly titles: Readonly<Record<string, string>> };
type Artifact = { readonly output: string; readonly title: string };
type Change = { readonly output: string; readonly operation: 'set' };

const dependenciesFor = (input: Input): readonly MaterializerDependency[] =>
  Object.keys(input.titles).map(key => ({ input: key, outputs: [key] }));

const materializer = (): Materializer<Input, Delta, State, Artifact, Change> => ({
  id: 'markdown-titles',
  version: 'v1',
  affectedBy: (delta, dependencies) => ({
    status: 'known',
    outputs: dependencies
      .filter(dependency => delta.inputs.includes(dependency.input))
      .flatMap(dependency => dependency.outputs),
  }),
  derive: async (input, context) => {
    const outputs = context.affectedOutputs ?? Object.keys(input.titles);
    return {
      acceptedFrontier: `titles:${context.sourceFrontier}`,
      state: { titles: input.titles },
      artifacts: outputs.map(output => ({ output, title: input.titles[output] ?? '' })),
      changes: outputs.map(output => ({ output, operation: 'set' as const })),
      dependencies: dependenciesFor(input),
      diagnostics: [],
    };
  },
});

describe('replicated versioned Materializer runner', () => {
  it('derives a full model and only the affected output for an incremental successor', async () => {
    const derive = vi.fn(materializer().derive);
    const runner = createReplicatedVersionedMaterializerRunner({
      ...materializer(),
      derive,
    });

    await expect(
      runner.run({
        mode: 'rebuild',
        input: { titles: { plan: 'Plan', item: 'Item' } },
        sourceFrontier: 'git:1',
      }),
    ).resolves.toMatchObject({ result: { status: 'accepted' } });

    const incremental = await runner.run({
      mode: 'incremental',
      input: { titles: { plan: 'Updated plan', item: 'Item' } },
      delta: { inputs: ['plan'] },
      baseSourceFrontier: 'git:1',
      sourceFrontier: 'git:2',
    });

    expect(incremental).toMatchObject({
      result: { status: 'accepted' },
      output: {
        artifacts: [{ output: 'plan', title: 'Updated plan' }],
        changes: [{ output: 'plan', operation: 'set' }],
      },
    });
    expect(derive.mock.calls[1]?.[1].affectedOutputs).toEqual(['plan']);
  });

  it('supports one changed input affecting multiple outputs', async () => {
    const base = materializer();
    const runner = createReplicatedVersionedMaterializerRunner<
      Input,
      Delta,
      State,
      Artifact,
      Change
    >({
      ...base,
      affectedBy: delta =>
        delta.inputs.includes('shared')
          ? { status: 'known', outputs: ['chapter-1', 'chapter-2'] }
          : { status: 'known', outputs: [] },
    });

    await runner.run({
      mode: 'rebuild',
      input: { titles: { 'chapter-1': 'One', 'chapter-2': 'Two' } },
      sourceFrontier: 'git:1',
    });
    const result = await runner.run({
      mode: 'incremental',
      input: { titles: { 'chapter-1': 'One', 'chapter-2': 'Two' } },
      delta: { inputs: ['shared'] },
      baseSourceFrontier: 'git:1',
      sourceFrontier: 'git:2',
    });

    expect(result.output?.artifacts.map(artifact => artifact.output)).toEqual([
      'chapter-1',
      'chapter-2',
    ]);
  });

  it('continues incrementally from a detached hydrated snapshot and dependency index', async () => {
    const initial = {
      snapshot: {
        acceptance: {
          derivationId: 'markdown-titles',
          materializerVersion: 'v1',
          sourceFrontier: 'git:1',
          acceptedFrontier: 'titles:git:1',
        },
        state: { titles: { plan: 'Plan', item: 'Item' } },
      },
      dependencies: [
        { input: 'plan', outputs: ['plan'] },
        { input: 'item', outputs: ['item'] },
      ],
    };
    const derive = vi.fn(materializer().derive);
    const runner = createReplicatedVersionedMaterializerRunner(
      { ...materializer(), derive },
      { initial },
    );

    initial.snapshot.state.titles.plan = 'Mutated by caller';
    initial.dependencies[0]!.outputs.push('item');

    const result = await runner.run({
      mode: 'incremental',
      input: { titles: { plan: 'Updated plan', item: 'Item' } },
      delta: { inputs: ['plan'] },
      baseSourceFrontier: 'git:1',
      sourceFrontier: 'git:2',
    });

    expect(result).toMatchObject({
      result: { status: 'accepted' },
      output: { artifacts: [{ output: 'plan', title: 'Updated plan' }] },
    });
    expect(derive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        affectedOutputs: ['plan'],
        previous: {
          acceptance: expect.objectContaining({ sourceFrontier: 'git:1' }),
          state: { titles: { plan: 'Plan', item: 'Item' } },
        },
      }),
    );
  });

  it('preserves exact incremental replay after hydration', async () => {
    const runner = createReplicatedVersionedMaterializerRunner(materializer(), {
      initial: {
        snapshot: {
          acceptance: {
            derivationId: 'markdown-titles',
            materializerVersion: 'v1',
            sourceFrontier: 'git:2',
            acceptedFrontier: 'titles:git:2',
          },
          state: { titles: { plan: 'Updated plan' } },
        },
        dependencies: [{ input: 'plan', outputs: ['plan'] }],
      },
    });

    await expect(
      runner.run({
        mode: 'incremental',
        input: { titles: { plan: 'Updated plan' } },
        delta: { inputs: ['plan'] },
        baseSourceFrontier: 'git:1',
        sourceFrontier: 'git:2',
      }),
    ).resolves.toMatchObject({ result: { status: 'accepted', replayed: true } });
  });

  it.each([
    {
      name: 'the Materializer version changed',
      materializerVersion: 'v0',
      baseSourceFrontier: 'git:1',
      reason: 'materializer-version-changed',
    },
    {
      name: 'the source frontier has a gap',
      materializerVersion: 'v1',
      baseSourceFrontier: 'git:0',
      reason: 'source-frontier-gap',
    },
  ])('requires rebuild before derive when $name', async testCase => {
    const derive = vi.fn(materializer().derive);
    const runner = createReplicatedVersionedMaterializerRunner(
      { ...materializer(), derive },
      {
        initial: {
          snapshot: {
            acceptance: {
              derivationId: 'markdown-titles',
              materializerVersion: testCase.materializerVersion,
              sourceFrontier: 'git:1',
              acceptedFrontier: 'titles:git:1',
            },
            state: { titles: { plan: 'Plan' } },
          },
          dependencies: [{ input: 'plan', outputs: ['plan'] }],
        },
      },
    );

    await expect(
      runner.run({
        mode: 'incremental',
        input: { titles: { plan: 'Updated' } },
        delta: { inputs: ['plan'] },
        baseSourceFrontier: testCase.baseSourceFrontier,
        sourceFrontier: 'git:2',
      }),
    ).resolves.toMatchObject({
      result: { status: 'rebuild-required', reason: testCase.reason },
      output: null,
    });
    expect(derive).not.toHaveBeenCalled();
  });

  it('requires rebuild without invoking derive when dependency evidence is unknown', async () => {
    const derive = vi.fn(materializer().derive);
    const runner = createReplicatedVersionedMaterializerRunner({
      ...materializer(),
      affectedBy: () => ({ status: 'unknown', reason: 'cross-record reference unresolved' }),
      derive,
    });

    await runner.run({
      mode: 'rebuild',
      input: { titles: { plan: 'Plan' } },
      sourceFrontier: 'git:1',
    });
    derive.mockClear();

    const result = await runner.run({
      mode: 'incremental',
      input: { titles: {} },
      delta: { inputs: ['missing'] },
      baseSourceFrontier: 'git:1',
      sourceFrontier: 'git:2',
    });

    expect(result).toEqual({
      result: {
        status: 'rebuild-required',
        reason: 'unknown-dependency',
        accepted: {
          derivationId: 'markdown-titles',
          materializerVersion: 'v1',
          sourceFrontier: 'git:1',
          acceptedFrontier: 'titles:git:1',
        },
      },
      output: null,
    });
    expect(derive).not.toHaveBeenCalled();
  });

  it('retains dependency evidence only after kernel acceptance', async () => {
    const runner = createReplicatedVersionedMaterializerRunner(materializer());
    await runner.run({
      mode: 'rebuild',
      input: { titles: { plan: 'Plan' } },
      sourceFrontier: 'git:1',
    });

    await runner.run({
      mode: 'incremental',
      input: { titles: { other: 'Other' } },
      delta: { inputs: ['plan'] },
      baseSourceFrontier: 'git:0',
      sourceFrontier: 'git:2',
    });

    expect(runner.dependencies()).toEqual([{ input: 'plan', outputs: ['plan'] }]);
    expect(runner.current()?.acceptance.sourceFrontier).toBe('git:1');
  });
});
