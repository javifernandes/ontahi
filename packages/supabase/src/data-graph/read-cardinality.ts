import type { QuerySpec } from '@ontahi/core/data-graph';
import { Effect } from 'effect';

import type { SupabaseErrorFactory } from './types.js';

export const validateReadLimit = <TError>(
  spec: QuerySpec,
  createError: SupabaseErrorFactory<TError>,
) =>
  spec.cardinality === 'one' && spec.limit === 0
    ? Effect.fail(
        createError({
          message: 'Exact-one reads cannot use limit(0).',
          logMessage: `Invalid exact-one read for ${spec.root.name}`,
          cause: 'invalid_read_limit',
        }),
      )
    : Effect.void;

export const validateReadCardinality = <TError>(
  spec: QuerySpec,
  count: number | null,
  createError: SupabaseErrorFactory<TError>,
) => {
  if (spec.cardinality !== 'one') return Effect.void;
  if (count === null || !Number.isSafeInteger(count) || count < 0) {
    return Effect.fail(
      createError({
        message: `Cannot verify exact-one ${spec.root.name}: exact count is unavailable`,
        logMessage: `Missing exact count for ${spec.root.name}`,
        cause: 'selection_cardinality_unavailable',
      }),
    );
  }
  return count === 1
    ? Effect.void
    : Effect.fail(
        createError({
          message: `Expected exactly one ${spec.root.name}, received ${count}`,
          logMessage: `Data graph selection cardinality mismatch for ${spec.root.name}`,
          cause: 'selection_cardinality_mismatch',
        }),
      );
};
