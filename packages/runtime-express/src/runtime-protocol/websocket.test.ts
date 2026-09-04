import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';

import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolDispatcher,
  type RuntimeProtocolRequestEnvelope,
} from '@ontahi/core/runtime/protocol';
import type { JsonValue } from '@ontahi/core/value/json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { createExpressRuntimeProtocolWebSocketServer } from './websocket.js';

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/runtime`;
};

const open = (webSocket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    webSocket.once('open', resolve);
    webSocket.once('error', reject);
  });

const createMessageReader = (webSocket: WebSocket) => {
  const queued: unknown[] = [];
  const waiting: Array<(message: unknown) => void> = [];
  webSocket.on('message', data => {
    const message: unknown = JSON.parse(data.toString());
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else queued.push(message);
  });
  return () => {
    const message = queued.shift();
    if (message !== undefined) return Promise.resolve(message);
    return new Promise<unknown>(resolve => waiting.push(resolve));
  };
};

const requestFrame = (id: string, family: string) => ({
  protocol: 'ontahi.runtime.session',
  version: 1,
  kind: 'request',
  request: {
    protocol: 'ontahi.runtime',
    version: 1,
    id,
    kind: 'request',
    family,
    body: { version: 1, kind: 'invoke', operationId: 'Todo.completeAll' },
  },
});

describe('Express Runtime Protocol WebSocket server', () => {
  const servers: Server[] = [];
  const sockets: WebSocket[] = [];
  const adapters: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    await Promise.all(adapters.map(adapter => adapter.close()));
    await Promise.all(
      servers.map(
        server =>
          new Promise<void>(resolve => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
  });

  it('derives receiver authority once and multiplexes out-of-order family responses', async () => {
    const server = createServer();
    servers.push(server);
    const pending = new Map<string, (value: JsonValue) => void>();
    const observedContexts: unknown[] = [];
    const dispatcher: RuntimeProtocolDispatcher<{ principal: string | null }> = (
      input,
      context,
    ) => {
      const request = input as RuntimeProtocolRequestEnvelope;
      observedContexts.push(context);
      return new Promise(resolve => {
        pending.set(request.id, body => resolve(createRuntimeProtocolResponse(request, body)));
      });
    };
    const adapter = createExpressRuntimeProtocolWebSocketServer({
      server,
      dispatcher,
      path: '/runtime////',
      context: request => ({
        principal:
          request.headers['x-test-principal'] === 'github-user-123' ? 'github-user-123' : null,
      }),
    });
    adapters.push(adapter);
    const url = await listen(server);
    const webSocket = new WebSocket(url, {
      headers: { 'x-test-principal': 'github-user-123' },
    });
    sockets.push(webSocket);
    const nextMessage = createMessageReader(webSocket);
    await open(webSocket);
    await expect(nextMessage()).resolves.toMatchObject({
      kind: 'ready',
      capabilities: ['request-response'],
    });

    webSocket.send(JSON.stringify(requestFrame('request-1', 'operation')));
    webSocket.send(JSON.stringify(requestFrame('request-2', 'graph.command')));
    await vi.waitFor(() => expect(pending.size).toBe(2));
    const secondResponse = nextMessage();
    pending.get('request-2')?.({ source: 'graph.command' });
    await expect(secondResponse).resolves.toMatchObject({
      kind: 'response',
      response: { id: 'request-2', family: 'graph.command' },
    });
    const firstResponse = nextMessage();
    pending.get('request-1')?.({ source: 'operation' });
    await expect(firstResponse).resolves.toMatchObject({
      kind: 'response',
      response: { id: 'request-1', family: 'operation' },
    });
    expect(observedContexts).toEqual([
      { principal: 'github-user-123' },
      { principal: 'github-user-123' },
    ]);
  });

  it('keeps malformed input recoverable and releases pushed observation on unsubscribe', async () => {
    const server = createServer();
    servers.push(server);
    let observationSignal: AbortSignal | undefined;
    const adapter = createExpressRuntimeProtocolWebSocketServer({
      server,
      dispatcher: async input =>
        createRuntimeProtocolResponse(input as RuntimeProtocolRequestEnvelope, null),
      context: () => ({ principal: null }),
      observeDurableOperation: (_run, { signal }) =>
        (async function* () {
          observationSignal = signal;
          yield {
            taskId: 'Todo.completeAll',
            runId: 'run-1',
            status: 'running' as const,
            updatedAt: '2026-09-04T00:00:00.000Z',
            progress: { phase: 'updating' },
          };
          if (!signal.aborted) {
            await new Promise<void>(resolve =>
              signal.addEventListener('abort', () => resolve(), { once: true }),
            );
          }
        })(),
    });
    adapters.push(adapter);
    const webSocket = new WebSocket(await listen(server));
    sockets.push(webSocket);
    const nextMessage = createMessageReader(webSocket);
    await open(webSocket);
    await nextMessage();

    const invalid = nextMessage();
    webSocket.send('{not json');
    await expect(invalid).resolves.toMatchObject({
      kind: 'session-error',
      error: { code: 'invalid_frame' },
    });

    const progress = nextMessage();
    webSocket.send(
      JSON.stringify({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-observe',
        id: 'observation-1',
        run: { taskId: 'Todo.completeAll', runId: 'run-1' },
      }),
    );
    await expect(progress).resolves.toMatchObject({
      kind: 'durable-observation',
      id: 'observation-1',
      body: { snapshot: { status: 'running', progress: { phase: 'updating' } } },
    });
    webSocket.send(
      JSON.stringify({
        protocol: 'ontahi.runtime.session',
        version: 1,
        kind: 'durable-unobserve',
        id: 'observation-1',
      }),
    );
    await vi.waitFor(() => expect(observationSignal?.aborted).toBe(true));

    const response = nextMessage();
    webSocket.send(JSON.stringify(requestFrame('request-after-errors', 'operation')));
    await expect(response).resolves.toMatchObject({
      kind: 'response',
      response: { id: 'request-after-errors' },
    });
  });

  it('lets the host reject a cross-origin upgrade before resolving session context', async () => {
    const server = createServer();
    servers.push(server);
    const context = vi.fn(() => ({ principal: null }));
    const adapter = createExpressRuntimeProtocolWebSocketServer({
      server,
      dispatcher: async input =>
        createRuntimeProtocolResponse(input as RuntimeProtocolRequestEnvelope, null),
      authorizeUpgrade: request => request.headers.origin === 'https://todo.example',
      context,
    });
    adapters.push(adapter);
    const webSocket = new WebSocket(await listen(server), {
      origin: 'https://attacker.example',
    });
    sockets.push(webSocket);

    const status = await new Promise<number | undefined>((resolve, reject) => {
      webSocket.once('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode);
      });
      webSocket.once('open', () => reject(new Error('Expected the WebSocket upgrade to fail.')));
      webSocket.once('error', error => {
        if (webSocket.readyState !== WebSocket.CLOSED) reject(error);
      });
    });

    expect(status).toBe(403);
    expect(context).not.toHaveBeenCalled();
  });

  it('rejects unmatched and malformed upgrades when it owns the upgrade boundary', async () => {
    const server = createServer();
    servers.push(server);
    const adapter = createExpressRuntimeProtocolWebSocketServer({
      server,
      dispatcher: async input =>
        createRuntimeProtocolResponse(input as RuntimeProtocolRequestEnvelope, null),
      context: () => ({ principal: null }),
      ownsUpgradeBoundary: true,
    });
    adapters.push(adapter);
    const url = await listen(server);
    const webSocket = new WebSocket(url.replace('/runtime', '/not-runtime'));
    sockets.push(webSocket);

    const status = await new Promise<number | undefined>((resolve, reject) => {
      webSocket.once('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode);
      });
      webSocket.once('open', () => reject(new Error('Expected the WebSocket upgrade to fail.')));
      webSocket.once('error', error => {
        if (webSocket.readyState !== WebSocket.CLOSED) reject(error);
      });
    });
    expect(status).toBe(404);

    const malformedSocket = new PassThrough();
    let response = '';
    malformedSocket.on('data', chunk => {
      response += chunk.toString();
    });
    server.emit('upgrade', { url: 'http://[', headers: {} }, malformedSocket, Buffer.alloc(0));

    expect(response).toContain('400 Bad Request');
    expect(malformedSocket.destroyed).toBe(true);
  });
});
