import { describe, expect, it } from 'vitest';

import { hasOwn, isPlainObject, isRecord, mapRecordAsync } from './object.js';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({ ok: true })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRecord(['a'])).toBe(false);
  });
});

describe('hasOwn', () => {
  it('distinguishes declared properties from inherited properties', () => {
    const record = Object.create({ inherited: true }) as Record<string, unknown>;
    record.declared = true;

    expect(hasOwn(record, 'declared')).toBe(true);
    expect(hasOwn(record, 'inherited')).toBe(false);
    expect(hasOwn({}, 'constructor')).toBe(false);
  });
});

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({ ok: true })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isPlainObject(['a'])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });
});

describe('mapRecordAsync', () => {
  it('maps all record values and preserves keys', async () => {
    const result = await mapRecordAsync({ first: 1, second: 2 }, async value => value * 10);

    expect(result).toEqual({ first: 10, second: 20 });
  });

  it('passes the key to the async mapper', async () => {
    const result = await mapRecordAsync(
      { alpha: 'a', beta: 'b' },
      async (value, key) => `${String(key)}:${value}`,
    );

    expect(result).toEqual({ alpha: 'alpha:a', beta: 'beta:b' });
  });
});
