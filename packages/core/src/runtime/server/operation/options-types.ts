import type { DomainOperationExecutionMetadata } from '../../../data-graph/operation-execution.js';
import type { OperationContracts } from '../concerns/contract-types.js';
import type { EffectSuccessPayload } from '../effect-intents/types.js';
import type { LayerConcern, LayerScopedOptions } from '../layer-types.js';

import type { OperationInput, OperationRequirement } from './requirement-types.js';
import type {
  OperationFailure,
  OperationResult,
  OperationRuntimeError,
  SuccessResult,
} from './types.js';
import type { ServerRuntimeValueRef } from './value-ref.js';

export type RunServerOperationOptions = {
  scope: string;
  telemetrySpanName?: string;
  defectLogMessage: string;
  defectPublicMessage?: string;
  extra?: Record<string, unknown>;
};

export type OperationCacheConfig<TInput extends OperationInput = OperationInput> = {
  value?: (input: TInput) => ServerRuntimeValueRef;
  dependsOn?: (input: TInput) => ReadonlyArray<ServerRuntimeValueRef>;
};

export type OperationEffectsConfig<
  TInput extends OperationInput = OperationInput,
  TResult = unknown,
> = {
  affects?: (args: {
    input: TInput;
    result: SuccessResult<TResult>;
  }) => ReadonlyArray<ServerRuntimeValueRef>;
};

export type OperationOptions<
  TInput extends OperationInput,
  TResult = unknown,
  TFailure extends OperationFailure = OperationFailure,
> = {
  scope: string;
  defectLogMessage?: string;
  defectPublicMessage?: string;
  extra?: (input: TInput) => Record<string, unknown>;
  telemetrySpanName?: string;
  requires?: ReadonlyArray<OperationRequirement<TInput>>;
  concerns?: ReadonlyArray<LayerConcern<TInput, unknown>>;
  contracts?: OperationContracts<TInput, TResult, TFailure>;
  execution?: DomainOperationExecutionMetadata;
  cache?: OperationCacheConfig<TInput>;
  effects?: OperationEffectsConfig<TInput, TResult>;
};

export type LayerOperationOptions<
  TInput extends OperationInput,
  TResult = unknown,
  TFailure extends OperationFailure = OperationFailure,
> = Omit<OperationOptions<TInput, TResult, TFailure>, 'scope'> & LayerScopedOptions;

export type OperationRunner<
  TInput extends OperationInput,
  TData,
  TFailure extends OperationFailure,
  TInfraError extends OperationRuntimeError = never,
> = ((input: TInput) => Promise<OperationResult<TData, TFailure>>) & {
  effect: (
    input: TInput,
  ) => import('effect').Effect.Effect<TData | EffectSuccessPayload<TData>, TFailure | TInfraError>;
  metadata: Required<
    Pick<
      OperationOptions<TInput, TData, TFailure>,
      'scope' | 'defectLogMessage' | 'telemetrySpanName'
    >
  > &
    Pick<
      OperationOptions<TInput, TData, TFailure>,
      'defectPublicMessage' | 'extra' | 'requires' | 'concerns' | 'contracts'
    > &
    Pick<OperationOptions<TInput, TData, TFailure>, 'execution'> &
    Pick<OperationOptions<TInput, TData, TFailure>, 'cache' | 'effects'>;
};
