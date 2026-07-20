import { describe, expect, it } from 'vitest';

import {
  prefixTelemetryAttributes,
  sanitizeTelemetryAttributes,
} from '../../../src/runtime/server/index.js';

describe('opentelemetry telemetry sanitization', () => {
  it('drops sensitive values and normalizes safe attributes', () => {
    const attributes = sanitizeTelemetryAttributes({
      workspaceId: 'ws_123',
      resultCount: 12,
      isPreview: true,
      query: 'reader private search',
      email: 'reader@example.com',
      authToken: 'secret-token',
      chapterText: 'this should never be attached',
      tags: ['alpha', 2, false, new Date('2026-04-05T00:00:00.000Z')],
    });

    expect(attributes).toEqual({
      workspaceId: 'ws_123',
      resultCount: 12,
      isPreview: true,
      tags: ['alpha', '2', 'false', '2026-04-05T00:00:00.000Z'],
    });
  });

  it('keeps safe query metrics while dropping raw query fields', () => {
    expect(
      sanitizeTelemetryAttributes({
        query: 'secret phrase',
        queryLength: 13,
        'bookops.search.query_length': 13,
        search_query: 'should drop',
      }),
    ).toEqual({
      queryLength: 13,
      'bookops.search.query_length': 13,
    });
  });

  it('prefixes only the sanitized attributes', () => {
    expect(
      prefixTelemetryAttributes('bookops.input', {
        workspaceId: 'ws_123',
        requestBody: 'raw-body',
      }),
    ).toEqual({
      'bookops.input.workspaceId': 'ws_123',
    });
  });
});
