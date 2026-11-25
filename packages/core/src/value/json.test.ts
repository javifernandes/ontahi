import { describe, expect, it } from 'vitest';

import { cloneJson, isJsonValue, stringifyCanonicalJson } from './json.js';

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

it('rejects sparse arrays without conflating holes with explicit JSON nulls', () => {
  const sparse = new Array(1);
  expect(isJsonValue(sparse)).toBe(false);
  expect(() => cloneJson(sparse)).toThrow(TypeError);
  expect(cloneJson([null])).toEqual([null]);
});

it('canonicalizes differently ordered keys including canonically equivalent Unicode spellings', () => {
  const composed = '\u00e9';
  const decomposed = 'e\u0301';
  expect(stringifyCanonicalJson({ [composed]: 1, [decomposed]: 2 })).toBe(
    stringifyCanonicalJson({ [decomposed]: 2, [composed]: 1 }),
  );
});
