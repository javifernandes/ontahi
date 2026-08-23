import { describe, expect, it, vi } from 'vitest';

import {
  createOpenTelemetryServerRuntimeTelemetryAdapter,
  getActiveTraceMetadata,
  getOpenTelemetryRuntimeAttributes,
  markOpenTelemetrySpanFailure,
  markOpenTelemetrySpanSuccess,
  prefixTelemetryAttributes,
  sanitizeTelemetryAttributes,
  withOpenTelemetryServerSpan,
} from './index.js';

describe('OpenTelemetry adapter', () => {
  it('drops sensitive values and normalizes safe attributes', () => {
    const attributes = sanitizeTelemetryAttributes({
      workspaceId: 'ws_123',
      resultCount: 12,
      isPreview: true,
      query: 'reader private search',
      email: 'reader@example.com',
      authToken: 'secret-token',
      chapterText: 'this should never be attached',
      empty: null,
      tags: ['alpha', 2, false, new Date('2026-04-05T00:00:00.000Z')],
    });

    expect(attributes).toEqual({
      workspaceId: 'ws_123',
      resultCount: 12,
      isPreview: true,
      tags: ['alpha', '2', 'false', '2026-04-05T00:00:00.000Z'],
    });
  });

  it('truncates long strings and keeps safe query metrics', () => {
    expect(
      sanitizeTelemetryAttributes({
        query: 'secret phrase',
        queryLength: 13,
        search_query: 'should drop',
        summary: 'x'.repeat(130),
      }),
    ).toEqual({
      queryLength: 13,
      summary: `${'x'.repeat(120)}...`,
    });
  });

  it('prefixes sanitized attributes with the Ontahi namespace', () => {
    expect(
      prefixTelemetryAttributes('ontahi.input', {
        workspaceId: 'ws_123',
        requestBody: 'raw-body',
      }),
    ).toEqual({
      'ontahi.input.workspaceId': 'ws_123',
    });
  });

  it('builds vendor-neutral runtime attributes', () => {
    expect(
      getOpenTelemetryRuntimeAttributes({
        scope: 'books.load',
        runtime: 'operation',
        input: { bookId: 'book-1' },
        extra: { cached: false },
        attributes: { attempts: 2 },
      }),
    ).toEqual({
      'ontahi.scope': 'books.load',
      'ontahi.runtime': 'operation',
      'ontahi.input.bookId': 'book-1',
      'ontahi.extra.cached': false,
      attempts: 2,
    });
  });

  it('marks successful and failed spans with Ontahi outcomes', () => {
    const setAttributes = vi.fn();
    const setStatus = vi.fn();
    const span = { setAttributes, setStatus };

    markOpenTelemetrySpanSuccess(span, { count: 3 });
    markOpenTelemetrySpanFailure(span, 'invalid_input', { fieldCount: 1 });

    expect(setAttributes).toHaveBeenNthCalledWith(1, {
      'ontahi.outcome': 'success',
      count: 3,
    });
    expect(setAttributes).toHaveBeenNthCalledWith(2, {
      'ontahi.outcome': 'failure',
      'ontahi.failure.kind': 'invalid_input',
      fieldCount: 1,
    });
    expect(setStatus).toHaveBeenCalledWith({ code: 2, message: 'invalid_input' });
  });

  it('runs callbacks through the API no-op tracer when no SDK is registered', async () => {
    await expect(
      withOpenTelemetryServerSpan('test.operation', { attributes: { count: 1 } }, () => 'ok'),
    ).resolves.toBe('ok');
  });

  it('returns no active trace metadata when the host has not registered a context', () => {
    expect(getActiveTraceMetadata()).toEqual({});
  });

  it('preserves callback failures when no SDK is registered', async () => {
    await expect(
      withOpenTelemetryServerSpan('test.operation', {}, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('creates an Ontahi runtime telemetry adapter', () => {
    const adapter = createOpenTelemetryServerRuntimeTelemetryAdapter();

    expect(
      adapter.getRuntimeAttributes({
        scope: 'tasks.start',
        runtime: 'effect',
      }),
    ).toEqual({
      'ontahi.scope': 'tasks.start',
      'ontahi.runtime': 'effect',
    });
  });
});
