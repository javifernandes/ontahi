import { describe, expect, it } from 'vitest';

import { cloneJson, isJsonValue } from '../../src/value/json.js';

describe('isJsonValue', () => {
  it('accepts finite, nested JSON values', () => {
    expect(isJsonValue({ rows: [{ id: 1 }], next: null })).toBe(true);
  });

  it.each([undefined, Number.POSITIVE_INFINITY, new Date(0), () => undefined])(
    'rejects non-JSON value %s',
    value => {
      expect(isJsonValue(value)).toBe(false);
    },
  );

  it('rejects cyclic values', () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(isJsonValue(value)).toBe(false);
  });
});

describe('cloneJson', () => {
  it('returns a detached JSON value', () => {
    const value = { rows: [{ id: 1 }] };
    const cloned = cloneJson(value);

    expect(cloned).toEqual(value);
    expect(cloned).not.toBe(value);
    expect(cloned.rows).not.toBe(value.rows);
  });

  it('rejects values JSON serialization would silently alter', () => {
    expect(() => cloneJson({ missing: undefined })).toThrow(
      'Expected a finite, acyclic JSON value.',
    );
  });
});
