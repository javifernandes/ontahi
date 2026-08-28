import { Effect } from 'effect';

import { evaluatePortableOperationCondition } from '../../../data-graph/model-expression/index.js';
import { isOpaqueContractConcern } from '../concerns/contract.js';
import { applyLayerConcerns } from '../concerns.js';
import type { OperationRuntimeContext } from '../context-types.js';
import {
  getOperationRuntimeContext,
  operationRuntimeContextStorage,
  toContextRecord,
} from '../context.js';
import { withAtomicDataGraphExecution } from '../data-graph.js';
import type { UnwrapEffectSuccess } from '../effect-intents/types.js';
import { createOperationFailure } from '../failures.js';
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
    conditions: options.conditions,
    execution: options.execution,
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
    const concernRuntime = {
      scope: context.scope,
      telemetrySpanName: context.telemetrySpanName,
      input,
      inputRecord,
      extra,
      resources: context.resources,
    };
    const requirementsEffect =
      metadata.requires && metadata.requires.length > 0
        ? Effect.forEach(metadata.requires, requirement => requirement.run(input), {
            concurrency: 1,
            discard: true,
          })
        : Effect.void;
    const conditionsEffect = metadata.conditions?.pre.length
      ? Effect.forEach(
          metadata.conditions.pre,
          condition =>
            Effect.suspend(() => {
              const evaluation = evaluatePortableOperationCondition(condition, inputRecord ?? {});
              if (evaluation.status === 'satisfied') return Effect.void;
              if (evaluation.status === 'rejected') {
                return Effect.fail(
                  createOperationFailure(
                    evaluation.rejection.reason,
                    evaluation.rejection.message,
                    { conditionId: condition.id },
                  ),
                );
              }
              return Effect.fail(
                createOperationFailure(
                  'operation_condition_unknown',
                  `Operation condition "${condition.name}" could not be evaluated authoritatively.`,
                  { conditionId: condition.id, missing: evaluation.missing },
                ),
              );
            }),
          { concurrency: 1, discard: true },
        )
      : Effect.void;
    const opaqueContractConcerns = metadata.concerns?.filter(isOpaqueContractConcern);
    const otherConcerns = metadata.concerns?.filter(concern => !isOpaqueContractConcern(concern));
    const isAtomic = metadata.execution?.atomicity === 'required';
    const guardedEffect = isAtomic
      ? Effect.suspend(() => {
          const bodyEffect = Effect.suspend(() => effect(input));
          const contractedBody = applyLayerConcerns(
            concernRuntime,
            opaqueContractConcerns,
            bodyEffect,
          );
          const operationEffect = requirementsEffect.pipe(
            Effect.flatMap(() => conditionsEffect),
            Effect.flatMap(() => contractedBody),
          );
          const atomicEffect = applyLayerConcerns(
            concernRuntime,
            [withAtomicDataGraphExecution()],
            operationEffect,
          );
          return applyLayerConcerns(concernRuntime, otherConcerns, atomicEffect);
        })
      : (() => {
          const bodyEffect = Effect.suspend(() => effect(input));
          const concernedBody = applyLayerConcerns(concernRuntime, otherConcerns, bodyEffect);
          const contractedBody = applyLayerConcerns(
            concernRuntime,
            opaqueContractConcerns,
            concernedBody,
          );
          return requirementsEffect.pipe(
            Effect.flatMap(() => conditionsEffect),
            Effect.flatMap(() => contractedBody),
          );
        })();

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
