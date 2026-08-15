import { toError, toSerializableErrorCause } from '@ontahi/core/value/error';
import { Cause, Effect, Exit, Option } from 'effect';

import { RateLimitExceededError } from '../concerns/rate-limit.js';
import { getServerRuntimeConfig } from '../config.js';
import type { UnwrapEffectSuccess } from '../effect-intents/types.js';
import { isOperationFailure, isOperationRuntimeError } from '../failures.js';
import { executeEffectIntents, normalizeEffectSuccess } from '../intents.js';

import type { RunServerOperationOptions } from './options-types.js';
import { reportExpectedFailure, serializeExpectedFailure, serializeFailure } from './result.js';
import {
  PersistenceFailedError,
  type OperationFailure,
  type OperationResult,
  type OperationRuntimeError,
} from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOperationDataEnvelope = (value: unknown): value is { data: unknown } =>
  isRecord(value) && Object.keys(value).length === 1 && 'data' in value;

const toSuccessResult = <TData>(data: TData): OperationResult<TData, never> => {
  if (data === undefined) {
    return { success: true } as OperationResult<TData, never>;
  }

  const value = isOperationDataEnvelope(data) ? data.data : data;

  return {
    success: true,
    data: value,
  } as OperationResult<TData, never>;
};

const runServerOperationEffect = async <
  TRawSuccess,
  TFailure extends OperationFailure = OperationFailure,
>(
  effect: Effect.Effect<
    TRawSuccess,
    TFailure | OperationRuntimeError | RateLimitExceededError | unknown
  >,
  options: RunServerOperationOptions,
): Promise<OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>> => {
  const { telemetry, reporting, diagnostics } = getServerRuntimeConfig();

  return telemetry.withSpan(
    options.telemetrySpanName ?? options.scope,
    {
      attributes: telemetry.getRuntimeAttributes({
        scope: options.scope,
        runtime: 'operation',
        extra: options.extra,
      }),
    },
    async span => {
      const exit = await Effect.runPromiseExit(effect);

      if (Exit.isSuccess(exit)) {
        const normalized = normalizeEffectSuccess(exit.value);
        await executeEffectIntents(normalized.effects);
        telemetry.markSuccess(span);
        return toSuccessResult(normalized.data) as OperationResult<
          UnwrapEffectSuccess<TRawSuccess>,
          TFailure
        >;
      }

      const expectedFailure = Cause.failureOption(exit.cause);
      if (Option.isSome(expectedFailure)) {
        if (isOperationFailure(expectedFailure.value)) {
          telemetry.markFailure(span, expectedFailure.value.reason, {
            failureCategory: 'business',
          });
          return serializeFailure(expectedFailure.value) as OperationResult<
            UnwrapEffectSuccess<TRawSuccess>,
            TFailure
          >;
        }

        if (expectedFailure.value instanceof RateLimitExceededError) {
          telemetry.markFailure(span, 'rate_limited', {
            failureCategory: 'business',
          });
          return serializeFailure({
            reason: 'rate_limited',
            message: expectedFailure.value.message,
            status: 429,
          }) as OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>;
        }

        if (isOperationRuntimeError(expectedFailure.value)) {
          telemetry.markFailure(
            span,
            expectedFailure.value instanceof PersistenceFailedError
              ? 'persistence_failed'
              : 'external_dependency_failed',
          );
          reportExpectedFailure(expectedFailure.value);
          return serializeExpectedFailure(expectedFailure.value) as OperationResult<
            UnwrapEffectSuccess<TRawSuccess>,
            TFailure
          >;
        }
      }

      const defect = Cause.squash(exit.cause);
      telemetry.markFailure(span, 'internal_error');
      reporting.reportError(options.defectLogMessage, toError(defect), {
        scope: options.scope,
        extra: {
          ...options.extra,
          defectCause: Cause.pretty(exit.cause),
        },
      });

      return {
        success: false,
        reason: 'internal_error',
        message: options.defectPublicMessage ?? 'Unexpected server error',
        error: options.defectPublicMessage ?? 'Unexpected server error',
        errorType: 'internal_error',
        ...(diagnostics.exposeInternalErrorCauses
          ? { cause: toSerializableErrorCause(defect) }
          : {}),
      } as OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>;
    },
  );
};

export async function runServerOperation<
  TRawSuccess,
  TFailure extends OperationFailure = OperationFailure,
>(
  effect: Effect.Effect<
    TRawSuccess,
    TFailure | OperationRuntimeError | RateLimitExceededError | unknown
  >,
  options: RunServerOperationOptions,
): Promise<OperationResult<UnwrapEffectSuccess<TRawSuccess>, TFailure>> {
  return runServerOperationEffect(effect, options);
}
