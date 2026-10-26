import { describe, expect, it } from 'vitest';

import { admitModelResourceAttempt, withModelResourceLimits } from './resource-governance.js';

describe('model Resource governance', () => {
  it('shares one attempt counter and only narrows nested limits', () => {
    withModelResourceLimits({ maxAttempts: 2, maxOutputTokens: 1_024 }, () =>
      withModelResourceLimits({ maxAttempts: 5, maxOutputTokens: 256 }, () => {
        expect(admitModelResourceAttempt()).toEqual({
          attempt: 1,
          maxAttempts: 2,
          maxOutputTokens: 256,
        });
        expect(admitModelResourceAttempt()).toEqual({
          attempt: 2,
          maxAttempts: 2,
          maxOutputTokens: 256,
        });
        expect(() => admitModelResourceAttempt()).toThrowError(
          expect.objectContaining({
            code: 'model_resource_exhausted',
            message: 'Model generation attempt limit exhausted (2).',
          }),
        );
      }),
    );
  });

  it('does not create policy or accounting state unless a host supplies limits', () => {
    expect(admitModelResourceAttempt()).toBeUndefined();
  });

  it.each([
    [{ maxAttempts: 0 }, 'maxAttempts'],
    [{ maxAttempts: 1.5 }, 'maxAttempts'],
    [{ maxOutputTokens: -1 }, 'maxOutputTokens'],
  ])('rejects an invalid host limit: %j', (limits, name) => {
    expect(() => withModelResourceLimits(limits, () => undefined)).toThrow(
      `${name} must be a positive integer.`,
    );
  });
});
