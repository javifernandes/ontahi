import { describe, expect, it } from 'vitest';

import { graphVoid } from '../../value/schema/authoring.js';

import { toZodUnknownGraphSchema } from './zod.js';

describe('toZodUnknownGraphSchema', () => {
  it('accepts the portable void definition', () => {
    expect(toZodUnknownGraphSchema(graphVoid()).safeParse(undefined)).toEqual({
      success: true,
      data: undefined,
    });
  });

  it('rejects unsupported definitions', () => {
    expect(() => toZodUnknownGraphSchema({ kind: 'unsupported' })).toThrow(
      'Unsupported graph schema definition.',
    );
  });
});
