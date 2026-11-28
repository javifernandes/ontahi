import { Effect } from 'effect';

import type { DataGraphTransactionCapability } from './transaction.js';

export type EntityPublicationBatch<TError, TRequirements = never> = {
  readonly remove: Effect.Effect<unknown, TError, TRequirements>;
  readonly put: Effect.Effect<unknown, TError, TRequirements>;
};

/** Applies prepared batches in an already active, guarded publication transaction. */
export const applyEntityPublicationBatches = <TError, TRequirements>(
  batches: readonly EntityPublicationBatch<TError, TRequirements>[],
) =>
  Effect.gen(function* () {
    for (const batch of [...batches].reverse()) yield* batch.remove;
    for (const batch of batches) yield* batch.put;
  });

/** Claims the revision, prepares diffs and applies them using the same transaction runtime. */
export const applyEntityPublicationDiff = <TRuntime, TTransactionError, TWorkError, TRequirements>(
  storage: DataGraphTransactionCapability<TRuntime, TTransactionError>,
  input: {
    /** Atomically compare and advance the expected revision. False must leave it unchanged. */
    readonly claim: (runtime: TRuntime) => Effect.Effect<boolean, TWorkError, TRequirements>;
    /** Prepare batches in dependency order, from parents to dependents. */
    readonly prepare: (
      runtime: TRuntime,
    ) => Effect.Effect<
      readonly EntityPublicationBatch<TWorkError, TRequirements>[],
      TWorkError,
      TRequirements
    >;
  },
) =>
  storage.transaction(runtime =>
    Effect.gen(function* () {
      if (!(yield* input.claim(runtime))) return { status: 'conflict' } as const;

      const batches = yield* input.prepare(runtime);
      yield* applyEntityPublicationBatches(batches);

      return { status: 'published' } as const;
    }),
  );
