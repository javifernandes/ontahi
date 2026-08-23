import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  getOrCreateServerContextResource,
  memoizeInServerContext,
  runServerEffect,
} from './index.js';

describe('server runtime context resources', () => {
  it('reuses an in-flight resource for repeated calls in the same context', async () => {
    const factory = vi.fn(async () => ({ value: 'bookops' }));

    const result = await runServerEffect(
      Effect.gen(function* () {
        const first = yield* Effect.promise(() =>
          getOrCreateServerContextResource('tests.resource', factory),
        );
        const second = yield* Effect.promise(() =>
          getOrCreateServerContextResource('tests.resource', factory),
        );

        return { first, second };
      }),
      {
        scope: 'tests.runtime.context.resources',
      },
    );

    expect(result).toEqual({
      first: { value: 'bookops' },
      second: { value: 'bookops' },
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('memoizes values by namespace and key within one runtime context', async () => {
    const run = vi.fn(async (input: { slug: string }) => ({ slug: input.slug }));
    const memoized = memoizeInServerContext({
      namespace: 'tests.books.shell',
      key: (input: { slug: string }) => input.slug,
      run,
    });

    const result = await runServerEffect(
      Effect.gen(function* () {
        const first = yield* Effect.promise(() => memoized({ slug: 'progbook' }));
        const second = yield* Effect.promise(() => memoized({ slug: 'progbook' }));
        const third = yield* Effect.promise(() => memoized({ slug: 'other-book' }));

        return { first, second, third };
      }),
      {
        scope: 'tests.runtime.context.memoize',
      },
    );

    expect(result).toEqual({
      first: { slug: 'progbook' },
      second: { slug: 'progbook' },
      third: { slug: 'other-book' },
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('shares inherited resources across nested runtime executions', async () => {
    const run = vi.fn(async (input: { slug: string }) => ({ slug: input.slug }));
    const memoized = memoizeInServerContext({
      namespace: 'tests.books.nested',
      key: (input: { slug: string }) => input.slug,
      run,
    });

    const result = await runServerEffect(
      Effect.gen(function* () {
        const outer = yield* Effect.promise(() => memoized({ slug: 'progbook' }));
        const inner = yield* Effect.promise(() =>
          runServerEffect(
            Effect.promise(() => memoized({ slug: 'progbook' })),
            {
              scope: 'tests.runtime.context.nested.inner',
            },
          ),
        );

        return { outer, inner };
      }),
      {
        scope: 'tests.runtime.context.nested.outer',
      },
    );

    expect(result).toEqual({
      outer: { slug: 'progbook' },
      inner: { slug: 'progbook' },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
