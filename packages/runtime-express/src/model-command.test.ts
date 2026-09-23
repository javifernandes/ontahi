import type { AddressInfo } from 'node:net';

import { createInMemoryDataGraphStorage, field } from '@ontahi/core/data-graph';
import {
  entity,
  ontahi,
  getCurrentInvocationContext,
  ModelInterpretationError,
} from '@ontahi/core/runtime/server';
import express from 'express';
import { expect, it, vi } from 'vitest';

import { ontahiExpress } from './application.js';

it('mounts the runtime entry with request authority and no domain wrapper', async () => {
  const Document = entity({ name: 'Document', fields: { id: field.id() } });
  const application = ontahi({
    entities: [Document],
    storage: createInMemoryDataGraphStorage({ dataset: { Document: [] } }),
  });
  const submit = vi.fn(async (request, signal) => {
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(getCurrentInvocationContext()?.principal?.subject).toBe('reader');
    if (request.text === 'deny')
      throw new ModelInterpretationError('command_unauthorized', 'Denied');
    return { status: 'unresolved' as const, message: 'Which document?' };
  });
  const app = express();
  app.use(
    ontahiExpress(application, {
      modelCommands: { runtime: { submit } },
      invocationContext: () => ({ principal: { subject: 'reader', kind: 'user' } }),
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/model/commands`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'rename' }),
    });
    expect(await response.json()).toEqual({
      ok: true,
      value: { status: 'unresolved', message: 'Which document?' },
    });
    expect(submit.mock.calls[0]![0]).toEqual({ text: 'rename' });
    const denied = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'deny' }),
    });
    expect(denied.status).toBe(403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
});
