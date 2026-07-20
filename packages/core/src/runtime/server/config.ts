import type { ArchitectureDefinition } from './architecture-types.js';
import type {
  ServerRuntimeConfig,
  ServerRuntimeRateLimitAdapter,
  ServerRuntimeReportingAdapter,
  ServerRuntimeTelemetryAdapter,
} from './config-types.js';

const NOOP_TELEMETRY: ServerRuntimeTelemetryAdapter = {
  withSpan: async (_name, _options, fn) => fn({}),
  markSuccess: () => {},
  markFailure: () => {},
  getRuntimeAttributes: input => ({
    scope: input.scope,
    runtime: input.runtime,
    ...(input.attributes ?? {}),
  }),
};

const NOOP_REPORTING: ServerRuntimeReportingAdapter = {
  reportError: () => {},
  reportWarning: () => {},
};

const NOOP_RATE_LIMIT: ServerRuntimeRateLimitAdapter = {
  acquireSlot: async policy => ({
    allowed: true,
    remaining: policy.limit,
  }),
  releaseSlot: async () => {},
};

const DEFAULT_RUNTIME_CONFIG: Required<
  Pick<ServerRuntimeConfig<unknown>, 'telemetry' | 'reporting' | 'rateLimit'>
> &
  Pick<ServerRuntimeConfig<unknown>, 'loadArchitecture'> = {
  telemetry: NOOP_TELEMETRY,
  reporting: NOOP_REPORTING,
  rateLimit: NOOP_RATE_LIMIT,
  loadArchitecture: async () => ({}) as ArchitectureDefinition<unknown>,
};

let runtimeConfig: ServerRuntimeConfig<unknown> | undefined;

export const configureServerRuntime = <TEvent = unknown>(
  config: ServerRuntimeConfig<TEvent>,
): void => {
  runtimeConfig = config as ServerRuntimeConfig<unknown>;
};

export const resetServerRuntimeForTests = (): void => {
  runtimeConfig = undefined;
};

export const getServerRuntimeConfig = <TEvent = unknown>(): Required<
  Pick<ServerRuntimeConfig<TEvent>, 'telemetry' | 'reporting' | 'rateLimit'>
> &
  Pick<ServerRuntimeConfig<TEvent>, 'loadArchitecture'> => {
  const configured = runtimeConfig as ServerRuntimeConfig<TEvent> | undefined;

  return {
    telemetry: configured?.telemetry ?? DEFAULT_RUNTIME_CONFIG.telemetry,
    reporting: configured?.reporting ?? DEFAULT_RUNTIME_CONFIG.reporting,
    rateLimit: configured?.rateLimit ?? DEFAULT_RUNTIME_CONFIG.rateLimit,
    loadArchitecture: configured?.loadArchitecture ?? DEFAULT_RUNTIME_CONFIG.loadArchitecture,
  };
};
