import type { LayerConcernRuntime } from '../layer-types.js';
import type { OperationFailure } from '../operation/types.js';

export type ContractCheckFailure<TFailure extends OperationFailure = OperationFailure> =
  | TFailure
  | ReadonlyArray<TFailure>;

export type ContractPreCheck<
  TInput extends object = object,
  TFailure extends OperationFailure = OperationFailure,
> = (
  input: TInput,
  runtime: LayerConcernRuntime<TInput>,
) =>
  | void
  | ContractCheckFailure<TFailure>
  | PromiseLike<void | ContractCheckFailure<TFailure>>
  | import('effect').Effect.Effect<void | ContractCheckFailure<TFailure>, unknown>;

export type ContractPostCheck<
  TInput extends object = object,
  TResult = unknown,
  TFailure extends OperationFailure = OperationFailure,
> = (
  input: TInput,
  result: TResult,
  runtime: LayerConcernRuntime<TInput>,
) =>
  | void
  | ContractCheckFailure<TFailure>
  | PromiseLike<void | ContractCheckFailure<TFailure>>
  | import('effect').Effect.Effect<void | ContractCheckFailure<TFailure>, unknown>;

export type OperationContracts<
  TInput extends object = object,
  TResult = unknown,
  TFailure extends OperationFailure = OperationFailure,
> = {
  pre?: ContractPreCheck<TInput, TFailure> | ReadonlyArray<ContractPreCheck<TInput, TFailure>>;
  post?:
    | ContractPostCheck<TInput, TResult, TFailure>
    | ReadonlyArray<ContractPostCheck<TInput, TResult, TFailure>>;
};
