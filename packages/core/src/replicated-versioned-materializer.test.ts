import { describe, expect, it, vi } from 'vitest';

import {
  createReplicatedVersionedMaterializerRunner,
  type Materializer,
  type MaterializerDependency,
} from './replicated-versioned-materializer.js';

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

  it('requires rebuild without invoking derive when dependency evidence is unknown', async () => {
    const derive = vi.fn(materializer().derive);
    const runner = createReplicatedVersionedMaterializerRunner({
      ...materializer(),
      affectedBy: () => ({ status: 'unknown', reason: 'cross-record reference unresolved' }),
      derive,
    });

    const result = await runner.run({
      mode: 'incremental',
      input: { titles: {} },
      delta: { inputs: ['missing'] },
      baseSourceFrontier: 'git:1',
      sourceFrontier: 'git:2',
    });

    expect(result).toEqual({
      result: { status: 'rebuild-required', reason: 'unknown-dependency', accepted: null },
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
