import {
  createRuntimeProtocolResponse,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { afterEach, expect, it, vi } from 'vitest';

import {
  createModelCommandResponder,
  createModelCommandSubmitter,
  submitModelCommand,
} from './model-commands.js';

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

it('observes a started Operation before reporting the model command as executed', async () => {
  const run = { taskId: 'TodoList.completeAll', runId: 'complete-all-1' };
  const invocation = {
    kind: 'invoke' as const,
    operationId: 'TodoList.completeAll',
    input: {
      list: { kind: 'entity-ref' as const, entityName: 'TodoList', locator: { id: 'inbox' } },
    },
  };
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'started', message: 'List items completed.', request: invocation, run },
    }),
  );
  const observe = vi.fn(async function* () {
    yield {
      ...run,
      status: 'running' as const,
      updatedAt: '2026-09-29T00:00:00.000Z',
    };
    yield {
      ...run,
      status: 'completed' as const,
      updatedAt: '2026-09-29T00:00:01.000Z',
      result: { completed: 2 },
    };
  });
  const submit = createModelCommandSubmitter({
    request,
    durableOperation: { observe },
  } as unknown as RuntimeTransport);

  await expect(submit({ text: 'Complete Inbox' })).resolves.toEqual({
    ok: true,
    value: {
      status: 'executed',
      message: 'List items completed.',
      request: invocation,
    },
  });
  expect(observe).toHaveBeenCalledWith(run);
});

it('reports every non-completing started Operation outcome without resubmitting', async () => {
  const run = { taskId: 'TodoList.completeAll', runId: 'complete-all-2' };
  const invocation = {
    kind: 'invoke' as const,
    operationId: 'TodoList.completeAll',
    input: {},
  };
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'started', message: 'Started.', request: invocation, run },
    }),
  );
  const submitWith = (observe?: () => AsyncIterable<unknown>) =>
    createModelCommandSubmitter({
      request,
      ...(observe ? { durableOperation: { observe } } : {}),
    } as unknown as RuntimeTransport)({ text: 'Complete Inbox' });

  await expect(submitWith()).resolves.toEqual({
    ok: false,
    message: 'The configured Runtime Transport cannot observe this run.',
  });
  await expect(
    submitWith(async function* () {
      yield {
        ...run,
        status: 'running',
        updatedAt: '2026-09-29T00:00:00.000Z',
        interaction: { id: 'approval' },
      };
    }),
  ).resolves.toMatchObject({
    ok: false,
    message: expect.stringContaining('requires an interaction'),
  });
  await expect(
    submitWith(async function* () {
      yield {
        ...run,
        status: 'failed',
        updatedAt: '2026-09-29T00:00:00.000Z',
        error: { code: 'failed', message: 'Update failed.' },
      };
    }),
  ).resolves.toEqual({ ok: false, message: 'Update failed.' });
  await expect(submitWith(async function* () {})).resolves.toMatchObject({
    ok: false,
    message: expect.stringContaining('ended before completion'),
  });
  await expect(
    submitWith(async function* () {
      throw new Error('socket closed');
    }),
  ).resolves.toMatchObject({
    ok: false,
    message: expect.stringContaining('started, but its completion could not be observed'),
  });
});

it('responds through durable.operation and observes the model Task to completion', async () => {
  const run = { taskId: 'ontahi.model-command', runId: 'run-1' };
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'snapshot',
      snapshot: {
        ...run,
        status: 'running',
        updatedAt: '2026-09-29T00:00:00.000Z',
      },
    }),
  );
  const observe = vi.fn(async function* () {
    yield {
      ...run,
      status: 'completed' as const,
      updatedAt: '2026-09-29T00:00:01.000Z',
      result: {
        status: 'executed',
        message: 'List renamed.',
        request: { kind: 'invoke', operationId: 'TodoList.rename', input: { name: 'Today' } },
      },
    };
  });
  const respond = createModelCommandResponder({
    request,
    durableOperation: { observe },
  } as unknown as RuntimeTransport);

  await expect(
    respond(run, { interactionId: 'approve-model-command', decision: 'approve' }),
  ).resolves.toEqual({
    ok: true,
    value: {
      status: 'executed',
      message: 'List renamed.',
      request: { kind: 'invoke', operationId: 'TodoList.rename', input: { name: 'Today' } },
    },
  });
  expect(request.mock.calls[0]![0]).toMatchObject({
    family: 'durable.operation',
    body: {
      kind: 'respond',
      run,
      response: { interactionId: 'approve-model-command', decision: 'approve' },
    },
  });
  expect(observe).toHaveBeenCalledWith(run);
});

it('returns a pending follow-up interaction directly from the durable response', async () => {
  const run = { taskId: 'ontahi.model-command', runId: 'run-2' };
  const interaction = {
    id: 'approve-again',
    kind: 'approval' as const,
    prompt: 'Approve the revised proposal?',
    proposal: { id: 'proposal-2', summary: 'Apply revision.', requests: [{ kind: 'revision' }] },
    createdAt: '2026-09-29T00:00:00.000Z',
  };
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'snapshot',
      snapshot: {
        ...run,
        status: 'running',
        updatedAt: '2026-09-29T00:00:00.000Z',
        interaction,
      },
    }),
  );

  await expect(
    createModelCommandResponder({ request })(run, {
      interactionId: 'approve-model-command',
      decision: 'approve',
    }),
  ).resolves.toEqual({
    ok: true,
    value: { status: 'pending', message: interaction.prompt, run, interaction },
  });
});

it('reports unavailable or exhausted durable observation', async () => {
  const run = { taskId: 'ontahi.model-command', runId: 'run-3' };
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'snapshot',
      snapshot: {
        ...run,
        status: 'running',
        updatedAt: '2026-09-29T00:00:00.000Z',
      },
    }),
  );
  const response = { interactionId: 'approve-model-command', decision: 'reject' as const };

  await expect(createModelCommandResponder({ request })(run, response)).resolves.toMatchObject({
    ok: false,
    message: expect.stringContaining('cannot observe'),
  });
  await expect(
    createModelCommandResponder({
      request,
      durableOperation: { observe: async function* () {} },
    })(run, response),
  ).resolves.toMatchObject({ ok: false, message: expect.stringContaining('ended') });
});

it('preserves expected durable protocol errors and legacy HTTP failures', async () => {
  const run = { taskId: 'ontahi.model-command', runId: 'run-4' };
  const request = vi.fn(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      kind: 'protocol-error',
      error: { code: 'access_denied', message: 'Approval denied.' },
    }),
  );
  await expect(
    createModelCommandResponder({ request })(run, {
      interactionId: 'approve-model-command',
      decision: 'approve',
    }),
  ).resolves.toEqual({ ok: false, message: 'Approval denied.' });

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ ok: false, message: 'Model unavailable.' }) })),
  );
  await expect(submitModelCommand({ text: 'rename list' })).resolves.toEqual({
    ok: false,
    message: 'Model unavailable.',
  });
});
