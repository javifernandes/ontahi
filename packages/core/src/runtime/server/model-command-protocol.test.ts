import { expect, it, vi } from 'vitest';

import { submitModelCommandProtocol } from './model-command-protocol.js';
import type { ModelCommandRuntime } from './model-command.js';
import { ModelInterpretationError } from './model-interpretation.js';

const request = {
  version: 1,
  kind: 'model-command',
  text: 'create list Today',
  language: 'en-US',
} as const;

it('adapts the model runtime to the protocol and forwards cancellation', async () => {
  const controller = new AbortController();
  const submit = vi.fn(async () => ({
    status: 'executed' as const,
    message: 'List created.',
    request: { kind: 'invoke' as const, operationId: 'TodoList.create', input: { name: 'Today' } },
  }));

  await expect(
    submitModelCommandProtocol({ submit } as ModelCommandRuntime, request, controller.signal),
  ).resolves.toEqual({
    version: 1,
    kind: 'model-command-result',
    result: {
      status: 'executed',
      message: 'List created.',
      request: { kind: 'invoke', operationId: 'TodoList.create', input: { name: 'Today' } },
    },
  });
  expect(submit).toHaveBeenCalledWith(
    { text: 'create list Today', language: 'en-US' },
    controller.signal,
  );
});

it('keeps expected model command failures inside the family response', async () => {
  const runtime = {
    submit: vi.fn(async () => {
      throw new ModelInterpretationError('command_unauthorized', 'Sign in first.');
    }),
  } as unknown as ModelCommandRuntime;

  await expect(submitModelCommandProtocol(runtime, request)).resolves.toEqual({
    version: 1,
    kind: 'protocol-error',
    error: { code: 'command_unauthorized', message: 'Sign in first.' },
  });
});
