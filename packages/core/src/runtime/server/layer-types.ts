import type { OperationInput, OperationRequirement } from './operation/requirement-types.js';

export type LayerConcernRuntime<TInput = unknown> = {
  scope: string;
  telemetrySpanName: string;
  input: TInput;
  inputRecord?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  resources: Map<string, unknown>;
};

export type LayerConcern<TInput = unknown, TError = never> = {
  run: <TSuccess, TNextError>(
    runtime: LayerConcernRuntime<TInput>,
    next: import('effect').Effect.Effect<TSuccess, TNextError>,
  ) => import('effect').Effect.Effect<TSuccess, TNextError | TError>;
};

export type LayerScopedOptions = {
  name?: string;
  scope?: string;
  telemetrySpanName?: string;
};

export type LayerOptions = {
  requires?: ReadonlyArray<OperationRequirement<OperationInput>>;
  concerns?: ReadonlyArray<LayerConcern<any, unknown>>;
};

export type LayerEffectOptions<TArgs extends unknown[]> = LayerScopedOptions & {
  input?: (...args: TArgs) => Record<string, unknown> | undefined;
  extra?: (...args: TArgs) => Record<string, unknown> | undefined;
  concerns?: ReadonlyArray<LayerConcern<TArgs extends [] ? undefined : TArgs[0], unknown>>;
};
