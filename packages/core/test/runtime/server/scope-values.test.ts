import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  failIfError,
  fromNullable,
  fromValueOrPromise,
  getDefaultDefectLogMessage,
  getDefaultDefectPublicMessage,
  getLayerScope,
} from '../../../src/runtime/server/index.js';

describe('server runtime scope and value helpers', () => {
  it('derives stable layer scopes from function names and options', () => {
    function fetchBookOperation() {
      return undefined;
    }

    expect(getLayerScope('features.books', fetchBookOperation)).toBe('features.books.fetchBook');
    expect(getLayerScope('features.books', () => undefined, { name: 'customReadOperation' })).toBe(
      'features.books.customRead',
    );
    expect(getLayerScope('features.books', fetchBookOperation, { scope: 'custom.scope' })).toBe(
      'custom.scope',
    );
    expect(() => getLayerScope('features.books', () => undefined)).toThrow(
      'Layered effect registration requires a stable function name',
    );
  });

  it('formats default defect messages from operation-like scopes', () => {
    expect(getDefaultDefectLogMessage('features.books.fetchBook')).toBe(
      'Unexpected failure in features.books.fetchBook',
    );
    expect(getDefaultDefectPublicMessage('features.books.fetchBookInfo')).toBe(
      'Failed to load book info',
    );
    expect(getDefaultDefectPublicMessage('features.books.toggleThreadState')).toBe(
      'Failed to update thread state',
    );
    expect(getDefaultDefectPublicMessage('features.conversations.replyThread')).toBe(
      'Failed to create reply',
    );
    expect(getDefaultDefectPublicMessage('features.books.fetch')).toBe('Failed to load');
    expect(getDefaultDefectPublicMessage('features.books.listAllBooksRead')).toBe(
      'Failed to load books',
    );
    expect(getDefaultDefectPublicMessage('features.books.replyThread')).toBe(
      'Failed to create reply',
    );
    expect(getDefaultDefectPublicMessage('features.books.archiveBook')).toBe(
      'Failed to archive book',
    );
  });

  it('converts nullable and error-bearing values into effects', async () => {
    await expect(Effect.runPromise(fromNullable('value', () => 'missing'))).resolves.toBe('value');
    await expect(Effect.runPromise(Effect.flip(fromNullable(null, () => 'missing')))).resolves.toBe(
      'missing',
    );
    await expect(Effect.runPromise(fromValueOrPromise(async () => 7))).resolves.toBe(7);
    await expect(
      Effect.runPromise(failIfError({ data: 1, error: null }, error => new Error(String(error)))),
    ).resolves.toEqual({ data: 1, error: null });
    await expect(
      Effect.runPromise(Effect.flip(failIfError({ error: 'bad' }, error => ({ reason: error })))),
    ).resolves.toEqual({ reason: 'bad' });
  });
});
