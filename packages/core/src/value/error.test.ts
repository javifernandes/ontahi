import { describe, expect, it } from 'vitest';

import { isError, toError, toErrorMessage, toSerializableErrorCause } from './error.js';

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

describe('toSerializableErrorCause', () => {
  it('serializes native Error chains without relying on enumerable properties', () => {
    const nested = new Error('Relation Trip.driver is invalid.');
    const outer = new Error('Failed to execute read.');
    outer.name = 'GraphReadError';
    Object.defineProperty(outer, 'cause', {
      configurable: true,
      value: nested,
    });

    expect(toSerializableErrorCause(outer)).toEqual({
      name: 'GraphReadError',
      message: 'Failed to execute read.',
      cause: {
        name: 'Error',
        message: 'Relation Trip.driver is invalid.',
      },
    });
  });

  it('preserves names and tags from error-like records', () => {
    expect(
      toSerializableErrorCause({
        name: 'DatabaseError',
        message: 'Database read failed.',
        cause: {
          _tag: 'SocketClosed',
          message: 'Connection reset.',
        },
      }),
    ).toEqual({
      name: 'DatabaseError',
      message: 'Database read failed.',
      cause: {
        name: 'SocketClosed',
        message: 'Connection reset.',
      },
    });
  });

  it('normalizes primitive, unknown, and circular causes safely', () => {
    expect(toSerializableErrorCause('offline')).toEqual({
      name: 'Error',
      message: 'offline',
    });
    expect(toSerializableErrorCause(503)).toEqual({
      name: 'Error',
      message: '503',
    });
    expect(toSerializableErrorCause({})).toEqual({
      name: 'Error',
      message: 'Unknown error',
    });

    const circular: { message: string; cause?: unknown } = { message: 'Recursive failure.' };
    circular.cause = circular;

    expect(toSerializableErrorCause(circular)).toEqual({
      name: 'Error',
      message: 'Recursive failure.',
      cause: {
        name: 'Error',
        message: '[Circular error cause]',
      },
    });
  });
});
