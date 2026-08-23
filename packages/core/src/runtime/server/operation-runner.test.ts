import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { createOperationRunner } from './operation/runner.js';
import type { OperationResult } from './operation/types.js';

import {
  runServerEffect,
  type LayerConcern,
  type LayerConcernRuntime,
  type runServerOperation,
  type OperationFailure,
} from './index.js';

type BookInput = {
  bookSlug: string;
};

type BookResult = {
  title: string;
};

const bookRef = (bookSlug: string) => ({
  entity: 'Book',
  kind: 'bySlug',
  id: [bookSlug],
});

type RunOperationEffect = typeof runServerOperation;

const createRunOperationEffect = () =>
  vi.fn(
    async <TSuccess, TError>(
      effect: Effect.Effect<TSuccess, TError>,
      options: {
        scope: string;
        telemetrySpanName?: string;
        defectLogMessage: string;
        defectPublicMessage?: string;
        extra?: Record<string, unknown>;
      },
    ): Promise<OperationResult<Record<string, unknown>, OperationFailure>> => {
      const result = await Effect.runPromise(
        effect as Effect.Effect<Record<string, unknown>, TError>,
      );
      return {
        success: true,
        ...result,
        observedScope: options.scope,
      } as OperationResult<Record<string, unknown>, OperationFailure>;
    },
  ) as unknown as RunOperationEffect & ReturnType<typeof vi.fn>;

describe('createOperationRunner', () => {
  it('stores metadata and runs requirements, concerns, and effects in order', async () => {
    const calls: string[] = [];
    const requirement = {
      run: vi.fn((input: BookInput) =>
        Effect.sync(() => {
          calls.push(`require:${input.bookSlug}`);
        }),
      ),
    };
    const concern: LayerConcern<BookInput, unknown> = {
      run: <TSuccess, TNextError>(
        _runtime: LayerConcernRuntime<BookInput>,
        next: Effect.Effect<TSuccess, TNextError>,
      ) =>
        Effect.gen(function* () {
          calls.push('concern:before');
          const result = yield* next;
          calls.push('concern:after');
          return result;
        }),
    };
    const runOperationEffect = createRunOperationEffect();
    const runner = createOperationRunner<BookInput, BookResult, OperationFailure>(
      input =>
        Effect.sync(() => {
          calls.push(`effect:${input.bookSlug}`);
          return { title: 'Progbook' };
        }),
      {
        scope: 'features.books.fetchBook',
        telemetrySpanName: 'custom.telemetry',
        extra: input => ({ bookSlug: input.bookSlug, source: 'test' }),
        requires: [requirement],
        concerns: [concern],
      },
      runOperationEffect,
    );

    await expect(runner({ bookSlug: 'progbook' })).resolves.toEqual({
      success: true,
      title: 'Progbook',
      observedScope: 'features.books.fetchBook',
    });
    expect(runner.metadata).toMatchObject({
      scope: 'features.books.fetchBook',
      telemetrySpanName: 'custom.telemetry',
      defectLogMessage: 'Unexpected failure in features.books.fetchBook',
      defectPublicMessage: 'Failed to load book',
    });
    expect(calls).toEqual([
      'require:progbook',
      'concern:before',
      'effect:progbook',
      'concern:after',
    ]);
    expect(runOperationEffect).toHaveBeenCalledWith(expect.anything(), {
      scope: 'features.books.fetchBook',
      telemetrySpanName: 'custom.telemetry',
      defectLogMessage: 'Unexpected failure in features.books.fetchBook',
      defectPublicMessage: 'Failed to load book',
      extra: { bookSlug: 'progbook', source: 'test' },
    });
  });

  it('deduplicates cached operation executions within a parent runtime context', async () => {
    const effect = vi.fn((input: BookInput) => Effect.succeed({ title: input.bookSlug }));
    const runOperationEffect = createRunOperationEffect();
    const runner = createOperationRunner<BookInput, BookResult, OperationFailure>(
      effect,
      {
        scope: 'features.books.fetchBook',
        cache: {
          value: input => bookRef(input.bookSlug),
        },
      },
      runOperationEffect,
    );

    const result = await runServerEffect(
      Effect.promise(async () => {
        const first = await runner({ bookSlug: 'progbook' });
        const second = await runner({ bookSlug: 'progbook' });
        return { first, second };
      }),
      {
        scope: 'tests.operation.runner.cache',
      },
    );

    expect(result).toEqual({
      first: {
        success: true,
        title: 'progbook',
        observedScope: 'features.books.fetchBook',
      },
      second: {
        success: true,
        title: 'progbook',
        observedScope: 'features.books.fetchBook',
      },
    });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(runOperationEffect).toHaveBeenCalledTimes(1);
  });

  it('removes failed cached entries so later attempts can retry', async () => {
    const runOperationEffect = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        reason: 'not_found',
        message: 'Book missing.',
        error: 'Book missing.',
        errorType: 'not_found',
      })
      .mockResolvedValueOnce({
        success: true,
        title: 'Progbook',
      });
    const runner = createOperationRunner<BookInput, BookResult, OperationFailure>(
      input => Effect.succeed({ title: input.bookSlug }),
      {
        scope: 'features.books.fetchBook',
        cache: {
          value: input => bookRef(input.bookSlug),
        },
      },
      runOperationEffect,
    );

    const result = await runServerEffect(
      Effect.promise(async () => {
        const first = await runner({ bookSlug: 'progbook' });
        const second = await runner({ bookSlug: 'progbook' });
        return { first, second };
      }),
      {
        scope: 'tests.operation.runner.failed-cache',
      },
    );

    expect(result).toEqual({
      first: {
        success: false,
        reason: 'not_found',
        message: 'Book missing.',
        error: 'Book missing.',
        errorType: 'not_found',
      },
      second: {
        success: true,
        title: 'Progbook',
      },
    });
    expect(runOperationEffect).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached entries when a successful operation affects their value refs', async () => {
    const readEffect = vi.fn((input: BookInput) => Effect.succeed({ title: input.bookSlug }));
    const runReadOperationEffect = createRunOperationEffect();
    const readBook = createOperationRunner<BookInput, BookResult, OperationFailure>(
      readEffect,
      {
        scope: 'features.books.fetchBook',
        cache: {
          value: input => bookRef(input.bookSlug),
        },
      },
      runReadOperationEffect,
    );
    const updateBook = createOperationRunner<BookInput, { updated: true }, OperationFailure>(
      () => Effect.succeed({ updated: true }),
      {
        scope: 'features.books.updateBook',
        effects: {
          affects: ({ input }) => [bookRef(input.bookSlug)],
        },
      },
      createRunOperationEffect(),
    );

    await runServerEffect(
      Effect.promise(async () => {
        await readBook({ bookSlug: 'progbook' });
        await readBook({ bookSlug: 'progbook' });
        await updateBook({ bookSlug: 'progbook' });
        await readBook({ bookSlug: 'progbook' });
      }),
      {
        scope: 'tests.operation.runner.invalidate-cache',
      },
    );

    expect(readEffect).toHaveBeenCalledTimes(2);
    expect(runReadOperationEffect).toHaveBeenCalledTimes(2);
  });
});
