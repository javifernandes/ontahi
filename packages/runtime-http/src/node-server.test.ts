import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { OperationInvocationDispatcher } from '@ontahi/core/runtime/operation-invocation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeHttpIngressServer, createNodeHttpServer } from './node-server.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))),
  );
});

const listen = async (server: Server) => {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

describe('Node HTTP server adapter', () => {
  it('hosts Ontahi ingress without Express and preserves the raw provider request', async () => {
    let receivedBody: string | undefined;
    const dispatcher = vi.fn<OperationInvocationDispatcher>(async () => ({
      kind: 'invocation-result',
      result: { ok: true, kind: 'success', value: undefined },
    }));
    const origin = await listen(
      createNodeHttpIngressServer({
        ingress: {
          providers: {
            fixture: {
              receive: async request => {
                receivedBody = await request.text();
                return {
                  kind: 'accepted',
                  provider: 'fixture',
                  event: 'import',
                  deliveryId: 'delivery-1',
                  payload: JSON.parse(receivedBody) as unknown,
                  status: 202,
                };
              },
            },
          },
          operations: {
            routes: [
              {
                operationId: 'Todo.import',
                method: 'POST',
                route: '/hooks/import',
                provider: 'fixture',
              },
            ],
            dispatcher,
          },
        },
      }),
    );

    const response = await fetch(`${origin}/hooks/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"source":"node-http"}',
    });

    expect(response.status).toBe(202);
    expect(receivedBody).toBe('{"source":"node-http"}');
    expect(dispatcher).toHaveBeenCalledWith({
      kind: 'invoke',
      operationId: 'Todo.import',
      input: { source: 'node-http' },
    });
  });

  it('bounds request bodies and sanitizes unexpected failures', async () => {
    const reportError = vi.fn();
    const limitedOrigin = await listen(
      createNodeHttpServer({
        bodyLimitBytes: 3,
        handle: vi.fn(),
        reportError,
      }),
    );
    const failingOrigin = await listen(
      createNodeHttpServer({
        handle: async () => {
          throw new Error('private failure');
        },
        reportError,
      }),
    );

    const limited = await fetch(limitedOrigin, { method: 'POST', body: 'large' });
    const failed = await fetch(failingOrigin, { method: 'POST', body: 'ok' });

    expect(limited.status).toBe(413);
    await expect(limited.json()).resolves.toEqual({
      ok: false,
      error: 'HTTP request body is too large.',
    });
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      ok: false,
      error: 'HTTP ingress is temporarily unavailable.',
    });
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it('validates its body limit before creating the server', () => {
    expect(() => createNodeHttpServer({ handle: vi.fn(), bodyLimitBytes: 0 })).toThrow(
      'positive safe integer',
    );
  });
});
