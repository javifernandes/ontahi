import { afterEach, expect, it, vi } from 'vitest';

import { submitModelCommand } from './model-commands.js';

afterEach(() => vi.unstubAllGlobals());
it('accepts an informational answer from the HTTP runtime', async () => {
  const result = { ok: true, value: { status: 'answered', message: 'You can create lists.' } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => result })),
  );
  expect(await submitModelCommand({ text: 'What can I do?' })).toEqual(result);
});
it('rejects an unknown result status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({ ok: true, value: { status: 'unknown', message: 'Done' } }),
    })),
  );
  await expect(submitModelCommand({ text: 'What can I do?' })).rejects.toThrow(
    'Invalid model command response.',
  );
});
