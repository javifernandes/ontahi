import { Effect, Exit, Runtime } from 'effect';

import type { ServerRuntimeTelemetryAdapter } from './config-types.js';
import { getConfiguredRuntimeTelemetry, getServerRuntimeConfig } from './config.js';

export const traceRuntimeEffect = <TValue, TError, TRequirements>(
  name: string,
  effect: Effect.Effect<TValue, TError, TRequirements>,
  successAttributes?: Record<string, unknown>,
  options: Parameters<ServerRuntimeTelemetryAdapter['withSpan']>[1] = {},
): Effect.Effect<TValue, TError, TRequirements> =>
  Effect.suspend(() => {
    const telemetry = getConfiguredRuntimeTelemetry();
    if (!telemetry) return effect;

    return Effect.runtime<TRequirements>().pipe(
      Effect.flatMap(runtime =>
        Effect.promise(signal =>
          telemetry.withSpan(name, options, async span => {
            const exit = await Runtime.runPromiseExit(runtime)(effect, { signal });
            if (Exit.isSuccess(exit)) {
              if (successAttributes) telemetry.markSuccess(span, successAttributes);
              else telemetry.markSuccess(span);
            } else {
              telemetry.markFailure(span, `${name.slice('ontahi.runtime.'.length)}_failed`);
            }
            return exit;
          }),
        ),
      ),
      Effect.flatten,
    );
  });

export const createServerRuntimeTelemetryAdapter = (
  adapter: ServerRuntimeTelemetryAdapter,
): ServerRuntimeTelemetryAdapter => adapter;

export const withRuntimeSpan = <TValue>(
  name: string,
  options: Parameters<ServerRuntimeTelemetryAdapter['withSpan']>[1],
  fn: (span: unknown) => Promise<TValue> | TValue,
): Promise<TValue> =>
  getServerRuntimeConfig().telemetry.withSpan(name, options, fn) as Promise<TValue>;

export const markRuntimeSuccess = (span: unknown, attributes?: Record<string, unknown>): void => {
  getServerRuntimeConfig().telemetry.markSuccess(span, attributes);
};

export const markRuntimeFailure = (
  span: unknown,
  kind: string,
  attributes?: Record<string, unknown>,
): void => {
  getServerRuntimeConfig().telemetry.markFailure(span, kind, attributes);
};

export const getRuntimeTelemetryAttributes = (
  input: Parameters<ServerRuntimeTelemetryAdapter['getRuntimeAttributes']>[0],
): Record<string, unknown> => getServerRuntimeConfig().telemetry.getRuntimeAttributes(input);
