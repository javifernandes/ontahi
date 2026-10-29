import { createHmac } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';

import type { EventEgressAttempt } from '@ontahi/core/runtime/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpEventEgressTransport, type HttpEventEgressDestination } from './event-egress.js';

const attempt = (
  destination: HttpEventEgressDestination,
): EventEgressAttempt<HttpEventEgressDestination> => ({
  subscriptionId: 'customer-export-webhook',
  eventId: 'todo.list-export-ready',
  eventVersion: 2,
  occurrenceId: 'occurrence-1',
  deliveryId: 'delivery-1',
  attempt: 3,
  destinationId: 'customer-webhook',
  destination,
  body: { exportId: 'export-1', ready: true },
});

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))),
  );
});

const listen = async (handler: RequestListener) => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing server address.');
  return `http://127.0.0.1:${address.port}`;
};

describe('HTTP Event egress transport', () => {
  it('posts exact signed bytes and stable delivery headers to a local receiver', async () => {
    let receiverResolve!: (value: {
      body: string;
      headers: Record<string, string | string[] | undefined>;
    }) => void;
    const received = new Promise<{
      body: string;
      headers: Record<string, string | string[] | undefined>;
    }>(resolve => {
      receiverResolve = resolve;
    });
    const url = await listen((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        receiverResolve({ body: Buffer.concat(chunks).toString('utf8'), headers: request.headers });
        response.writeHead(204).end();
      });
    });
    const secret = 'not-a-client-secret';

    const result = await createHttpEventEgressTransport().deliver(
      attempt({
        url,
        headers: { authorization: 'Bearer private', 'x-customer': 'customer-1' },
        signing: { kind: 'hmac-sha256', secret },
      }),
    );
    const request = await received;

    expect(result).toEqual({ kind: 'accepted' });
    expect(request.body).toBe('{"exportId":"export-1","ready":true}');
    expect(request.headers).toMatchObject({
      authorization: 'Bearer private',
      'content-type': 'application/json',
      'idempotency-key': 'delivery-1',
      'x-customer': 'customer-1',
      'x-ontahi-attempt': '3',
      'x-ontahi-delivery-id': 'delivery-1',
      'x-ontahi-event-id': 'todo.list-export-ready',
      'x-ontahi-event-version': '2',
      'x-ontahi-occurrence-id': 'occurrence-1',
      'x-ontahi-subscription-id': 'customer-export-webhook',
      'x-ontahi-signature': `sha256=${createHmac('sha256', secret)
        .update(request.body)
        .digest('hex')}`,
    });
  });

  it.each([408, 429, 500, 503])('classifies HTTP %s as retryable', async status => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(
        new Response('try later', {
          status,
          headers: status === 429 ? { 'retry-after': '2.5' } : undefined,
        }),
      ),
    );

    await expect(
      createHttpEventEgressTransport({ fetch: fetchImplementation }).deliver(
        attempt({ url: 'https://receiver.example/events' }),
      ),
    ).resolves.toEqual({
      kind: 'retryable',
      reason: `http-status-${status}`,
      ...(status === 429 ? { retryAfterMs: 2_500 } : {}),
    });
  });

  it('parses an HTTP-date Retry-After value', async () => {
    const retryAt = new Date(Date.now() + 10_000).toUTCString();
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response(null, { status: 503, headers: { 'retry-after': retryAt } })),
    );

    const result = await createHttpEventEgressTransport({ fetch: fetchImplementation }).deliver(
      attempt({ url: 'https://receiver.example/events' }),
    );

    expect(result.kind).toBe('retryable');
    if (result.kind !== 'retryable') throw new Error('Expected retryable result.');
    expect(result.retryAfterMs).toBeGreaterThan(8_000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it('keeps an immediate Retry-After from becoming a zero-delay claim loop', async () => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response(null, { status: 429, headers: { 'retry-after': '0' } })),
    );

    await expect(
      createHttpEventEgressTransport({ fetch: fetchImplementation }).deliver(
        attempt({ url: 'https://receiver.example/events' }),
      ),
    ).resolves.toEqual({ kind: 'retryable', reason: 'http-status-429', retryAfterMs: 1 });
  });

  it('ignores an empty Retry-After hint', async () => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response(null, { status: 503, headers: { 'retry-after': ' ' } })),
    );

    await expect(
      createHttpEventEgressTransport({ fetch: fetchImplementation }).deliver(
        attempt({ url: 'https://receiver.example/events' }),
      ),
    ).resolves.toEqual({ kind: 'retryable', reason: 'http-status-503' });
  });

  it('normalizes network and timeout failures without exposing their messages', async () => {
    const networkFetch = vi.fn(async () => Promise.reject(new Error('private DNS details')));
    const timeoutFetch = vi.fn<typeof globalThis.fetch>(async () => {
      const error = new DOMException('private timeout details', 'TimeoutError');
      return Promise.reject(error);
    });

    await expect(
      createHttpEventEgressTransport({ fetch: networkFetch }).deliver(
        attempt({ url: 'https://receiver.example/events' }),
      ),
    ).resolves.toEqual({ kind: 'retryable', reason: 'http-network-error' });
    await expect(
      createHttpEventEgressTransport({ fetch: timeoutFetch }).deliver(
        attempt({ url: 'https://receiver.example/events' }),
      ),
    ).resolves.toEqual({ kind: 'retryable', reason: 'http-timeout' });
  });

  it.each([300, 400, 401, 404])('classifies terminal HTTP %s as rejected', async status => {
    const fetchImplementation = vi.fn(async () => Promise.resolve(new Response(null, { status })));

    await expect(
      createHttpEventEgressTransport({ fetch: fetchImplementation }).deliver(
        attempt({ url: 'https://receiver.example/events' }),
      ),
    ).resolves.toEqual({ kind: 'rejected', reason: `http-status-${status}` });
  });

  it('uses manual redirects and protects transport-owned headers from overrides', async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async () =>
      Promise.resolve(new Response(null, { status: 204 })),
    );

    await createHttpEventEgressTransport({ fetch: fetchImplementation }).deliver(
      attempt({
        url: 'https://receiver.example/events',
        headers: { 'content-type': 'text/plain', 'idempotency-key': 'wrong' },
      }),
    );

    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toEqual(new URL('https://receiver.example/events'));
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe('delivery-1');
  });

  it.each([
    [{ url: 'file:///private/events' }, 'must use http or https'],
    [{ url: 'https://user:password@receiver.example/events' }, 'must not contain credentials'],
    [{ url: 'https://receiver.example/events', timeoutMs: 0 }, 'positive finite number'],
    [
      {
        url: 'https://receiver.example/events',
        signing: { kind: 'hmac-sha256', secret: 'secret', headerName: 'bad header' },
      },
      'invalid header name',
    ],
  ] as const)('rejects invalid destinations', async (destination, message) => {
    await expect(
      createHttpEventEgressTransport({ fetch: vi.fn() }).deliver(
        attempt(destination as HttpEventEgressDestination),
      ),
    ).rejects.toThrow(message);
  });

  it('validates transport defaults when the adapter is constructed', () => {
    expect(() => createHttpEventEgressTransport({ defaultTimeoutMs: Number.NaN })).toThrow(
      'positive finite number',
    );
  });
});
