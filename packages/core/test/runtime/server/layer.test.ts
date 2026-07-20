import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import {
  architecture,
  getRequiredOperationRuntimeContext,
  layer,
  type LayerConcern,
  type LayerConcernRuntime,
  type OperationRequirement,
} from '../../../src/runtime/server/index.js';

type BookInput = {
  bookSlug: string;
};

const recordingConcern = (name: string, calls: string[]): LayerConcern<BookInput, unknown> => ({
  run: <TSuccess, TError>(
    runtime: LayerConcernRuntime<BookInput>,
    next: Effect.Effect<TSuccess, TError>,
  ) =>
    Effect.gen(function* () {
      calls.push(`${name}:before:${runtime.scope}:${runtime.input.bookSlug}`);
      const result = yield* next;
      calls.push(`${name}:after:${runtime.scope}:${runtime.input.bookSlug}`);
      return result;
    }),
});

const recordingRequirement = (name: string, calls: string[]): OperationRequirement<any> => ({
  run: input =>
    Effect.sync(() => {
      calls.push(`${name}:require:${input.bookSlug}`);
    }),
});

describe('server layer facade', () => {
  afterEach(() => {
    architecture({});
  });

  it('runs named effects with derived scope, input, extra, and composed concerns', async () => {
    const calls: string[] = [];
    architecture({
      layers: {
        features: {
          concerns: [recordingConcern('architecture', calls)],
        },
      },
    });

    const books = layer('features.books', {
      concerns: [recordingConcern('layer', calls)],
    });
    const readBook = books.effect(
      'readBook',
      (input: BookInput) =>
        Effect.sync(() => {
          const context = getRequiredOperationRuntimeContext();
          calls.push(`effect:${context.scope}:${input.bookSlug}`);

          return {
            extra: context.extra,
            input: context.input,
            scope: context.scope,
            telemetrySpanName: context.telemetrySpanName,
          };
        }),
      {
        extra: input => ({ source: 'test', slug: input.bookSlug }),
        telemetrySpanName: 'custom.readBook',
      },
    );

    await expect(readBook({ bookSlug: 'progbook' })).resolves.toEqual({
      extra: { source: 'test', slug: 'progbook' },
      input: { bookSlug: 'progbook' },
      scope: 'features.books.readBook',
      telemetrySpanName: 'custom.readBook',
    });
    expect(calls).toEqual([
      'architecture:before:features.books.readBook:progbook',
      'layer:before:features.books.readBook:progbook',
      'effect:features.books.readBook:progbook',
      'layer:after:features.books.readBook:progbook',
      'architecture:after:features.books.readBook:progbook',
    ]);
  });

  it('runs operations with architecture defaults before local requirements and concerns', async () => {
    const calls: string[] = [];
    architecture({
      layers: {
        features: {
          concerns: [recordingConcern('architecture', calls)],
          requires: [recordingRequirement('architecture', calls)],
        },
      },
    });

    const readBook = layer('features.books').operation(
      'readBook',
      (input: BookInput) =>
        Effect.sync(() => {
          calls.push(`effect:${input.bookSlug}`);
          return { title: 'Progbook' };
        }),
      {
        concerns: [recordingConcern('local', calls)],
        requires: [recordingRequirement('local', calls)],
      },
    );

    await expect(readBook({ bookSlug: 'progbook' })).resolves.toEqual({
      success: true,
      data: {
        title: 'Progbook',
      },
    });
    expect(readBook.metadata).toMatchObject({
      scope: 'features.books.readBook',
      defectPublicMessage: 'Failed to read book',
    });
    expect(calls).toEqual([
      'architecture:require:progbook',
      'local:require:progbook',
      'architecture:before:features.books.readBook:progbook',
      'local:before:features.books.readBook:progbook',
      'effect:progbook',
      'local:after:features.books.readBook:progbook',
      'architecture:after:features.books.readBook:progbook',
    ]);
  });
});
