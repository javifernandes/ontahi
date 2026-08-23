import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  boundedPositiveInteger,
  id,
  index,
  integer,
  nonEmptyString,
  nonNegativeInteger,
  nullable,
  optionalNullable,
  positiveIntegerSchema,
  slug,
} from './zod.js';

describe('model zod primitives', () => {
  it('accepts non-empty identifiers and rejects empty strings', () => {
    expect(nonEmptyString.parse('bookops')).toBe('bookops');
    expect(id.parse('book-1')).toBe('book-1');
    expect(slug.parse('programming-101')).toBe('programming-101');
    expect(() => nonEmptyString.parse('')).toThrow(z.ZodError);
  });

  it('validates integer ranges used by model inputs', () => {
    expect(integer.parse(0)).toBe(0);
    expect(nonNegativeInteger.parse(0)).toBe(0);
    expect(positiveIntegerSchema.parse(1)).toBe(1);
    expect(index.parse(1)).toBe(1);
    expect(boundedPositiveInteger(3).parse(3)).toBe(3);

    expect(() => integer.parse(1.5)).toThrow(z.ZodError);
    expect(() => nonNegativeInteger.parse(-1)).toThrow(z.ZodError);
    expect(() => positiveIntegerSchema.parse(0)).toThrow(z.ZodError);
    expect(() => boundedPositiveInteger(3).parse(4)).toThrow(z.ZodError);
  });

  it('builds nullable and optional nullable wrappers', () => {
    const nullableString = nullable(z.string());
    const optionalNullableString = optionalNullable(z.string());

    expect(nullableString.parse(null)).toBeNull();
    expect(nullableString.parse('value')).toBe('value');
    expect(optionalNullableString.parse(undefined)).toBeUndefined();
    expect(optionalNullableString.parse(null)).toBeNull();
    expect(optionalNullableString.parse('value')).toBe('value');
  });
});
