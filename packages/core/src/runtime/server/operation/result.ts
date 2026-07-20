import { getServerRuntimeConfig } from '../config.js';

import type {
  ExternalDependencyFailedError,
  FailureResult,
  PersistenceFailedError,
  OperationRuntimeError,
  OperationFailure,
} from './types.js';

export const serializeFailure = <TFailure extends OperationFailure>(
  failure: TFailure,
): FailureResult<TFailure> => ({
  success: false,
  error: failure.message,
  errorType: failure.reason,
  ...failure,
});

export const reportExpectedFailure = (error: OperationRuntimeError) => {
  const { reporting } = getServerRuntimeConfig();

  reporting.reportError(error.logMessage, error.cause, {
    scope: error.scope,
    extra: error.extra,
  });
};

export const serializeExpectedFailure = (
  error: PersistenceFailedError | ExternalDependencyFailedError,
): FailureResult<OperationFailure<'persistence_failed' | 'external_dependency_failed'>> => {
  if (error._tag === 'PersistenceFailed') {
    return serializeFailure({
      reason: 'persistence_failed',
      message: error.message,
    });
  }

  return serializeFailure({
    reason: 'external_dependency_failed',
    message: error.message,
  });
};
