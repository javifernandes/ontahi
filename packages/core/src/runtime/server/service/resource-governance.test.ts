import { describe, expect, it } from 'vitest';

import { admitServiceResourceAttempt, withServiceResourceLimits } from './resource-governance.js';

describe('service Resource governance', () => {
  it('accounts independently by Resource identity', () => {
    withServiceResourceLimits('paid-catalog', { maxAttempts: 1 }, () =>
      withServiceResourceLimits('shipping', { maxAttempts: 2 }, () => {
        expect(admitServiceResourceAttempt('paid-catalog')).toEqual({
          attempt: 1,
          maxAttempts: 1,
        });
        expect(admitServiceResourceAttempt('shipping')).toEqual({
          attempt: 1,
          maxAttempts: 2,
        });
        expect(() => admitServiceResourceAttempt('paid-catalog')).toThrowError(
          expect.objectContaining({
            code: 'service_resource_exhausted',
            resourceId: 'paid-catalog',
          }),
        );
      }),
    );
  });

  it('shares accounting and only narrows nested limits for one Resource', () => {
    withServiceResourceLimits('paid-catalog', { maxAttempts: 3 }, () =>
      withServiceResourceLimits('paid-catalog', { maxAttempts: 2 }, () => {
        expect(admitServiceResourceAttempt('paid-catalog')?.attempt).toBe(1);
        expect(admitServiceResourceAttempt('paid-catalog')?.attempt).toBe(2);
        expect(() => admitServiceResourceAttempt('paid-catalog')).toThrow(
          'Service Resource "paid-catalog" attempt limit exhausted (2).',
        );
      }),
    );
  });

  it('does not create policy or accounting state unless a host supplies limits', () => {
    expect(admitServiceResourceAttempt('paid-catalog')).toBeUndefined();
  });

  it.each([0, 1.5, -1])('rejects an invalid host limit: %s', maxAttempts => {
    expect(() =>
      withServiceResourceLimits('paid-catalog', { maxAttempts }, () => undefined),
    ).toThrow('maxAttempts must be a positive integer.');
  });
});
