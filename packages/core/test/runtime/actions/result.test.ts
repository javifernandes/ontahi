import { describe, expect, it } from 'vitest';

import { getActionErrorMessage, hasActionError } from '../../../src/runtime/actions/result.js';

describe('action result helpers', () => {
  it('prefers explicit server errors over validation errors', () => {
    expect(
      getActionErrorMessage({
        serverError: 'Server said no',
        validationErrors: {
          formErrors: ['Validation failed'],
        },
      }),
    ).toBe('Server said no');
  });

  it('falls back to the first form error and then the first field error', () => {
    expect(
      getActionErrorMessage({
        validationErrors: {
          formErrors: ['Form level issue'],
          fieldErrors: {
            body: ['Field issue'],
          },
        },
      }),
    ).toBe('Form level issue');

    expect(
      getActionErrorMessage({
        validationErrors: {
          formErrors: [],
          fieldErrors: {
            body: ['Field issue'],
          },
        },
      }),
    ).toBe('Field issue');
  });

  it('uses the provided fallback when no usable errors exist', () => {
    expect(
      getActionErrorMessage(
        {
          validationErrors: {
            formErrors: [],
            fieldErrors: {
              body: [],
            },
          },
        },
        'Fallback message',
      ),
    ).toBe('Fallback message');
  });

  it('detects when an action result contains a server or validation error', () => {
    expect(hasActionError({ serverError: 'nope' })).toBe(true);
    expect(hasActionError({ validationErrors: { formErrors: ['bad'] } })).toBe(true);
    expect(hasActionError({ thrownError: new Error('boom') })).toBe(true);
    expect(hasActionError({ data: { ok: true } })).toBe(false);
    expect(hasActionError({})).toBe(false);
  });

  it('uses thrownError as a fallback failure message', () => {
    expect(
      getActionErrorMessage(
        {
          thrownError: new Error('Boom'),
        },
        'Fallback message',
      ),
    ).toBe('Boom');
  });
});
