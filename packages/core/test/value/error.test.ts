import { describe, expect, it } from 'vitest';

import { isError, toError, toErrorMessage } from '../../src/value/error.js';

describe('isError', () => {
  it('returns true for Error instances', () => {
    expect(isError(new Error('boom'))).toBe(true);
  });

  it('returns false for non-errors', () => {
    expect(isError({ message: 'boom' })).toBe(false);
  });
});

describe('toErrorMessage', () => {
  it('returns the error message for Error instances', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the original string when given one', () => {
    expect(toErrorMessage('boom')).toBe('boom');
  });

  it('uses the fallback for non-error values when provided', () => {
    expect(toErrorMessage({ boom: true }, 'Unknown error')).toBe('Unknown error');
  });

  it('stringifies non-error values when no fallback is provided', () => {
    expect(toErrorMessage({ boom: true })).toBe('[object Object]');
  });
});

describe('toError', () => {
  it('returns the same Error instance', () => {
    const error = new Error('boom');

    expect(toError(error)).toBe(error);
  });

  it('wraps non-error values in an Error', () => {
    expect(toError('boom')).toEqual(new Error('boom'));
  });
});
