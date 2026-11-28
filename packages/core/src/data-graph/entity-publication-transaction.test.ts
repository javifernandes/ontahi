import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { applyEntityPublicationDiff } from './entity-publication-transaction.js';
import type { DataGraphTransactionCapability } from './transaction.js';

const publicationFixture = () => {
  const steps: string[] = [];
  const record = (step: string) => Effect.sync(() => steps.push(step));
  const runtime = { record };
  const storage: DataGraphTransactionCapability<typeof runtime, never> = {
    transaction: work => work(runtime),
  };
  return { steps, record, runtime, storage };
};

describe('applyEntityPublicationDiff', () => {
  it('claims and prepares on the transaction runtime before applying dependency-ordered writes', async () => {
    const { steps, record, runtime, storage } = publicationFixture();
    const result = await Effect.runPromise(
      applyEntityPublicationDiff(storage, {
        claim: active => {
          expect(active).toBe(runtime);
          return record('claim').pipe(Effect.as(true));
        },
        prepare: active => {
          expect(active).toBe(runtime);
          return record('prepare').pipe(
            Effect.as([
              { remove: record('remove parent'), put: record('put parent') },
              { remove: record('remove child'), put: record('put child') },
            ]),
          );
        },
      }),
    );

    expect(result).toEqual({ status: 'published' });
    expect(steps).toEqual([
      'claim',
      'prepare',
      'remove child',
      'remove parent',
      'put parent',
      'put child',
    ]);
  });

  it('leaves preparation and writes untouched when the revision claim loses', async () => {
    const { steps, record, storage } = publicationFixture();
    const result = await Effect.runPromise(
      applyEntityPublicationDiff(storage, {
        claim: () => record('claim').pipe(Effect.as(false)),
        prepare: () => record('prepare').pipe(Effect.as([])),
      }),
    );

    expect(result).toEqual({ status: 'conflict' });
    expect(steps).toEqual(['claim']);
  });

  it('propagates a failed batch and skips later writes', async () => {
    const { steps, record, storage } = publicationFixture();
    const failure = new Error('parent write failed');
    const result = await Effect.runPromise(
      Effect.flip(
        applyEntityPublicationDiff(storage, {
          claim: () => Effect.succeed(true),
          prepare: () =>
            Effect.succeed([
              { remove: record('remove parent'), put: Effect.fail(failure) },
              { remove: record('remove child'), put: record('put child') },
            ]),
        }),
      ),
    );

    expect(result).toBe(failure);
    expect(steps).toEqual(['remove child', 'remove parent']);
  });
});
