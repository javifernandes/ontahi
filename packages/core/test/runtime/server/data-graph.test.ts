import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  getCurrentDataGraphRuntime,
  getRequiredDataGraphRuntime,
  getRequiredDataGraphRuntimeEffect,
  architecture,
  layer,
  runServerEffect,
  withDataGraph,
} from '../../../src/runtime/server/index.js';

describe('server data-graph runtime concern', () => {
  it('returns no runtime when none is configured', () => {
    expect(getCurrentDataGraphRuntime()).toBeUndefined();
  });

  it('throws when the server context exists but no data graph runtime was configured', async () => {
    await expect(
      runServerEffect(
        Effect.sync(() => getRequiredDataGraphRuntime()),
        {
          scope: 'tests.runtime.data-graph',
        },
      ),
    ).rejects.toThrow('Data graph runtime is not configured in the current server context');
  });

  it('exposes the injected runtime through both direct and effect accessors', async () => {
    const runtime = { name: 'graph-runtime' };

    const result = await runServerEffect(
      Effect.gen(function* () {
        return {
          current: getCurrentDataGraphRuntime<typeof runtime>(),
          required: getRequiredDataGraphRuntime<typeof runtime>(),
          requiredEffect: yield* getRequiredDataGraphRuntimeEffect<typeof runtime>(),
        };
      }),
      {
        scope: 'tests.runtime.data-graph',
        concerns: [
          withDataGraph({
            createRuntime: () => runtime,
          }),
        ],
      },
    );

    expect(result).toEqual({
      current: runtime,
      required: runtime,
      requiredEffect: runtime,
    });
  });

  it('builds the runtime from the layer concern input', async () => {
    const result = await runServerEffect(
      Effect.sync(() => getRequiredDataGraphRuntime<{ key: string }>()),
      {
        scope: 'tests.runtime.data-graph',
        concernInput: { tenant: 'bookops' },
        concerns: [
          withDataGraph<{ tenant: string }, { key: string }>({
            createRuntime: runtime => ({
              key: `${runtime.scope}:${runtime.input.tenant}`,
            }),
          }),
        ],
      },
    );

    expect(result).toEqual({
      key: 'tests.runtime.data-graph:bookops',
    });
  });

  it('can inject a graph runtime into layer effects through architecture defaults', async () => {
    architecture({
      layers: {
        features: {
          concerns: [
            withDataGraph<{ tenant: string }, { key: string }>({
              createRuntime: runtime => ({
                key: `${runtime.scope}:${runtime.input.tenant}`,
              }),
            }),
          ],
        },
      },
    });

    try {
      const readRuntime = layer('features.books').effect(
        'readRuntime',
        (input: { tenant: string }) =>
          Effect.sync(() => ({
            input,
            runtime: getRequiredDataGraphRuntime<{ key: string }>(),
          })),
      );

      await expect(readRuntime({ tenant: 'bookops' })).resolves.toEqual({
        input: { tenant: 'bookops' },
        runtime: {
          key: 'features.books.readRuntime:bookops',
        },
      });
    } finally {
      architecture({});
    }
  });

  it('can inject a graph runtime into direct server effects through architecture defaults', async () => {
    architecture({
      layers: {
        tests: {
          concerns: [
            withDataGraph<unknown, { name: string }>({
              createRuntime: runtime => ({
                name: runtime.scope,
              }),
            }),
          ],
        },
      },
    });

    try {
      const result = await runServerEffect(
        Effect.sync(() => getRequiredDataGraphRuntime<{ name: string }>()),
        {
          scope: 'tests.runtime.data-graph.direct',
        },
      );

      expect(result).toEqual({
        name: 'tests.runtime.data-graph.direct',
      });
    } finally {
      architecture({});
    }
  });
});
