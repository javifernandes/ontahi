import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { layer, runServerOperation, operation } from './dsl.js';

describe('server dsl facade', () => {
  it('creates standard operation runners and exposes layer/run helpers', async () => {
    const readBook = operation(
      (input: { bookSlug: string }) => Effect.succeed({ title: input.bookSlug.toUpperCase() }),
      {
        scope: 'features.books.readBook',
      },
    );

    await expect(readBook({ bookSlug: 'progbook' })).resolves.toEqual({
      success: true,
      data: {
        title: 'PROGBOOK',
      },
    });
    expect(readBook.metadata.scope).toBe('features.books.readBook');
    expect(layer('features.books').prefix).toBe('features.books');
    expect(runServerOperation).toEqual(expect.any(Function));
  });
});
