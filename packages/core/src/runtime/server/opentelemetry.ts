import { toError, toErrorMessage } from '../../value/error.js';

import type { ServerRuntimeTelemetryAdapter } from './config-types.js';
import { createServerRuntimeTelemetryAdapter } from './telemetry.js';

const SENSITIVE_ATTRIBUTE_KEY =
  /(email|token|cookie|secret|password|authorization|body|content|text|prompt|headers?)/i;
const MAX_ATTRIBUTE_STRING_LENGTH = 120;

type TelemetryPrimitive = string | number | boolean;
type TelemetryAttributeInput =
  | TelemetryPrimitive
  | null
  | undefined
  | Date
  | TelemetryPrimitive[]
  | Date[];

type SpanLike = {
  setAttributes?: (attributes: Record<string, unknown>) => unknown;
  setStatus?: (status: { code: number; message?: string }) => unknown;
  recordException?: (error: unknown) => void;
  end?: () => void;
  spanContext?: () => {
    traceId: string;
    spanId: string;
  };
};

type OTelApi = {
  SpanStatusCode: {
    ERROR: number;
  };
  trace: {
    getActiveSpan: () => SpanLike | undefined;
    getTracer: (name: string) => {
      startActiveSpan: <TValue>(
        name: string,
        options: unknown,
        fn: (span: SpanLike) => Promise<TValue> | TValue,
      ) => Promise<TValue>;
    };
  };
};

const isSensitiveAttributeKey = (key: string) => {
  if (SENSITIVE_ATTRIBUTE_KEY.test(key)) {
    return true;
  }

  const normalized = key.trim().toLowerCase();
  return (
    normalized === 'query' ||
    normalized.endsWith('.query') ||
    normalized.endsWith('_query') ||
    normalized.endsWith('-query')
  );
};

const toTelemetryAttributeValue = (
  value: TelemetryAttributeInput,
): string | number | boolean | string[] | undefined => {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.length > MAX_ATTRIBUTE_STRING_LENGTH
      ? `${value.slice(0, MAX_ATTRIBUTE_STRING_LENGTH)}...`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const items = value
      .map(item => {
        if (item instanceof Date) {
          return item.toISOString();
        }

        if (typeof item === 'string') {
          return item.length > MAX_ATTRIBUTE_STRING_LENGTH
            ? `${item.slice(0, MAX_ATTRIBUTE_STRING_LENGTH)}...`
            : item;
        }

        if (typeof item === 'number' || typeof item === 'boolean') {
          return String(item);
        }

        return undefined;
      })
      .filter((item): item is string => item !== undefined);

    return items.length > 0 ? items : undefined;
  }

  return undefined;
};

const createNoopSpan = (): SpanLike => ({
  setAttributes: () => undefined,
  setStatus: () => undefined,
  recordException: () => undefined,
  end: () => undefined,
  spanContext: () => ({
    traceId: '',
    spanId: '',
  }),
});

let cachedOtelApi: OTelApi | null | undefined;

const getOtelApi = (): OTelApi | null => {
  if (cachedOtelApi !== undefined) {
    return cachedOtelApi;
  }

  try {
    const maybeRequire = (0, eval)('require') as ((id: string) => unknown) | undefined;
    cachedOtelApi = maybeRequire ? (maybeRequire('@opentelemetry/api') as OTelApi) : null;
  } catch {
    cachedOtelApi = null;
  }

  return cachedOtelApi;
};

export const sanitizeTelemetryAttributes = (
  attributes?: Record<string, unknown>,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};

  if (!attributes) {
    return sanitized;
  }

  for (const [key, rawValue] of Object.entries(attributes)) {
    if (!key || isSensitiveAttributeKey(key)) {
      continue;
    }

    const value = toTelemetryAttributeValue(rawValue as TelemetryAttributeInput);
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

export const prefixTelemetryAttributes = (
  prefix: string,
  attributes?: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(sanitizeTelemetryAttributes(attributes)).map(([key, value]) => [
      `${prefix}.${key}`,
      value,
    ]),
  );

export const getActiveTraceMetadata = (): { traceId?: string; spanId?: string } => {
  const activeSpan = getOtelApi()?.trace.getActiveSpan();
  if (!activeSpan) {
    return {};
  }

  const context = activeSpan.spanContext?.();
  if (!context) {
    return {};
  }

  return {
    traceId: context.traceId,
    spanId: context.spanId,
  };
};

export const getOpenTelemetryRuntimeAttributes = (input: {
  scope: string;
  runtime: 'operation' | 'effect' | 'intent';
  input?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  environment?: string;
}): Record<string, unknown> => ({
  'bookops.scope': input.scope,
  'bookops.runtime': input.runtime,
  ...(input.environment ? { 'bookops.environment': input.environment } : {}),
  ...prefixTelemetryAttributes('bookops.input', input.input),
  ...prefixTelemetryAttributes('bookops.extra', input.extra),
  ...sanitizeTelemetryAttributes(input.attributes),
});

export const markOpenTelemetrySpanSuccess = (
  span: unknown,
  attributes?: Record<string, unknown>,
): void => {
  (span as SpanLike | undefined)?.setAttributes?.({
    'bookops.outcome': 'success',
    ...sanitizeTelemetryAttributes(attributes),
  });
};

export const markOpenTelemetrySpanFailure = (
  span: unknown,
  kind: string,
  attributes?: Record<string, unknown>,
): void => {
  (span as SpanLike | undefined)?.setAttributes?.({
    'bookops.outcome': 'failure',
    'bookops.failure_kind': kind,
    ...sanitizeTelemetryAttributes(attributes),
  });
  (span as SpanLike | undefined)?.setStatus?.({
    code: getOtelApi()?.SpanStatusCode.ERROR ?? 2,
    message: kind,
  });
};

export const withOpenTelemetryServerSpan = async <TValue>(
  name: string,
  options: {
    attributes?: Record<string, unknown>;
    spanOptions?: unknown;
  },
  fn: (span: unknown) => Promise<TValue> | TValue,
  tracerName = 'app.server',
): Promise<TValue> => {
  const otelApi = getOtelApi();

  if (!otelApi) {
    return Promise.resolve(fn(createNoopSpan()));
  }

  return otelApi.trace
    .getTracer(tracerName)
    .startActiveSpan(name, options.spanOptions ?? {}, async span => {
      const attributes = sanitizeTelemetryAttributes(options.attributes);
      if (Object.keys(attributes).length > 0) {
        span.setAttributes?.(attributes);
      }

      try {
        return await fn(span);
      } catch (error) {
        span.recordException?.(toError(error));
        span.setStatus?.({
          code: otelApi.SpanStatusCode.ERROR,
          message: toErrorMessage(error),
        });
        throw error;
      } finally {
        span.end?.();
      }
    });
};

export const createOpenTelemetryServerRuntimeTelemetryAdapter = (options?: {
  tracerName?: string;
  getRuntimeAttributes?: ServerRuntimeTelemetryAdapter['getRuntimeAttributes'];
}): ServerRuntimeTelemetryAdapter =>
  createServerRuntimeTelemetryAdapter({
    withSpan: (name, spanOptions, fn) =>
      withOpenTelemetryServerSpan(name, spanOptions, fn, options?.tracerName ?? 'app.server'),
    markSuccess: markOpenTelemetrySpanSuccess,
    markFailure: markOpenTelemetrySpanFailure,
    getRuntimeAttributes:
      options?.getRuntimeAttributes ??
      (input =>
        getOpenTelemetryRuntimeAttributes({
          ...input,
        })),
  });
