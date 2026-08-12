import { Effect } from 'effect';

import { getServerRuntimeConfig } from './config.js';
import { getRequiredOperationRuntimeContext } from './context.js';
import {
  ExternalDependencyFailedError,
  type OperationFailure,
  type OperationRuntimeError,
  PersistenceFailedError,
} from './operation/types.js';

export const isOperationRuntimeError = (value: unknown): value is OperationRuntimeError =>
  value instanceof PersistenceFailedError || value instanceof ExternalDependencyFailedError;

export const isOperationFailure = (value: unknown): value is OperationFailure =>
  typeof value === 'object' &&
  value != null &&
  'reason' in value &&
  'message' in value &&
  typeof (value as { reason: unknown }).reason === 'string' &&
  typeof (value as { message: unknown }).message === 'string';

export const createOperationFailure = <
  TReason extends string,
  TExtra extends Record<string, unknown> = Record<string, unknown>,
>(
  reason: TReason,
  message: string,
  extra?: TExtra,
): OperationFailure<TReason, TExtra> => ({
  reason,
  message,
  ...(extra ?? ({} as TExtra)),
});

export const failOperation = <
  TReason extends string,
  TExtra extends Record<string, unknown> = Record<string, unknown>,
>(
  reason: TReason,
  message: string,
  extra?: TExtra,
): Effect.Effect<never, OperationFailure<TReason, TExtra>> =>
  Effect.fail(createOperationFailure(reason, message, extra));

export const createPersistenceFailedError = (input: {
  message: string;
  logMessage: string;
  cause: unknown;
  extra?: Record<string, unknown>;
}) =>
  new PersistenceFailedError({
    message: input.message,
    logMessage: input.logMessage,
    cause: input.cause,
    scope: getRequiredOperationRuntimeContext().scope,
    extra: input.extra,
  });

export const reportOperationError = (
  logMessage: string,
  cause: unknown,
  extra?: Record<string, unknown>,
) =>
  getServerRuntimeConfig().reporting.reportError(logMessage, cause, {
    scope: getRequiredOperationRuntimeContext().scope,
    extra,
  });

export const reportOperationWarning = (
  logMessage: string,
  cause: unknown,
  extra?: Record<string, unknown>,
) =>
  getServerRuntimeConfig().reporting.reportWarning(logMessage, cause, {
    scope: getRequiredOperationRuntimeContext().scope,
    extra,
  });
