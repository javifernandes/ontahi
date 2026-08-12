import { Effect } from 'effect';

import { getArchitecture, resolveArchitectureLayerDefaults } from './architecture-registry.js';
import { combineConcerns } from './concerns.js';
import { deriveArgsInputRecord } from './context.js';
import type { EffectSuccessPayload, UnwrapEffectSuccess } from './effect-intents/types.js';
import type { LayerEffectOptions, LayerOptions } from './layer-types.js';
import type {
  LayerOperationOptions,
  OperationOptions,
  OperationRunner,
} from './operation/options-types.js';
import type { OperationInput } from './operation/requirement-types.js';
import { runServerOperation } from './operation/run.js';
import { createOperationRunner } from './operation/runner.js';
import type {
  OperationFailure,
  OperationResult,
  OperationRuntimeError,
} from './operation/types.js';
import { combineRequirements } from './requirements.js';
import { runServerEffect } from './runtime-effect.js';
import { getDefaultDefectPublicMessage, getLayerScope } from './scope.js';

const createLayerOperationRunner = <
  TInput extends OperationInput,
  TRawSuccess,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError = never,
>(
  effect: (input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>,
  options: OperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
): OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError> =>
  createOperationRunner<TInput, TRawSuccess, TFailure, TInfraError>(
    effect,
    options,
    runServerOperation,
  );

export function layer(prefix: string, layerOptions?: LayerOptions) {
  function effect<TArgs extends unknown[], TValue, TError = unknown>(
    fn: (...args: TArgs) => Effect.Effect<TValue | EffectSuccessPayload<TValue>, TError>,
    options?: LayerEffectOptions<TArgs>,
  ): (...args: TArgs) => Promise<TValue>;
  function effect<TArgs extends unknown[], TValue, TError = unknown>(
    name: string,
    fn: (...args: TArgs) => Effect.Effect<TValue | EffectSuccessPayload<TValue>, TError>,
    options?: Omit<LayerEffectOptions<TArgs>, 'name'>,
  ): (...args: TArgs) => Promise<TValue>;
  function effect<TArgs extends unknown[], TValue, TError = unknown>(
    nameOrFn:
      | string
      | ((...args: TArgs) => Effect.Effect<TValue | EffectSuccessPayload<TValue>, TError>),
    fnOrOptions?:
      | ((...args: TArgs) => Effect.Effect<TValue | EffectSuccessPayload<TValue>, TError>)
      | LayerEffectOptions<TArgs>,
    maybeOptions?: Omit<LayerEffectOptions<TArgs>, 'name'>,
  ) {
    const fn =
      typeof nameOrFn === 'string'
        ? (fnOrOptions as (
            ...args: TArgs
          ) => Effect.Effect<TValue | EffectSuccessPayload<TValue>, TError>)
        : nameOrFn;
    const options =
      typeof nameOrFn === 'string'
        ? { ...(maybeOptions ?? {}), name: nameOrFn }
        : (fnOrOptions as LayerEffectOptions<TArgs> | undefined);

    const scope = getLayerScope(prefix, fn, options);
    const telemetrySpanName = options?.telemetrySpanName ?? scope;
    const concerns = combineConcerns(layerOptions?.concerns, options?.concerns);

    return (...args: TArgs) =>
      runServerEffect(fn(...args), {
        scope,
        telemetrySpanName,
        input: options?.input ? options.input(...args) : deriveArgsInputRecord(args),
        extra: options?.extra ? options.extra(...args) : undefined,
        concernInput: (args.length === 0 ? undefined : args[0]) as TArgs extends []
          ? undefined
          : TArgs[0],
        concerns,
      });
  }

  function layerOperation<
    TInput extends OperationInput,
    TRawSuccess,
    TFailure extends OperationFailure,
    TInfraError extends OperationRuntimeError = never,
  >(
    fn: (input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>,
    options?: LayerOperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
  ): OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError>;
  function layerOperation<
    TInput extends OperationInput,
    TRawSuccess,
    TFailure extends OperationFailure,
    TInfraError extends OperationRuntimeError = never,
  >(
    name: string,
    fn: (input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>,
    options?: Omit<
      LayerOperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
      'name'
    >,
  ): OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError>;
  function layerOperation<
    TInput extends OperationInput,
    TRawSuccess,
    TFailure extends OperationFailure,
    TInfraError extends OperationRuntimeError = never,
  >(
    nameOrFn: string | ((input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>),
    fnOrOptions?:
      | ((input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>)
      | LayerOperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
    maybeOptions?: Omit<
      LayerOperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>,
      'name'
    >,
  ): OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError> {
    const fn =
      typeof nameOrFn === 'string'
        ? (fnOrOptions as (input: TInput) => Effect.Effect<TRawSuccess, TFailure | TInfraError>)
        : nameOrFn;
    const options =
      typeof nameOrFn === 'string'
        ? { ...(maybeOptions ?? {}), name: nameOrFn }
        : (fnOrOptions as
            | LayerOperationOptions<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure>
            | undefined);
    const scope = getLayerScope(prefix, fn, options);
    const localRequires = combineRequirements(layerOptions?.requires, options?.requires);
    const localConcerns = combineConcerns(layerOptions?.concerns, options?.concerns);

    const localRunner = createLayerOperationRunner(fn, {
      ...options,
      scope,
      defectPublicMessage: options?.defectPublicMessage ?? getDefaultDefectPublicMessage(scope),
      requires: localRequires,
      concerns: localConcerns,
    });

    const runner = async (
      input: TInput,
    ): Promise<OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>> => {
      const architectureDefaults = await resolveArchitectureLayerDefaults(prefix);

      if (!architectureDefaults.requires?.length && !architectureDefaults.concerns?.length) {
        return localRunner(input);
      }

      return createLayerOperationRunner(fn, {
        ...options,
        scope,
        defectPublicMessage: options?.defectPublicMessage ?? getDefaultDefectPublicMessage(scope),
        requires: combineRequirements(architectureDefaults.requires, localRequires),
        concerns: combineConcerns(architectureDefaults.concerns, localConcerns),
      })(input);
    };

    void getArchitecture();

    return Object.assign(runner, {
      effect: localRunner.effect,
      metadata: localRunner.metadata,
    }) as OperationRunner<TInput, UnwrapEffectSuccess<TRawSuccess>, TFailure, TInfraError>;
  }

  return {
    prefix,
    effect,
    operation: layerOperation,
  };
}
