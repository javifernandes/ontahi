import type { ServerRuntimeTelemetryAdapter } from './config-types.js';
import { getServerRuntimeConfig } from './config.js';

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
