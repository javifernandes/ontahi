import { isError, toErrorMessage } from '../../value/error.js';

import type { ServerRuntimeReportingAdapter } from './config-types.js';

export interface ServerReportOptions {
  scope?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  reportToSentry?: boolean;
}

type ServerReportSeverity = 'info' | 'warning' | 'error';

type TraceMetadata = {
  traceId?: string;
  spanId?: string;
};

export type SentryScopeLike = {
  setTag: (key: string, value: string) => void;
  setExtra: (key: string, value: unknown) => void;
  setLevel: (level: ServerReportSeverity) => void;
};

export type SentryLike = {
  withScope: (callback: (scope: SentryScopeLike) => void) => void;
  captureException: (error: unknown) => void;
  captureMessage: (message: string, severity: ServerReportSeverity) => void;
};

export type CreateSentryServerReportingToolsOptions = {
  sentry?: SentryLike | null;
  getActiveTraceMetadata?: () => TraceMetadata;
  hasSentryDsn?: () => boolean;
  console?: Pick<Console, 'error' | 'warn' | 'info'>;
};

const toSerializableDetails = (details: unknown, seen = new WeakSet<object>()): unknown => {
  if (details instanceof Error) {
    return toSerializableDetails(
      {
        name: details.name,
        message: details.message,
        stack: details.stack,
        cause: (details as Error & { cause?: unknown }).cause,
      },
      seen,
    );
  }

  if (details == null) {
    return undefined;
  }

  if (typeof details === 'bigint') {
    return details.toString();
  }

  if (typeof details === 'string' || typeof details === 'number' || typeof details === 'boolean') {
    return details;
  }

  if (Array.isArray(details)) {
    return details.map(item => toSerializableDetails(item, seen));
  }

  if (typeof details === 'object') {
    if (seen.has(details)) {
      return '[Circular]';
    }

    seen.add(details);
    return Object.fromEntries(
      Object.entries(details).map(([key, value]) => [key, toSerializableDetails(value, seen)]),
    );
  }

  return String(details);
};

const stringifyConsolePayload = (payload: Record<string, unknown>) => {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return JSON.stringify({
      level: payload.level ?? 'error',
      message: payload.message ?? 'Failed to serialize console payload',
      scope: payload.scope ?? null,
      traceId: payload.traceId ?? null,
      spanId: payload.spanId ?? null,
      details: {
        name: isError(error) ? error.name : 'SerializationError',
        message: toErrorMessage(error, 'Unknown console serialization failure'),
      },
    });
  }
};

export const createSentryServerReportingTools = (
  options: CreateSentryServerReportingToolsOptions = {},
) => {
  const sentry = options.sentry ?? null;
  const getTrace: () => TraceMetadata = options.getActiveTraceMetadata ?? (() => ({}));
  const hasSentryDsn =
    options.hasSentryDsn ??
    (() => Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN));
  const targetConsole = options.console ?? console;

  const withOptionalScope = (
    reportOptions: ServerReportOptions,
    callback: (scope: SentryScopeLike) => void,
  ) => {
    if (!hasSentryDsn() || !sentry) {
      return;
    }

    sentry.withScope(scope => {
      const trace = getTrace();

      if (reportOptions.scope) {
        scope.setTag('scope', reportOptions.scope);
      }

      if (trace.traceId) {
        scope.setTag('trace_id', trace.traceId);
        scope.setExtra('traceId', trace.traceId);
      }

      if (trace.spanId) {
        scope.setExtra('spanId', trace.spanId);
      }

      for (const [key, value] of Object.entries(reportOptions.tags ?? {})) {
        scope.setTag(key, value);
      }

      for (const [key, value] of Object.entries(reportOptions.extra ?? {})) {
        scope.setExtra(key, value);
      }

      callback(scope);
    });
  };

  const emitConsole = (
    severity: ServerReportSeverity,
    message: string,
    details: unknown,
    reportOptions: ServerReportOptions,
  ) => {
    const trace = getTrace();
    const serialized = stringifyConsolePayload({
      level: severity,
      message,
      scope: reportOptions.scope ?? null,
      traceId: trace.traceId ?? null,
      spanId: trace.spanId ?? null,
      details: toSerializableDetails(details) ?? null,
    });

    if (severity === 'error') {
      targetConsole.error(serialized);
      return;
    }

    if (severity === 'warning') {
      targetConsole.warn(serialized);
      return;
    }

    targetConsole.info(serialized);
  };

  const reportServer = (
    severity: ServerReportSeverity,
    message: string,
    details?: unknown,
    reportOptions: ServerReportOptions = {},
  ) => {
    emitConsole(severity, message, details, reportOptions);

    const shouldReportToSentry = reportOptions.reportToSentry ?? severity === 'error';
    if (!shouldReportToSentry || !sentry) {
      return;
    }

    withOptionalScope(reportOptions, scope => {
      scope.setLevel(severity);

      if (isError(details)) {
        sentry.captureException(details);
        return;
      }

      if (details !== undefined) {
        scope.setExtra('details', details);
      }

      sentry.captureMessage(message, severity);
    });
  };

  const reportServerError = (
    message: string,
    error?: unknown,
    reportOptions?: ServerReportOptions,
  ) => reportServer('error', message, error, reportOptions);

  const reportServerWarning = (
    message: string,
    warning?: unknown,
    reportOptions?: ServerReportOptions,
  ) => reportServer('warning', message, warning, reportOptions);

  const reportServerInfo = (
    message: string,
    details?: unknown,
    reportOptions?: ServerReportOptions,
  ) => reportServer('info', message, details, reportOptions);

  const createRuntimeAdapter = (): ServerRuntimeReportingAdapter => ({
    reportError: reportServerError,
    reportWarning: reportServerWarning,
  });

  return {
    reportServerError,
    reportServerWarning,
    reportServerInfo,
    createRuntimeAdapter,
  };
};
