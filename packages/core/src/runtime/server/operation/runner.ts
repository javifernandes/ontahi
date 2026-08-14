import { Effect } from 'effect';

import { toContractConcern } from '../concerns/contract.js';
import { applyLayerConcerns, combineConcerns } from '../concerns.js';
import type { OperationRuntimeContext } from '../context-types.js';
import {
  getOperationRuntimeContext,
  operationRuntimeContextStorage,
  toContextRecord,
} from '../context.js';
import type { UnwrapEffectSuccess } from '../effect-intents/types.js';
import { getCurrentInvocationContext } from '../invocation-context.js';
import { getDefaultDefectLogMessage, getDefaultDefectPublicMessage } from '../scope.js';

import {
  buildOperationCacheEntryKey,
  deleteOperationCacheEntry,
  getRuntimeOperationCacheStore,
  invalidateOperationCacheRefs,
  registerOperationCacheEntry,
} from './cache.js';
import type { OperationOptions, OperationRunner } from './options-types.js';
import type { OperationInput } from './requirement-types.js';
import type { runServerOperation } from './run.js';
import type {
  OperationFailure,
  OperationResult,
  OperationRuntimeError,
  SuccessResult,
} from './types.js';

type RunServerOperationFn = typeof runServerOperation;

export const createOperationRunner = <
  TInput extends OperationInput,
  TRawSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError = never,
>(
  effect: (input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>,
  options: OperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
  runOperationEffect: RunServerOperationFn,
): OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError> => {
  const metadata: OperationRunner<
    TInput,
    UnwrapEffectSuccess<TRawSuccess>,
    TFailure,
    TInfraError
  >['metadata'] = {
    scope: options.scope,
    defectLogMessage: options.defectLogMessage ?? getDefaultDefectLogMessage(options.scope),
    defectPublicMessage:
      options.defectPublicMessage ?? getDefaultDefectPublicMessage(options.scope),
    extra: options.extra,
    telemetrySpanName: options.telemetrySpanName ?? options.scope,
    requires: options.requires,
    concerns: options.concerns,
    contracts: options.contracts,
    cache: options.cache,
    effects: options.effects,
  };

  const runner = async (
    input: TInput,
  ): Promise<OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>> => {
    const inputRecord = toContextRecord(input);
    const extra = metadata.extra ? metadata.extra(input) : inputRecord;
    const parentContext = getOperationRuntimeContext();
    const invocationContext = getCurrentInvocationContext();
    const context: OperationRuntimeContext = {
      scope: metadata.scope,
      telemetrySpanName: metadata.telemetrySpanName,
      input: inputRecord,
      extra,
      resources: parentContext?.resources ?? invocationContext?.resources ?? new Map(),
    };
    const contractConcern = toContractConcern<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>(
      metadata.contracts,
    );
    const concerns = combineConcerns(
      contractConcern ? [contractConcern] : undefined,
      metadata.concerns,
    );
    const bodyEffect = Effect.suspend(() =>
      applyLayerConcerns(
        {
          scope: context.scope,
          telemetrySpanName: context.telemetrySpanName,
          input,
          inputRecord,
          extra,
          resources: context.resources,
        },
        concerns,
        effect(input),
      ),
    );
    const guardedEffect =
      metadata.requires && metadata.requires.length > 0
        ? Effect.forEach(metadata.requires, requirement => requirement.run(input), {
            concurrency: 1,
            discard: true,
          }).pipe(Effect.flatMap(() => bodyEffect))
        : bodyEffect;

    return operationRuntimeContextStorage.run(context, async () => {
      const runCurrentOperation = () =>
        runOperationEffect(guardedEffect, {
          scope: metadata.scope,
          telemetrySpanName: metadata.telemetrySpanName,
          defectLogMessage: metadata.defectLogMessage,
          defectPublicMessage: metadata.defectPublicMessage,
          extra,
        });

      const cacheRefs = [
        ...(metadata.cache?.value ? [metadata.cache.value(input)] : []),
        ...(metadata.cache?.dependsOn ? metadata.cache.dependsOn(input) : []),
      ];
      const hasCacheRefs = cacheRefs.length > 0;
      const cacheStore = getRuntimeOperationCacheStore(context.resources);

      const result = hasCacheRefs
        ? await (() => {
            const entryKey = buildOperationCacheEntryKey(metadata.scope, inputRecord);
            const cached = cacheStore.entries.get(entryKey);

            if (cached) {
              return cached as Promise<OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>>;
            }

            const created = runCurrentOperation()
              .then(result => {
                if (!result.success) {
                  deleteOperationCacheEntry(cacheStore, entryKey);
                }

                return result;
              })
              .catch(error => {
                deleteOperationCacheEntry(cacheStore, entryKey);
                throw error;
              });

            cacheStore.entries.set(
              entryKey,
              created as Promise<OperationResult<Record<string, unknown> | void, OperationFailure>>,
            );
            registerOperationCacheEntry(cacheStore, entryKey, cacheRefs);

            return created;
          })()
        : await runCurrentOperation();

      if (result.success && metadata.effects?.affects) {
        invalidateOperationCacheRefs(
          cacheStore,
          metadata.effects.affects({
            input,
            result: result as SuccessResult<UnwrapEffectSuccess<TRawSuccess>>,
          }),
        );
      }

      return result;
    });
  };

  return Object.assign(runner, {
    effect: effect as OperationRunner<
      TInput,
      UnwrapEffectSuccess<TRawSuccess>,
      TFailure,
      TInfraError
    >['effect'],
    metadata,
  });
};
