import { createRuntimeProtocolResponse } from '@ontahi/core/runtime/protocol';
import { afterEach, expect, it, vi } from 'vitest';

import { createModelCommandSubmitter, submitModelCommand } from './model-commands.js';

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

it('submits through the model.command Runtime Protocol family', async () => {
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'answered', message: 'You can create lists.' },
    }),
  );
  const submit = createModelCommandSubmitter({ request });

  await expect(submit({ text: 'What can I do?', language: 'en-US' })).resolves.toEqual({
    ok: true,
    value: { status: 'answered', message: 'You can create lists.' },
  });
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]![0]).toMatchObject({
    family: 'model.command',
    body: {
      version: 1,
      kind: 'model-command',
      text: 'What can I do?',
      language: 'en-US',
    },
  });
});

it('preserves an expected model command failure from the protocol family', async () => {
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'protocol-error',
      error: { code: 'command_unauthorized', message: 'Sign in first.' },
    }),
  );
  const submit = createModelCommandSubmitter({ request });

  await expect(submit({ text: 'delete everything' })).resolves.toEqual({
    ok: false,
    message: 'Sign in first.',
  });
});
