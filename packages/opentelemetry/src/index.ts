import {
  createServerRuntimeTelemetryAdapter,
  type ServerRuntimeTelemetryAdapter,
} from '@ontahi/core/runtime/server';
import { toError, toErrorMessage } from '@ontahi/core/value/error';
import {
  SpanStatusCode,
  trace,
  type AttributeValue,
  type Span,
  type SpanOptions,
} from '@opentelemetry/api';

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

type WritableSpan = Pick<Span, 'recordException' | 'setAttributes' | 'setStatus'>;

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

const toTelemetryAttributeValue = (value: TelemetryAttributeInput): AttributeValue | undefined => {
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

export const sanitizeTelemetryAttributes = (
  attributes?: Record<string, unknown>,
): Record<string, AttributeValue> => {
  const sanitized: Record<string, AttributeValue> = {};

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
): Record<string, AttributeValue> =>
  Object.fromEntries(
    Object.entries(sanitizeTelemetryAttributes(attributes)).map(([key, value]) => [
      `${prefix}.${key}`,
      value,
    ]),
  );

export const getActiveTraceMetadata = (): { traceId?: string; spanId?: string } => {
  const context = trace.getActiveSpan()?.spanContext();
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
}): Record<string, AttributeValue> => ({
  'ontahi.scope': input.scope,
  'ontahi.runtime': input.runtime,
  ...prefixTelemetryAttributes('ontahi.input', input.input),
  ...prefixTelemetryAttributes('ontahi.extra', input.extra),
  ...sanitizeTelemetryAttributes(input.attributes),
});

export const markOpenTelemetrySpanSuccess = (
  span: unknown,
  attributes?: Record<string, unknown>,
): void => {
  (span as WritableSpan | undefined)?.setAttributes({
    'ontahi.outcome': 'success',
    ...sanitizeTelemetryAttributes(attributes),
  });
};

export const markOpenTelemetrySpanFailure = (
  span: unknown,
  kind: string,
  attributes?: Record<string, unknown>,
): void => {
  const writableSpan = span as WritableSpan | undefined;
  writableSpan?.setAttributes({
    'ontahi.outcome': 'failure',
    'ontahi.failure.kind': kind,
    ...sanitizeTelemetryAttributes(attributes),
  });
  writableSpan?.setStatus({
    code: SpanStatusCode.ERROR,
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
  tracerName = 'ontahi.server',
): Promise<TValue> =>
  trace
    .getTracer(tracerName)
    .startActiveSpan(name, (options.spanOptions ?? {}) as SpanOptions, async span => {
      const attributes = sanitizeTelemetryAttributes(options.attributes);
      if (Object.keys(attributes).length > 0) {
        span.setAttributes(attributes);
      }

      try {
        return await fn(span);
      } catch (error) {
        span.recordException(toError(error));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: toErrorMessage(error),
        });
        throw error;
      } finally {
        span.end();
      }
    });

export const createOpenTelemetryServerRuntimeTelemetryAdapter = (options?: {
  tracerName?: string;
  getRuntimeAttributes?: ServerRuntimeTelemetryAdapter['getRuntimeAttributes'];
}): ServerRuntimeTelemetryAdapter =>
  createServerRuntimeTelemetryAdapter({
    withSpan: (name, spanOptions, fn) =>
      withOpenTelemetryServerSpan(name, spanOptions, fn, options?.tracerName),
    markSuccess: markOpenTelemetrySpanSuccess,
    markFailure: markOpenTelemetrySpanFailure,
    getRuntimeAttributes: options?.getRuntimeAttributes ?? getOpenTelemetryRuntimeAttributes,
  });
