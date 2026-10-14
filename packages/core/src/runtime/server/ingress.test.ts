import { describe, expect, it, vi } from 'vitest';

import { graphSchema } from '../../data-graph/index.js';

import {
  createEventApplication,
  createInMemoryEventRuntime,
  eventDeclaration,
} from './events/index.js';
import {
  createGraphHttpEventIngressDispatcher,
  createGraphHttpEventIngressRouter,
  createGraphHttpIngressOperationDispatcher,
  createGraphHttpIngressRoute,
  createGraphHttpIngressRouter,
} from './ingress.js';

const ExportReady = eventDeclaration.define({
  id: 'TodoListExportReady',
  version: 1,
  description: 'A requested Todo export is ready.',
  payload: graphSchema.object({
    requestId: graphSchema.string(),
    url: graphSchema.string(),
  }),
});

describe('createGraphHttpIngressRoute', () => {
  it('returns accepted provider outcomes as JSON responses', async () => {
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'accepted',
          provider: 'fixture',
          event: 'push',
          deliveryId: 'delivery-1',
          status: 202,
          details: {
            accepted: true,
          },
        }),
      },
    });

    const response = await route(new Request('http://localhost/api/ingress/fixture'));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      provider: 'fixture',
      event: 'push',
      deliveryId: 'delivery-1',
      accepted: true,
    });
  });

  it('returns rejected provider outcomes as JSON errors', async () => {
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'rejected',
          status: 401,
          error: 'Invalid signature',
        }),
      },
    });

    const response = await route(new Request('http://localhost/api/ingress/fixture'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid signature',
    });
  });

  it('dispatches accepted outcomes to matching graph ingress routes', async () => {
    const dispatched: unknown[] = [];
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'accepted',
          provider: 'fixture',
          providerKey: 'fixture-webhook',
          channel: 'source-control.push',
          event: 'push',
          deliveryId: 'delivery-1',
          payload: { branch: 'main' },
          status: 202,
        }),
      },
      route: '/api/ingress/fixture',
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      dispatch: async input => {
        dispatched.push(input);
      },
    });

    const response = await route(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(202);
    expect(dispatched).toEqual([
      {
        operationId: 'Book.syncFromFixturePush',
        payload: { branch: 'main' },
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      },
    ]);
  });

  it('returns a JSON failure when a matched ingress operation fails', async () => {
    const route = createGraphHttpIngressRoute({
      provider: {
        receive: async () => ({
          kind: 'accepted',
          provider: 'fixture',
          providerKey: 'fixture-webhook',
          channel: 'source-control.push',
          event: 'push',
          deliveryId: 'delivery-1',
        }),
      },
      route: '/api/ingress/fixture',
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      dispatch: async () => {
        throw new Error('Sync failed');
      },
    });

    const response = await route(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Sync failed',
    });
  });
});

describe('createGraphHttpIngressRouter', () => {
  it('returns 404 before provider parsing when no route matches the request', async () => {
    const router = createGraphHttpIngressRouter({
      routes: [],
      providers: {
        fixture: {
          receive: async () => {
            throw new Error('provider should not be called');
          },
        },
      },
      dispatch: async () => {
        throw new Error('dispatch should not be called');
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/ingress/missing', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'No HTTP ingress route matches this request.',
    });
  });

  it('returns a configuration error when the matched provider is not registered', async () => {
    const router = createGraphHttpIngressRouter({
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      providers: {},
      dispatch: async () => {
        throw new Error('dispatch should not be called');
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'HTTP ingress provider "fixture-webhook" is not registered.',
    });
  });

  it('uses the matched route provider and dispatches the matching graph operation', async () => {
    const dispatched: unknown[] = [];
    const router = createGraphHttpIngressRouter({
      routes: [
        {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      ],
      providers: {
        'fixture-webhook': {
          receive: async () => ({
            kind: 'accepted',
            provider: 'fixture',
            providerKey: 'fixture-webhook',
            channel: 'source-control.push',
            event: 'push',
            deliveryId: 'delivery-1',
            payload: { branch: 'main' },
          }),
        },
      },
      dispatch: async input => {
        dispatched.push(input);
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/ingress/fixture', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(dispatched).toEqual([
      {
        operationId: 'Book.syncFromFixturePush',
        payload: { branch: 'main' },
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
          provider: 'fixture-webhook',
          channel: 'source-control.push',
        },
      },
    ]);
  });
});

describe('createGraphHttpIngressOperationDispatcher', () => {
  it('invokes operations through the canonical dispatcher', async () => {
    const invocationCalls: unknown[] = [];
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async request => {
        invocationCalls.push(request);
        return {
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: undefined },
        };
      },
    });

    await dispatch({
      operationId: 'Book.syncFromFixturePush',
      payload: { branch: 'main' },
      route: {
        operationId: 'Book.syncFromFixturePush',
        method: 'POST',
        route: '/api/ingress/fixture',
      },
    });

    expect(invocationCalls).toEqual([
      {
        kind: 'invoke',
        operationId: 'Book.syncFromFixturePush',
        input: { branch: 'main' },
      },
    ]);
  });

  it('fails when the dispatcher rejects the operation id', async () => {
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async request => ({
        kind: 'invocation-result',
        result: {
          ok: false,
          kind: 'rejected',
          executed: false,
          reason: 'unknown_operation',
          message: `Unknown operation "${request.operationId}".`,
        },
      }),
    });

    await expect(
      dispatch({
        operationId: 'Book.missing',
        payload: {},
        route: {
          operationId: 'Book.missing',
          method: 'POST',
          route: '/api/ingress/fixture',
        },
      }),
    ).rejects.toThrow('Unknown operation "Book.missing".');
  });

  it('fails when operation invocation returns a failed result', async () => {
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async () => ({
        kind: 'invocation-result',
        result: {
          ok: false,
          kind: 'failed',
          executed: true,
          failure: { reason: 'sync_failed' },
          message: 'Sync failed',
        },
      }),
    });

    await expect(
      dispatch({
        operationId: 'Book.syncFromFixturePush',
        payload: {},
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
        },
      }),
    ).rejects.toThrow('Sync failed');
  });

  it('fails when the operation invocation transport is unavailable', async () => {
    const dispatch = createGraphHttpIngressOperationDispatcher({
      dispatcher: async () => ({
        kind: 'protocol-error',
        error: {
          code: 'invocation_unavailable',
          message: 'Runtime unavailable',
        },
      }),
    });

    await expect(
      dispatch({
        operationId: 'Book.syncFromFixturePush',
        payload: {},
        route: {
          operationId: 'Book.syncFromFixturePush',
          method: 'POST',
          route: '/api/ingress/fixture',
        },
      }),
    ).rejects.toThrow('Runtime unavailable');
  });
});

describe('HTTP Event ingress', () => {
  const route = {
    eventId: ExportReady.id,
    eventVersion: ExportReady.version,
    method: 'POST',
    route: '/api/events/export-ready',
    provider: 'fixture-webhook',
    channel: 'todo.export-ready',
  } as const;

  const accepted = (overrides: Record<string, unknown> = {}) => ({
    kind: 'accepted' as const,
    provider: 'fixture',
    providerKey: 'fixture-webhook',
    channel: 'todo.export-ready',
    event: 'export.ready',
    deliveryId: 'delivery-1',
    correlation: { requestId: 'request-1' },
    payload: { requestId: 'request-1', url: 'https://example.test/export/1' },
    ...overrides,
  });

  const setup = (receive: () => Promise<ReturnType<typeof accepted>>) => {
    let sequence = 0;
    const runtime = createInMemoryEventRuntime({
      createId: () => `ingress-${++sequence}`,
      now: () => new Date('2026-10-14T04:00:01.000Z'),
    });
    const events = createEventApplication({ declarations: [ExportReady], runtime });
    const deliveries: unknown[] = [];
    events.api.subscribe(ExportReady, delivery => {
      deliveries.push(delivery);
    });
    const router = createGraphHttpEventIngressRouter({
      routes: [route],
      providers: { 'fixture-webhook': { receive } },
      dispatch: createGraphHttpEventIngressDispatcher({
        events: events.api,
        now: () => new Date('2026-10-14T04:00:00.000Z'),
      }),
    });
    return { router, runtime, deliveries };
  };

  it('turns an authenticated normalized provider outcome into the declared Event', async () => {
    const { router, deliveries } = setup(async () => accepted());

    const response = await router.handle(
      new Request('http://localhost/api/events/export-ready', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      occurrenceId: 'ingress-2',
      eventId: ExportReady.id,
      eventVersion: ExportReady.version,
    });
    expect(deliveries).toEqual([
      expect.objectContaining({
        occurrence: expect.objectContaining({
          occurrenceId: 'ingress-2',
          payload: { requestId: 'request-1', url: 'https://example.test/export/1' },
          causation: {
            kind: 'ingress',
            provider: 'fixture',
            event: 'export.ready',
            deliveryId: 'delivery-1',
            receivedAt: '2026-10-14T04:00:00.000Z',
          },
          correlation: { requestId: 'request-1' },
        }),
      }),
    ]);
  });

  it('rejects unauthenticated and unauthorized provider outcomes before publication', async () => {
    const rejectedProvider = vi.fn(async () => ({
      kind: 'rejected' as const,
      status: 401,
      error: 'Invalid signature',
    }));
    const runtime = createInMemoryEventRuntime();
    const events = createEventApplication({ declarations: [ExportReady], runtime });
    const subscriber = vi.fn();
    events.api.subscribe(ExportReady, subscriber);
    const rejected = createGraphHttpEventIngressRouter({
      routes: [route],
      providers: { 'fixture-webhook': { receive: rejectedProvider } },
      dispatch: createGraphHttpEventIngressDispatcher({ events: events.api }),
    });
    const rejectedResponse = await rejected.handle(
      new Request('http://localhost/api/events/export-ready', { method: 'POST' }),
    );
    expect(rejectedResponse.status).toBe(401);

    const unauthorized = createGraphHttpEventIngressRouter({
      routes: [route],
      providers: {
        'fixture-webhook': {
          receive: async () => accepted({ channel: 'repository.deleted' }),
        },
      },
      dispatch: createGraphHttpEventIngressDispatcher({ events: events.api }),
    });
    const unauthorizedResponse = await unauthorized.handle(
      new Request('http://localhost/api/events/export-ready', { method: 'POST' }),
    );
    expect(unauthorizedResponse.status).toBe(403);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('keeps ignored provider deliveries and unknown routes outside the Event Runtime', async () => {
    const events = createEventApplication({
      declarations: [ExportReady],
      runtime: createInMemoryEventRuntime(),
    });
    const subscriber = vi.fn();
    events.api.subscribe(ExportReady, subscriber);
    const router = createGraphHttpEventIngressRouter({
      routes: [route],
      providers: {
        'fixture-webhook': {
          receive: async () => ({
            kind: 'ignored',
            provider: 'fixture',
            providerKey: 'fixture-webhook',
            channel: 'todo.export-ready',
            event: 'ping',
            deliveryId: 'delivery-ping',
          }),
        },
      },
      dispatch: createGraphHttpEventIngressDispatcher({ events: events.api }),
    });

    const ignored = await router.handle(
      new Request('http://localhost/api/events/export-ready', { method: 'POST' }),
    );
    expect(ignored.status).toBe(202);
    await expect(ignored.json()).resolves.toMatchObject({ ok: true, ignored: true });

    const missing = await router.handle(
      new Request('http://localhost/api/events/missing', { method: 'POST' }),
    );
    expect(missing.status).toBe(404);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'invalid payload',
      route,
      outcome: accepted({ payload: { requestId: 'request-1' } }),
      message: 'Invalid payload',
    },
    {
      name: 'stale declaration',
      route: { ...route, eventVersion: 2 },
      outcome: accepted(),
      message: 'requires version 1',
    },
  ])(
    'rejects $name without creating an occurrence',
    async ({ route: target, outcome, message }) => {
      const events = createEventApplication({
        declarations: [ExportReady],
        runtime: createInMemoryEventRuntime(),
      });
      const subscriber = vi.fn();
      events.api.subscribe(ExportReady, subscriber);
      const router = createGraphHttpEventIngressRouter({
        routes: [target],
        providers: { 'fixture-webhook': { receive: async () => outcome } },
        dispatch: createGraphHttpEventIngressDispatcher({ events: events.api }),
      });

      const response = await router.handle(
        new Request('http://localhost/api/events/export-ready', { method: 'POST' }),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining(message),
      });
      expect(subscriber).not.toHaveBeenCalled();
    },
  );

  it('preserves duplicate delivery provenance without claiming runtime deduplication', async () => {
    const { router, runtime, deliveries } = setup(async () => accepted());

    const request = () =>
      router.handle(new Request('http://localhost/api/events/export-ready', { method: 'POST' }));
    await request();
    await request();

    expect(runtime.capabilities.deduplication).toBe(false);
    expect(deliveries).toHaveLength(2);
    expect(
      deliveries.map(
        delivery => (delivery as { occurrence: { occurrenceId: string } }).occurrence.occurrenceId,
      ),
    ).toEqual(['ingress-2', 'ingress-4']);
    expect(
      deliveries.map(
        delivery =>
          (delivery as { occurrence: { causation: { deliveryId: string } } }).occurrence.causation
            .deliveryId,
      ),
    ).toEqual(['delivery-1', 'delivery-1']);
  });

  it('distinguishes invalid ingress from Event Runtime publication failure', async () => {
    const router = createGraphHttpEventIngressRouter({
      routes: [route],
      providers: { 'fixture-webhook': { receive: async () => accepted() } },
      dispatch: async () => {
        throw new Error('Event Runtime unavailable');
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/events/export-ready', { method: 'POST' }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Event Runtime unavailable',
    });
  });
});
