import { toError } from '@ontahi/core/value/error';
import { Cause, Effect, Exit } from 'effect';

import {
  resolveArchitectureLayerDefaults,
  resolveArchitectureLayerDefaultsFor,
} from './architecture-registry.js';
import type { ArchitectureDefinition, ArchitectureLayerDefaults } from './architecture-types.js';
import { RateLimitExceededError } from './concerns/rate-limit.js';
import { applyLayerConcerns, combineConcerns } from './concerns.js';
import { getServerRuntimeConfig } from './config.js';
import type { OperationRuntimeContext } from './context-types.js';
import { getOperationRuntimeContext, operationRuntimeContextStorage } from './context.js';
import type { EffectSuccessPayload } from './effect-intents/types.js';
import { executeEffectIntents, normalizeEffectSuccess } from './intents.js';
import { getCurrentInvocationContext } from './invocation-context.js';
import type { LayerConcern } from './layer-types.js';

type RunServerEffectOptions<TInput> = {
  scope: string;
  telemetrySpanName?: string;
  input?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  concernInput?: TInput;
  concerns?: ReadonlyArray<LayerConcern<TInput, unknown>>;
};

const runServerEffectWithDefaults = async <TValue, TInput>(
  effect: Effect.Effect<TValue | EffectSuccessPayload<TValue>, unknown>,
  options: RunServerEffectOptions<TInput>,
  architectureDefaults: ArchitectureLayerDefaults,
): Promise<TValue> => {
  const parentContext = getOperationRuntimeContext();
  const invocationContext = getCurrentInvocationContext();
  const context: OperationRuntimeContext = {
    scope: options.scope,
    telemetrySpanName: options.telemetrySpanName ?? options.scope,
    input: options.input,
    extra: options.extra ?? options.input,
    resources: parentContext?.resources ?? invocationContext?.resources ?? new Map(),
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

export const runServerEffect = async <TValue, TInput = unknown>(
  effect: Effect.Effect<TValue | EffectSuccessPayload<TValue>, unknown>,
  options: RunServerEffectOptions<TInput>,
): Promise<TValue> =>
  runServerEffectWithDefaults(
    effect,
    options,
    await resolveArchitectureLayerDefaults(options.scope),
  );

export const runServerEffectForArchitecture = <TValue, TInput = unknown>(
  architecture: ArchitectureDefinition<unknown>,
  effect: Effect.Effect<TValue | EffectSuccessPayload<TValue>, unknown>,
  options: RunServerEffectOptions<TInput>,
): Promise<TValue> =>
  runServerEffectWithDefaults(
    effect,
    options,
    resolveArchitectureLayerDefaultsFor(architecture, options.scope),
  );
