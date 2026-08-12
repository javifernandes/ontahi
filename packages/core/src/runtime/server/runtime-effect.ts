import { toError } from '@ontahi/core/value/error';
import { Cause, Effect, Exit } from 'effect';

import { resolveArchitectureLayerDefaults } from './architecture-registry.js';
import { RateLimitExceededError } from './concerns/rate-limit.js';
import { applyLayerConcerns, combineConcerns } from './concerns.js';
import { getServerRuntimeConfig } from './config.js';
import type { OperationRuntimeContext } from './context-types.js';
import { getOperationRuntimeContext, operationRuntimeContextStorage } from './context.js';
import type { EffectSuccessPayload } from './effect-intents/types.js';
import { executeEffectIntents, normalizeEffectSuccess } from './intents.js';
import type { LayerConcern } from './layer-types.js';

export const runServerEffect = async <TValue, TInput = unknown>(
  effect: Effect.Effect<TValue | EffectSuccessPayload<TValue>, unknown>,
  options: {
    scope: string;
    telemetrySpanName?: string;
    input?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    concernInput?: TInput;
    concerns?: ReadonlyArray<LayerConcern<TInput, unknown>>;
  },
): Promise<TValue> => {
  const parentContext = getOperationRuntimeContext();
  const architectureDefaults = await resolveArchitectureLayerDefaults(options.scope);
  const context: OperationRuntimeContext = {
    scope: options.scope,
    telemetrySpanName: options.telemetrySpanName ?? options.scope,
    input: options.input,
    extra: options.extra ?? options.input,
    resources: parentContext?.resources ?? new Map(),
  };
  const { telemetry } = getServerRuntimeConfig();

  const exit = await telemetry.withSpan(
    context.telemetrySpanName,
    {
      attributes: telemetry.getRuntimeAttributes({
        scope: context.scope,
        runtime: 'effect',
        input: context.input,
        extra: context.extra,
      }),
    },
    span =>
      operationRuntimeContextStorage.run(context, async () => {
        const resolved = await Effect.runPromiseExit(
          applyLayerConcerns(
            {
              scope: context.scope,
              telemetrySpanName: context.telemetrySpanName,
              input: options.concernInput as TInput,
              inputRecord: context.input,
              extra: context.extra,
              resources: context.resources,
            },
            combineConcerns(architectureDefaults.concerns, options.concerns),
            effect,
          ),
        );

        if (Exit.isSuccess(resolved)) {
          const normalized = normalizeEffectSuccess(resolved.value);
          await executeEffectIntents(normalized.effects);
          telemetry.markSuccess(span);
          return Exit.succeed(normalized.data as TValue);
        }

        const expectedFailure = Cause.failureOption(resolved.cause);
        if (
          expectedFailure._tag === 'Some' &&
          expectedFailure.value instanceof RateLimitExceededError
        ) {
          telemetry.markFailure(span, 'rate_limited', {
            failureCategory: 'business',
          });
          return resolved;
        }

        telemetry.markFailure(span, 'internal_error');
        return resolved;
      }),
  );

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const error = Cause.squash(exit.cause);
  throw toError(error);
};
