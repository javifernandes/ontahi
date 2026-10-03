import { expect, it, vi } from 'vitest';

import { ModelInterpretationError } from '../interpretation.js';

import { submitModelCommandProtocol } from './protocol.js';
import type { ModelCommandRuntime } from './runtime.js';

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

it('forwards host context without inventing a language', async () => {
  const submit = vi.fn(async () => ({ status: 'answered' as const, message: 'Ready.' }));
  const contextualRequest = {
    version: 1,
    kind: 'model-command',
    text: 'help',
    context: { surface: 'devtools' },
  } as const;

  await expect(
    submitModelCommandProtocol({ submit } as ModelCommandRuntime, contextualRequest),
  ).resolves.toEqual({
    version: 1,
    kind: 'model-command-result',
    result: { status: 'answered', message: 'Ready.' },
  });
  expect(submit).toHaveBeenCalledWith(
    { text: 'help', context: { surface: 'devtools' } },
    expect.any(AbortSignal),
  );
});

it('does not convert unexpected runtime failures into protocol errors', async () => {
  const failure = new Error('provider crashed');
  const runtime = {
    submit: vi.fn(async () => {
      throw failure;
    }),
  } as unknown as ModelCommandRuntime;

  await expect(submitModelCommandProtocol(runtime, request)).rejects.toBe(failure);
});
