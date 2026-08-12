import { Data } from 'effect';

export type EffectFailureKind =
  | 'persistence_failed'
  | 'external_dependency_failed'
  | 'internal_error';

export type OperationFailure<
  TReason extends string = string,
  TExtra extends Record<string, unknown> = Record<string, unknown>,
> = {
  reason: TReason;
  message: string;
} & TExtra;

export class PersistenceFailedError extends Data.TaggedError('PersistenceFailed')<{
  message: string;
  logMessage: string;
  cause: unknown;
  scope: string;
  extra?: Record<string, unknown>;
}> {}

export class ExternalDependencyFailedError extends Data.TaggedError('ExternalDependencyFailed')<{
  message: string;
  logMessage: string;
  cause: unknown;
  scope: string;
  extra?: Record<string, unknown>;
}> {}

export type OperationRuntimeError = PersistenceFailedError | ExternalDependencyFailedError;
export type OperationInfraError = OperationRuntimeError;

export type FailureResult<TFailure extends OperationFailure = OperationFailure> = {
  success: false;
  error: string;
} & TFailure & { errorType?: string };

export type SuccessResult<TData = void> = { success: true; data?: TData };

export type OperationResult<TData = void, TFailure extends OperationFailure = OperationFailure> =
  | SuccessResult<TData>
  | FailureResult<TFailure | OperationFailure<EffectFailureKind>>;
