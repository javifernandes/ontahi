import type { ArchitectureDefinition } from './architecture-types.js';
import type { RateLimitPolicy } from './concerns/rate-limit-policy.js';

export type ServerRuntimeTelemetryInput = {
  scope: string;
  runtime: 'operation' | 'effect' | 'intent';
  input?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
};

export interface ServerRuntimeTelemetryAdapter {
  withSpan: <TValue>(
    name: string,
    options: {
      attributes?: Record<string, unknown>;
      spanOptions?: unknown;
    },
    fn: (span: unknown) => Promise<TValue> | TValue,
  ) => Promise<TValue>;
  markSuccess: (span: unknown, attributes?: Record<string, unknown>) => void;
  markFailure: (span: unknown, kind: string, attributes?: Record<string, unknown>) => void;
  getRuntimeAttributes: (input: ServerRuntimeTelemetryInput) => Record<string, unknown>;
}

export interface ServerRuntimeReportingAdapter {
  reportError: (
    message: string,
    cause?: unknown,
    options?: {
      scope?: string;
      extra?: Record<string, unknown>;
    },
  ) => void;
  reportWarning: (
    message: string,
    cause?: unknown,
    options?: {
      scope?: string;
      extra?: Record<string, unknown>;
    },
  ) => void;
}

export type ServerRuntimeDiagnostics = {
  exposeInternalErrorCauses?: boolean;
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: string;
}

export interface ServerRuntimeRateLimitAdapter {
  acquireSlot: (policy: RateLimitPolicy, key: string) => Promise<RateLimitResult>;
  releaseSlot: (policy: RateLimitPolicy, key: string) => Promise<void>;
}

export type ServerRuntimeConfig<TEvent = unknown> = {
  telemetry?: ServerRuntimeTelemetryAdapter;
  reporting?: ServerRuntimeReportingAdapter;
  diagnostics?: ServerRuntimeDiagnostics;
  rateLimit?: ServerRuntimeRateLimitAdapter;
  loadArchitecture?: () => Promise<ArchitectureDefinition<TEvent>>;
};
