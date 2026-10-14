import { graphSchema } from '@ontahi/core/data-graph';
import {
  createEventApplication,
  createInMemoryEventRuntime,
  eventDeclaration,
} from '@ontahi/core/runtime/server';
import { describe, expect, it, vi } from 'vitest';

import { createNextEventIngressRouteHandler } from './index.js';

const ExportReady = eventDeclaration.define({
  id: 'TodoListExportReady',
  version: 1,
  description: 'A requested Todo export is ready.',
  payload: graphSchema.object({
    requestId: graphSchema.string(),
    url: graphSchema.string(),
  }),
});

const route = {
  eventId: ExportReady.id,
  eventVersion: ExportReady.version,
  method: 'POST',
  route: '/api/events/export-ready',
  provider: 'fixture-webhook',
  channel: 'todo.export-ready',
} as const;

const request = (body: string, signature = 'valid') =>
  new Request('http://localhost/api/events/export-ready', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fixture-signature': signature,
    },
    body,
  });

const eventFixture = () => {
  let sequence = 0;
  const eventApplication = createEventApplication({
    declarations: [ExportReady],
    runtime: createInMemoryEventRuntime({
      createId: () => `next-event-${++sequence}`,
      now: () => new Date('2026-10-14T06:00:01.000Z'),
    }),
  });
  const subscriber = vi.fn();
  eventApplication.api.subscribe(ExportReady, subscriber);
  return { events: eventApplication.api, subscriber };
};

describe('Next.js Event ingress route adapter', () => {
  it('preserves the raw request and ingests an authenticated normalized Event', async () => {
    const { events, subscriber } = eventFixture();
    let received: { body: string; signature: string | null } | undefined;
    const handler = createNextEventIngressRouteHandler({
      events,
      route,
      providers: {
        'fixture-webhook': {
          receive: async providerRequest => {
            received = {
              body: await providerRequest.text(),
              signature: providerRequest.headers.get('x-fixture-signature'),
            };
            return {
              kind: 'accepted',
              provider: 'fixture',
              providerKey: 'fixture-webhook',
              channel: 'todo.export-ready',
              event: 'export.ready',
              deliveryId: 'delivery-1',
              correlation: { requestId: 'request-1' },
              payload: JSON.parse(received.body) as unknown,
              status: 202,
            };
          },
        },
      },
    });
    const body = JSON.stringify({
      requestId: 'request-1',
      url: 'https://example.test/export/1',
    });

    const response = await handler(request(body));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      provider: 'fixture',
      event: 'export.ready',
      deliveryId: 'delivery-1',
      occurrenceId: 'next-event-2',
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
    });
    expect(received).toEqual({ body, signature: 'valid' });
    expect(subscriber).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrence: expect.objectContaining({
          occurrenceId: 'next-event-2',
          payload: { requestId: 'request-1', url: 'https://example.test/export/1' },
          causation: {
            kind: 'ingress',
            provider: 'fixture',
            event: 'export.ready',
            deliveryId: 'delivery-1',
            receivedAt: expect.any(String),
          },
          correlation: { requestId: 'request-1' },
        }),
      }),
    );
  });

  it.each([
    {
      name: 'rejected authentication',
      expectedStatus: 401,
      outcome: {
        kind: 'rejected' as const,
        status: 401,
        error: 'Invalid signature',
      },
    },
    {
      name: 'unauthorized channel',
      expectedStatus: 403,
      outcome: {
        kind: 'accepted' as const,
        provider: 'fixture',
        providerKey: 'fixture-webhook',
        channel: 'repository.deleted',
        event: 'deleted',
        deliveryId: 'delivery-2',
        payload: { requestId: 'request-1', url: 'https://example.test/export/1' },
      },
    },
    {
      name: 'invalid payload',
      expectedStatus: 400,
      outcome: {
        kind: 'accepted' as const,
        provider: 'fixture',
        providerKey: 'fixture-webhook',
        channel: 'todo.export-ready',
        event: 'export.ready',
        deliveryId: 'delivery-3',
        payload: { requestId: 'request-1' },
      },
    },
    {
      name: 'ignored delivery',
      expectedStatus: 202,
      outcome: {
        kind: 'ignored' as const,
        provider: 'fixture',
        providerKey: 'fixture-webhook',
        channel: 'todo.export-ready',
        event: 'ping',
        deliveryId: 'delivery-4',
      },
    },
  ])('keeps $name outside the Event Runtime', async ({ outcome, expectedStatus }) => {
    const { events, subscriber } = eventFixture();
    const handler = createNextEventIngressRouteHandler({
      events,
      route,
      providers: { 'fixture-webhook': { receive: async () => outcome } },
    });

    const response = await handler(request('{}'));

    expect(response.status).toBe(expectedStatus);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('rejects a stale declaration version without creating an occurrence', async () => {
    const { events, subscriber } = eventFixture();
    const handler = createNextEventIngressRouteHandler({
      events,
      route: { ...route, eventVersion: 2 },
      providers: {
        'fixture-webhook': {
          receive: async () => ({
            kind: 'accepted',
            provider: 'fixture',
            providerKey: 'fixture-webhook',
            channel: 'todo.export-ready',
            event: 'export.ready',
            deliveryId: 'delivery-stale',
            payload: { requestId: 'request-1', url: 'https://example.test/export/1' },
          }),
        },
      },
    });

    const response = await handler(request('{}'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Event TodoListExportReady requires version 1; received 2.',
    });
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('reports provider failures without exposing their cause', async () => {
    const { events, subscriber } = eventFixture();
    const failure = new Error('webhook secret and internal details');
    const reportError = vi.fn();
    const handler = createNextEventIngressRouteHandler({
      events,
      route,
      providers: {
        'fixture-webhook': {
          receive: async () => Promise.reject(failure),
        },
      },
      reportError,
    });
    const incoming = request('{}');

    const response = await handler(incoming);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Event ingress is temporarily unavailable.',
    });
    expect(reportError).toHaveBeenCalledWith(failure, incoming);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('sanitizes Event Runtime failures while preserving their internal diagnostic', async () => {
    const { events, subscriber } = eventFixture();
    const failure = new Error('database host and internal Event Runtime details');
    const reportError = vi.fn();
    const handler = createNextEventIngressRouteHandler({
      events: {
        ...events,
        ingestByIdentity: async () => Promise.reject(failure),
      },
      route,
      providers: {
        'fixture-webhook': {
          receive: async () => ({
            kind: 'accepted',
            provider: 'fixture',
            providerKey: 'fixture-webhook',
            channel: 'todo.export-ready',
            event: 'export.ready',
            deliveryId: 'delivery-runtime-failure',
            payload: { requestId: 'request-1', url: 'https://example.test/export/1' },
          }),
        },
      },
      reportError,
    });
    const incoming = request('{}');

    const response = await handler(incoming);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Event ingress is temporarily unavailable.',
    });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), incoming);
    expect((reportError.mock.calls[0]?.[0] as Error).message).toBe(failure.message);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('falls back to a server diagnostic when no reporter is configured', async () => {
    const { events } = eventFixture();
    const failure = new Error('provider unavailable');
    const consoleError = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const handler = createNextEventIngressRouteHandler({
      events,
      route,
      providers: {
        'fixture-webhook': {
          receive: async () => Promise.reject(failure),
        },
      },
    });

    const response = await handler(request('{}'));

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith('Ontahi Next.js Event ingress failed.', failure);
    consoleError.mockRestore();
  });

  it('rejects requests that do not match the configured route before calling the provider', async () => {
    const { events, subscriber } = eventFixture();
    const receive = vi.fn();
    const handler = createNextEventIngressRouteHandler({
      events,
      route,
      providers: { 'fixture-webhook': { receive } },
    });

    const response = await handler(
      new Request('http://localhost/api/events/other', { method: 'POST' }),
    );

    expect(response.status).toBe(404);
    expect(receive).not.toHaveBeenCalled();
    expect(subscriber).not.toHaveBeenCalled();
  });
});
