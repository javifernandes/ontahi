import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSentryServerReportingTools } from '../../../src/runtime/server/index.js';

describe('sentry reporting adapter', () => {
  const sentryMocks = {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn(),
  };
  const consoleMocks = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  };
  const parseConsolePayload = (value: unknown) =>
    JSON.parse(String(value)) as Record<string, unknown>;

  const createReporting = () =>
    createSentryServerReportingTools({
      sentry: sentryMocks,
      hasSentryDsn: () => true,
      getActiveTraceMetadata: () => ({
        traceId: 'trace-1',
        spanId: 'span-1',
      }),
      console: consoleMocks,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    sentryMocks.withScope.mockImplementation(callback => {
      callback({
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setLevel: vi.fn(),
      });
    });
  });

  it('reports errors to console and Sentry exception capture', () => {
    const reporting = createReporting();
    const error = new Error('boom');

    reporting.reportServerError('Failed to process request', error, { scope: 'tests' });

    expect(consoleMocks.error).toHaveBeenCalledTimes(1);
    expect(parseConsolePayload(consoleMocks.error.mock.calls[0]?.[0])).toMatchObject({
      level: 'error',
      message: 'Failed to process request',
      scope: 'tests',
      traceId: 'trace-1',
      spanId: 'span-1',
      details: {
        name: 'Error',
        message: 'boom',
        stack: expect.stringContaining('boom'),
      },
    });
    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it('does not report warnings to Sentry by default', () => {
    const reporting = createReporting();

    reporting.reportServerWarning('warning message');

    expect(consoleMocks.warn).toHaveBeenCalledTimes(1);
    expect(parseConsolePayload(consoleMocks.warn.mock.calls[0]?.[0])).toMatchObject({
      level: 'warning',
      message: 'warning message',
      traceId: 'trace-1',
      spanId: 'span-1',
    });
    expect(sentryMocks.withScope).not.toHaveBeenCalled();
    expect(sentryMocks.captureMessage).not.toHaveBeenCalled();
  });

  it('reports warnings to Sentry when explicitly requested', () => {
    const reporting = createReporting();

    reporting.reportServerWarning('warning message', { reason: 'test' }, { reportToSentry: true });

    expect(consoleMocks.warn).toHaveBeenCalledTimes(1);
    expect(parseConsolePayload(consoleMocks.warn.mock.calls[0]?.[0])).toMatchObject({
      level: 'warning',
      message: 'warning message',
      details: { reason: 'test' },
      traceId: 'trace-1',
      spanId: 'span-1',
    });
    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureMessage).toHaveBeenCalledWith('warning message', 'warning');
  });

  it('does not report info to Sentry by default', () => {
    const reporting = createReporting();

    reporting.reportServerInfo('informational');

    expect(consoleMocks.info).toHaveBeenCalledTimes(1);
    expect(parseConsolePayload(consoleMocks.info.mock.calls[0]?.[0])).toMatchObject({
      level: 'info',
      message: 'informational',
      traceId: 'trace-1',
      spanId: 'span-1',
    });
    expect(sentryMocks.withScope).not.toHaveBeenCalled();
  });

  it('serializes circular objects and bigint values without throwing', () => {
    const reporting = createReporting();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    reporting.reportServerInfo('structured payload', {
      circular,
      count: 4n,
    });

    expect(consoleMocks.info).toHaveBeenCalledTimes(1);
    expect(parseConsolePayload(consoleMocks.info.mock.calls[0]?.[0])).toMatchObject({
      level: 'info',
      message: 'structured payload',
      traceId: 'trace-1',
      spanId: 'span-1',
      details: {
        circular: {
          self: '[Circular]',
        },
        count: '4',
      },
    });
  });

  it('does not attempt sentry reporting when DSN is unavailable', () => {
    const reporting = createSentryServerReportingTools({
      sentry: sentryMocks,
      hasSentryDsn: () => false,
      console: consoleMocks,
    });

    reporting.reportServerError('No DSN', new Error('boom'));

    expect(consoleMocks.error).toHaveBeenCalledTimes(1);
    expect(sentryMocks.withScope).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it('reports non-error details as sentry messages and exposes runtime adapter methods', () => {
    const setTag = vi.fn();
    const setExtra = vi.fn();
    const setLevel = vi.fn();
    sentryMocks.withScope.mockImplementation(callback => {
      callback({ setTag, setExtra, setLevel });
    });

    const reporting = createReporting();
    const runtimeAdapter = reporting.createRuntimeAdapter();

    runtimeAdapter.reportError(
      'Structured failure',
      { reason: 'bad input' },
      {
        scope: 'tests',
        extra: { chapterId: 'chapter-1' },
      },
    );

    expect(setLevel).toHaveBeenCalledWith('error');
    expect(setTag).toHaveBeenCalledWith('scope', 'tests');
    expect(setExtra).toHaveBeenCalledWith('chapterId', 'chapter-1');
    expect(setExtra).toHaveBeenCalledWith('details', { reason: 'bad input' });
    expect(sentryMocks.captureMessage).toHaveBeenCalledWith('Structured failure', 'error');
  });
});
